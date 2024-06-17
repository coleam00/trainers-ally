import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState
} from 'ai/rsc'
import { RemoteRunnable } from "@langchain/core/runnables/remote";

import {
  BotCard,
  BotMessage
} from '@/components/workouts-utils/message'
import { spinner } from '@/components/workouts-utils/spinner'

import { z } from 'zod'
import {
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { UserMessage } from '@/components/workouts-utils/message'
import { AIWorkoutType, Chat, Message, Workout, WorkoutInputSchema, WorkoutState } from '@/lib/types'
import { auth } from '@/auth'
import { WorkoutReviser } from '@/components/workouts/workout-reviser';
import { WorkoutFinal } from '@/components/workouts/workout-final';

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

const runnable = new RemoteRunnable({
  url: `${process.env.REMOTE_RUNNABLE_URL}/workout/`,
});

async function generateWorkout(chatId: string | undefined, inputData: z.infer<typeof WorkoutInputSchema>) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()  

  const generatingWorkout = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Generating workout...
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(null)
  const threadId = chatId || nanoid();

  runAsyncFnWithoutBlocking(async () => {
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

    const logStream = await runnable.streamEvents(
      state,
      {
        version: "v1",
        configurable: {
          thread_id: threadId, recursion_limit: 25
        }
      }
    );

    for await (const chunk of logStream) {
      if (chunk.data.output) {
        const newState = { ...state, ...Object.fromEntries(Object.entries(chunk.data.output).filter(([key]) => key in state)) };
        Object.assign(state, newState);
      }

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

    generatingWorkout.done(
      <div>
        <p className="mb-2">
          Workout Generated!
        </p>
      </div>
    )

    systemMessage.done(
      <BotCard>
        <WorkoutReviser chatId={chatId} index={1000} day={state.day} workout={state.current_workout} />
      </BotCard>
    )

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

async function continueGeneratingWorkout(chatId: string | undefined, userFeedback: string, currentWorkout: Workout | undefined) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()  
  const messages = aiState.get().messages
  const lastMessage = messages[messages.length - 1]

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

  const generatingWorkout = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day..." : "Revising workout..."}
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day..." : "Revising workout..."}
      </p>
    </div>
  )

  const threadId = chatId || nanoid();

  await sleep(2000);

  generatingWorkout.update(
    <div>
      <p className="mb-2">
        {userFeedback === "CONTINUE" ? "Generating workout for next day... Selecting best exercises..." : "Revising workout... Incorporating feedback..."}
      </p>
    </div>
  )  

  runAsyncFnWithoutBlocking(async () => {
    const logStream = await runnable.streamEvents(
      null,
      {
        version: "v1",
        configurable: {
          thread_id: threadId, recursion_limit: 25
        }
      }
    );

    for await (const chunk of logStream) {
      if (chunk.data.output) {
        const newState = { 
          ...state, ...Object.fromEntries(Object.entries(chunk.data.output).filter(([key]) => key in state)) 
        };
        Object.assign(state, newState);
      }
    }

    generatingWorkout.done(
      <div>
        <p className="mb-2">
          {userFeedback === "CONTINUE" ? "Workout for the next day generated!" : "Workout revised!"}
        </p>
      </div>
    )

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

export const AI: any = createAI({
  actions: {
    generateWorkout,
    continueGeneratingWorkout
  },
  initialUIState: uiState,
  initialAIState: aiState,
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
