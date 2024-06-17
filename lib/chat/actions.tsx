import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState
} from 'ai/rsc'
import { z } from 'zod'
import { RemoteRunnable } from "@langchain/core/runnables/remote"

import { BotCard, BotMessage } from '@/components/workouts-utils/message'
import { spinner } from '@/components/workouts-utils/spinner'
import { runAsyncFnWithoutBlocking, sleep, nanoid } from '@/lib/utils'
import { AIWorkoutType, Chat, Message, Workout, WorkoutInputSchema, WorkoutState } from '@/lib/types'
import { saveChat } from '@/app/actions'
import { UserMessage } from '@/components/workouts-utils/message'
import { WorkoutReviser } from '@/components/workouts/workout-reviser'
import { WorkoutFinal } from '@/components/workouts/workout-final'
import { auth } from '@/auth'

// The default state for generating workouts for the week
// All of the keys here match the pieces of state in the LangGraph graph
export const defaultWorkoutState = {
  day: 0,
  phase: 0,
  workouts_in_week: 0,
  workout_length: "",
  extra_criteria: "",
  current_workout: {},
  created_workouts: [],
  client_info: "",
  user_feedback: "",
  done: false,
  thread_id: ""
}

// The LangServe runanble endpoint to host the entire power
// of my LangGraph graph behind the /workout API endpoint
const runnable = new RemoteRunnable({
  url: `${process.env.REMOTE_RUNNABLE_URL}/workout/`,
});

/**
 * Invokes the LangServe runnable to create the first workout for the week based on the user input
 * @param {string | undefined} chatId - The ID of chat which is also used as the thread ID for the LangServe invocation to keep the same session through generating the workouts for a week
 * @param {z.infer<typeof WorkoutInputSchema>} inputData - All of the inputs for the LLM workout generation. The WorkoutInputSchema matches the state attributes of the LangGraph graph
 */
async function generateWorkout(chatId: string | undefined, inputData: z.infer<typeof WorkoutInputSchema>) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()  

  // Defines the UI that will be updated through the workout generating to provide immediate
  // feedback to the user that the workout is being generated
  const generatingWorkout = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Generating workout...
      </p>
    </div>
  )

  // Defines the piece of UI that will eventually be the form to revise the first workout
  // once it is generated from the LangServe endpoint
  const systemMessage = createStreamableUI(null)

  // Chat ID is used as the LangServe Thread ID so the workout session can be maintained
  const threadId = chatId || nanoid();

  runAsyncFnWithoutBlocking(async () => {
    // Defines all the inputs for the LangServe invocation based on the inputs to the initial workout form
    // All the keys in WorkoutState match the state for the LangGraph graph
    let state: WorkoutState = {
      day: 0,
      phase: parseInt(inputData.phase),
      workouts_in_week: parseInt(inputData.workoutsInWeek),
      workout_length: inputData.workoutLength,
      extra_criteria: `Has access to: ${inputData.gymEquipment}.\n Workout preferences: ${inputData.preferredWorkouts}`,
      current_workout: {},
      created_workouts: [],
      client_info: `Weight: ${inputData.weight}\nHeight: ${inputData.height}\nSex: ${inputData.sex}\nGoals: ${inputData.goals}`,
      user_feedback: "",
      done: false,
      thread_id: threadId
    };

    // Streams the events from calling the LangServe endpoint
    // as the agent generates the workout
    const logStream = await runnable.streamEvents(
      state,
      {
        version: "v1",
        configurable: {
          thread_id: threadId, recursion_limit: 25
        }
      }
    );

    // Loops through all events streamed from LangServe agents
    for await (const chunk of logStream) {
      if (chunk.data.output) {
        // All updates to the internal LangGraph state are pushed into the frontend state object to maintain consistency
        // of state between the backend and the frontend
        const newState = { ...state, ...Object.fromEntries(Object.entries(chunk.data.output).filter(([key]) => key in state)) };
        Object.assign(state, newState);
      }

      // Updates the loading UI to improve the UX for the user
      if (Object.keys(state.created_workouts)) {
        generatingWorkout.update(
          <div className="inline-flex items-start gap-1 md:items-center">
            {spinner}
            <p className="mb-2">
              Generating workout... Determining best exercises for client...
            </p>
          </div>
        )  
      }
    }

    // Once the workout is generated, reflect that in the loading UI
    generatingWorkout.done(
      <div>
        <p className="mb-2">
          Workout Generated!
        </p>
      </div>
    )

    // Set the system message to the form to display the generated workout
    // This system message is added on to the UI state in the form component that invokes this function
    systemMessage.done(
      <BotCard>
        <WorkoutReviser chatId={chatId} index={1000} day={state.day} workout={state.current_workout} />
      </BotCard>
    )

    // Updates the AI state with the workout generated
    state.input = {...inputData}
    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'tool',
          content: [{
            toolName: "generatedWorkout",
            state
          }]
        }
      ],
      workoutState: state
    })
  })

  return {
    workoutGenerateUI: generatingWorkout.value,
    newMessage: {
      id: nanoid(),
      input: inputData,
      stage: "generatedWorkout",
      display: systemMessage.value
    }
  }
}

/**
 * Invokes the LangServe runnable to revise the workout or generate the next workout (depends on the user feedback given)
 * @param {string | undefined} chatId - The ID of chat which is also used as the thread ID for the LangServe invocation to keep the same session through generating the workouts for a week
 * @param {string} userFeedback - The feedback user supplied to revise the workout. If it is CONTINUE, that means to not revise and move on to generating the workout for the next day
 * @param {Workout | undefined} currentWorkout - The current workout edited by the user with alternatives selected. If undefined, this function defaults to using the current workout produced by the LLM
 */
async function continueGeneratingWorkout(chatId: string | undefined, userFeedback: string, currentWorkout: Workout | undefined) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()  
  const messages = aiState.get().messages
  const lastMessage = messages[messages.length - 1]

  // Sets up the state to the current state of the graph but with the new
  // user feedback and the updated workout if alternatives were selected
  let state: WorkoutState = {
    ...defaultWorkoutState,
    ...Object.fromEntries(
      Object.entries(lastMessage.content[0].state).filter(
        ([key]) => key in defaultWorkoutState
      ) as [keyof WorkoutState, any][]
    ),
    user_feedback: userFeedback,
    current_workout: currentWorkout || lastMessage.content[0].state.currentWorkout
  };

  // Adds a user message to the AI state which includes the user feedback
  // or an empty string if revising without feedbak
  // or CONTINUE if moving on to the next day
  aiState.update({
    ...aiState.get(),
    messages: [
      ...messages,
      {
        id: nanoid(),
        role: 'tool',
        content: [{
          toolName: "userMessage",
          state
        }]
      }
    ]
  })  

  // Creates the UI to display that the workout is being revised or generated
  const generatingWorkout = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day..." : "Revising workout..."}
      </p>
    </div>
  )

  // Creates the UI to mimick a bot message to show that it is currently processing
  // the workout revision or generation
  const systemMessage = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day..." : "Revising workout..."}
      </p>
    </div>
  )

  // Chat ID is used as the LangServe Thread ID so the workout session can be maintained
  const threadId = chatId || nanoid();

  // Waits 2 seconds to allow the async AI state update function to run
  // to add the user message with the user feedback to the database
  // since the LangGraph agent fetches the user feedback from the database
  await sleep(2000);

  // Updates the loading UI to show that the next workout is being generated
  // or the current workout is being revised
  generatingWorkout.update(
    <div>
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day... Selecting best exercises..." : "Revising workout... Incorporating feedback..."}
      </p>
    </div>
  )  

  runAsyncFnWithoutBlocking(async () => {
    // Streams the events from the LangServe endpoint as the revision
    // agent or workout generator agent is running
    const logStream = await runnable.streamEvents(
      null,
      {
        version: "v1",
        configurable: {
          thread_id: threadId, recursion_limit: 25
        }
      }
    );

    // Loops through all events streamed from LangServe agents
    for await (const chunk of logStream) {
      if (chunk.data.output) {
        // All updates to the internal LangGraph state are pushed into the frontend state object to maintain consistency
        // of state between the backend and the frontend
        const newState = { 
          ...state, ...Object.fromEntries(Object.entries(chunk.data.output).filter(([key]) => key in state)) 
        };
        Object.assign(state, newState);
      }
    }

    // Once the workout is generated, reflect that in the loading UI
    generatingWorkout.done(
      <div>
        <p className="mb-2">
          {userFeedback === "CONTINUE" ? "Workout for the next day generated!" : "Workout revised!"}
        </p>
      </div>
    )

    // Set the system message to the form to display the generated/revised workout
    // This system message is added on to the UI state in the form component that invokes this function
    systemMessage.done(
      <BotCard>
        {
          state.done ? (
            <WorkoutFinal workouts={state.created_workouts} />
          )
          :
          (
            <WorkoutReviser chatId={chatId} index={1000} day={state.day} workout={state.current_workout} />
          )
        }
      </BotCard>
    )

    // Updates the AI state with the workout generated/revised
    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'tool',
          content: [{
            toolName: state.done ? "finalWorkouts" : "generatedWorkout",
            state
          }]
        }
      ],
      workoutState: state
    })
  })

  return {
    workoutGenerateUI: generatingWorkout.value,
    newMessage: {
      id: nanoid(),
      stage: userFeedback === "CONTINUE" ? "generatedWorkout" : "revisedWorkout",
      display: systemMessage.value
    }
  }
}

export type AIState = {
  chatId: string
  messages: (Message | AIWorkoutType)[]
  workoutState: WorkoutState
}

export type UIState = {
  id: string
  display: React.ReactNode
  input?: z.infer<typeof WorkoutInputSchema>
  stage: string
}[]

const uiState: UIState = [];
const aiState: AIState = { chatId: nanoid(), messages: [], workoutState: defaultWorkoutState };

// Creates the AI object that is used to generate and revise workouts
export const AI: any = createAI({
  actions: {
    generateWorkout,
    continueGeneratingWorkout
  },
  initialUIState: uiState,
  initialAIState: aiState,
  // When a chat initially loads, this function is called to create the UI
  // state based on the AI state that is saved in the database
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState()

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState as Chat)
        return uiState
      }
    } else {
      return
    }
  },
  // This function is called whenever the AI state is updated to save the AI
  // state to the database and create the new chat in the database if it is the first message
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      console.log(messages[0].content[0])
      const title = (messages[0].content[0] as any)?.state?.input?.title || `Workout ${chatId}`;

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

// This function transforms the AI state into the UI state, including the components
// for revising workouts, viewing the final set of workouts, and user/AI messages.
export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      // @ts-ignore
      input: message.content[0] ? {...message.content[0]?.state?.input} : undefined,
      // @ts-ignore
      stage: message.content[0] ? message.content[0]?.toolName : undefined,
      display:
        message.role === 'tool' ? (
          message.content.map((tool: any) => {
            return tool.toolName === 'generatedWorkout' ? (
              <BotCard>
                <WorkoutReviser chatId={aiState.chatId} index={index} day={tool.state.day} workout={tool.state.current_workout} />
              </BotCard>
            ) : tool.toolName === 'finalWorkouts' ? (
              <BotCard>
                <WorkoutFinal workouts={tool.state.created_workouts} />
              </BotCard>
            ) : tool.toolName === 'userMessage' ? (
                <UserMessage>{
                  tool.state.user_feedback === "CONTINUE" ? (
                    "Continue with the workout for the next day."
                  ) : tool.state.user_feedback === "" ? (
                    "Revise the workout without any feedback."
                  ) : tool.state.user_feedback
                }</UserMessage>
            ) : null
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
