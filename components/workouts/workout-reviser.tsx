'use client'

import * as React from 'react'
import { useActions, useUIState } from 'ai/rsc'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Button } from '@/components/ui/button'

import { BotCard } from '../workouts-utils/message'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select'
import { UIState, type AI } from '@/lib/chat/actions'
import { IconCooldown, IconBalanceCore, IconDumbell, IconWarmup, IconStrength } from '../ui/icons'
import { Workout } from '@/lib/types'
import { nanoid } from 'nanoid'
import { UserMessage } from '../workouts-utils/message'

/**
 * Updates a backend workout JSON with the altneratives selected in the form workout JSON.
 * @param {Object} originalJson - The workout JSON in the format produced by the LLM.
 * @param {Object} formJson - The workout JSON in the format for the form.
 * @returns {Object} The workout JSON with alternatives selected and original workouts swapped (where alternatives were selected in the form).
 */
function updateOriginalWorkout(originalJson: any, formJson: any) {
  // Iterate over each key-value pair in the form JSON
  for (const formKey in formJson) {
    const [section, index] = formKey.split('-');
    const exerciseIndex = parseInt(index, 10);

    // Find the corresponding section in the workout JSON
    const originalSection = originalJson[section];
    if (originalSection && originalSection[exerciseIndex]) {
      const originalExerciseObject = originalSection[exerciseIndex];
      const selectedExercise = formJson[formKey];

      // Check if the selected exercise is in the alternatives
      const altIndex = originalExerciseObject.alternatives.indexOf(selectedExercise);

      if (altIndex !== -1) {
        // Swap the selected exercise with the main exercise in the workout JSON
        const oldExercise = originalExerciseObject.exercise;
        originalExerciseObject.exercise = selectedExercise;
        originalExerciseObject.alternatives[altIndex] = oldExercise;
      }
    }
  }

  return originalJson;
}

export function WorkoutReviser({ chatId, index, day, workout }: { chatId: string | undefined, index: number, day: number, workout: Workout}) {
  const { continueGeneratingWorkout } = useActions()  // AI action - invokes the LangServe runnable to either revise a workout or generate the workout for the next day
  const [messages, setMessages] = useUIState<typeof AI>() // Hook to get and set the UI messages which are based on the AI state
  const [formUpdates, setFormUpdates] = React.useState<Object>({})  // State that manages the set of alternatives selected for exercises
  const [generatingUI, setGeneratingUI] = React.useState<null | React.ReactNode>(null)  // Defines the UI that displays while a workout is generating/being revised

  // This component is used both to display initially generated workouts as well as revised workouts
  // Revising a workout that has already been revised (aside from selecting alternatives) is not allowed
  const revisionDisabled = messages.length < 1 || messages[messages.length - 1].stage !== "generatedWorkout"

  // This form is entirely disabled if the user has already moved on to the next workout
  // At that point this form just serves as a part of the chat history to see what went into create the current workout
  const formDisabled = index < messages.length - 1 || !!generatingUI

  // Maps the section type (warm up, balance + core, strength, or cooldown)
  // to the icon to display next to the section title in the form
  const sectionToIconMapping: {[key: string]: React.JSX.Element} = {
    "1. Warm up": <IconWarmup />,
    "2. Balance portion": <IconBalanceCore />,
    "3. Strength portion": <IconStrength />,
    "4. Cooldown portion": <IconCooldown />
  }

  // Extract the keys from the workout object
  const workoutKeys = Object.keys(workout) as Array<string>;

  /**
   * This function takes a variable number of string arguments and returns them as a tuple.
   * @template T - A tuple of strings.
   * @param {...T} args - The string arguments to be returned as a tuple.
   * @returns {T} The input arguments returned as a tuple.
   */
  function asTuple<T extends string[]>(...args: T): T {
    return args;
  }

  // Create the dynamic workout schema
  const WorkoutOutputSchema = z.object(
    workoutKeys.reduce((acc, key) => {
      for (let i = 0; i < workout[key].length; i++) {
        const exercise = workout[key][i].exercise;
        const options = asTuple(exercise, ...workout[key][i].alternatives);
        acc[`${key}-${i}`] = z.enum(options, {
          required_error: "Exercise is required"
      });
      }
      return acc;
    }, {} as Record<string, any>)
  );

  // Initialize default values
  const defaultValues = workoutKeys.reduce((acc, key) => {
    for (let i = 0; i < workout[key].length; i++) {
      acc[`${key}-${i}`] = workout[key][i].exercise;
    }    
    return acc;
  }, {} as Record<string, any>);
  
  // Creates a React Hook form with a Zod scheme defined dynamically above
  // The default values for this form are based on the workout the LLM produced through the LangServe endpoint
  const form = useForm<z.infer<typeof WorkoutOutputSchema>>({
    resolver: zodResolver(WorkoutOutputSchema),
    shouldUnregister: false,
    defaultValues: defaultValues
  });

  /**
   * This function iterates over the properties of the source object and assigns each value to the corresponding property in the target object. 
   * If a property in the target object does not exist, it will be added.
   * @param {Object} target - The target object whose values will be replaced.
   * @param {Object} source - The source object providing new values.
   * @returns {Object} The updated target object with replaced values.
   */
  function replaceDictValues(target: any, source: any) {
    for (const [key, value] of Object.entries(source)) {
      target[key] = value;
    }
    return target;
  }  
  
  /**
   * Invokes the LangServe runnable to either revise the current workout or generate the next workout in the week
   * @param {z.infer<typeof WorkoutOutputSchema>} data - The workout JSON created by the LLM with any alternatives selected
   * @param {string} userFeedback - Either an empty string (means to revise the workout) or CONTINUE (means to generate the workout for the next day)
   */
  async function onSubmit(data: z.infer<typeof WorkoutOutputSchema>, userFeedback: "" | "CONTINUE") {   
    // Edit the workout JSON produced by the LLM to incorporate the alternatives selected
    const finalWorkouts = replaceDictValues(data, formUpdates);

    // Adds a user message just to make the chat history show which option the user chose in
    // the form (either to continue to the next day or revise the current workout)
    setMessages((currentMessages: UIState) => [
      ...currentMessages,
      {
        id: nanoid(),
        stage: "userMessage",
        display: <UserMessage>
            {
                  userFeedback === "CONTINUE" ? (
                    "Continue with the workout for the next day."
                  ) : userFeedback === "" ? (
                    "Revise the workout without any feedback."
                  ) : userFeedback
            }
          </UserMessage>
      }
    ])

    // Invokes the LangServe runnable to generate the next workout or revise the current one (which happens is based on the user feedback)
    const response = await continueGeneratingWorkout(chatId, userFeedback, updateOriginalWorkout(workout, finalWorkouts));
    setGeneratingUI(response.workoutGenerateUI);

    // Updates the UI state with the component that displays the next or currently revised workout
    setMessages((currentMessages: UIState[]) => [...currentMessages, response.newMessage]);
    form.reset(data);
  }

  /**
   * Updates the running list of alternatives when an alternative is chosen
   * @param {string} value - The alternative workout selected
   * @param {Object} field - The workout being updated
   * @param {UseFormReturn} form - The React Hook form object managing the state for the form
   */
  const updateFormState = (value: string, field: any, form: any) => {
    form.setValue(field.name, value);
    setFormUpdates((prevFormUpdates) => { return {
      ...prevFormUpdates,
      [field.name]: value
    }})
  }

  // When continue to next day button is clicked, this function is invoked to
  // submit the form with the user feedback of "CONTINUE" so that the workout for
  // the next day is generated instead of revising the current workout
  const handleContinueNextDay = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    form.handleSubmit((data: z.infer<typeof WorkoutOutputSchema>) => onSubmit(data, "CONTINUE"))();
  }

  // When the revise workout without feedback button is clicked, this function is invoked to
  // submit the form with the user feedback of an empty string so that the current workout
  // is revised and given back to the user to either continue on or select altneratives and then continue on
  const handleContinueRevise = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    form.handleSubmit((data: z.infer<typeof WorkoutOutputSchema>) => onSubmit(data, ""))();
  }
  
  return (
    <BotCard>
      <div className="p-4 ml-2 border rounded-xl bg-zinc-100 dark:bg-zinc-950">
        <h3 className="primary-color-text text-center pt-2 mb-2 text-2xl font-bold">Workout for Day {day}</h3>
        <p className="mb-4 text-md text-center">You can select altnerative workouts below before continuing with the next day.</p>
        <div className="flex justify-center">
          <Form {...form}>
            <form className="space-y-6">
              {workoutKeys.map((key) => (
                <div key={key}>
                  <h2 className="primary-color-text font-bold text-lg flex">
                    {sectionToIconMapping[key]}&nbsp;&nbsp;{key.split(". ")[1]}
                  </h2>
                  {workout[key].map((exercise, index) => (
                    <FormField
                      key={index}
                      control={form.control}
                      name={`${key}-${index}`}
                      disabled={formDisabled}
                      render={({ field }) => (
                        <FormItem className="mt-3">
                          <FormControl>
                            <Select {...field} value={field.value} onValueChange={(value) => updateFormState(value, field, form)}>
                              <SelectTrigger className="w-[600px]">
                                <SelectValue placeholder="Select an exercise" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Alternatives</SelectLabel>
                                  <SelectItem value={exercise.exercise}>{exercise.exercise}</SelectItem>
                                  {exercise.alternatives.map((alt, idx) => (
                                    <SelectItem key={idx} value={alt}>{alt}</SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              ))}
              <div className="text-center">
                {
                    generatingUI ? (
                        generatingUI
                    )
                    :
                    (
                      <>
                        {
                          !formDisabled && (
                            <Button onClick={handleContinueNextDay} className="color-btn w-full mt-2">
                              <IconDumbell />&nbsp;&nbsp;&nbsp;Continue with Next Day&nbsp;&nbsp;&nbsp;<IconDumbell />
                            </Button>
                          )
                        }
                        {
                          !revisionDisabled && !formDisabled && (
                            <>
                              <Button onClick={handleContinueRevise} className="color-btn w-full mt-2">
                                <IconDumbell />&nbsp;&nbsp;&nbsp;Revise Without Feedback&nbsp;&nbsp;&nbsp;<IconDumbell />
                              </Button>
                              <p className="mt-2 text-sm">- OR -</p>
                              <p className="mt-2 text-sm">
                                Enter feedback below and hit enter to automatically revise the workout with your guidance!
                              </p>   
                            </>
                          )
                        }
                      </>
                    )
                }
              </div>
            </form>
          </Form>
        </div>
      </div>
    </BotCard>
  );
}

/*
Example of workout JSON produced by LLM:

const workout = {
  "1. Warm up": [
    {
      "exercise": "10 minutes of cycling on the stationary bike",
      "alternatives": [
        "10 minutes of rowing on the rowing machine",
        "10 minutes of jogging on the treadmill"
      ]
    },
    {
      "exercise": "Hip flexor stretch - 1 set of 15",
      "alternatives": [
        "Calf raises - 1 set of 15",
        "Arm circles - 1 set of 15"
      ]
    },
    {
      "exercise": "Dynamic hamstring stretches - 1 set of 15",
      "alternatives": [
        "Dynamic quadriceps stretches - 1 set of 15",
        "Dynamic hip circles - 1 set of 15"
      ]
    }
  ],
  "2. Balance portion": [
    {
      "exercise": "Single-leg hop - 3 sets of 30 seconds",
      "alternatives": [
        "Heel-to-toe walk - 3 sets of 30 seconds",
        "Tandem walk - 3 sets of 30 seconds"
      ]
    },
    {
      "exercise": "Bird dog - 3 sets of 30 seconds",
      "alternatives": [
        "Plank - 3 sets of 30 seconds",
        "Side plank - 3 sets of 30 seconds"
      ]
    },
    {
      "exercise": "Woodchoppers - 3 sets of 15",
      "alternatives": [
        "Russian twists - 3 sets of 15",
        "Leg raises - 3 sets of 15"
      ]
    }
  ],
  "3. Strength portion": [
    {
      "exercise": "Push press - 3 sets of 10",
      "alternatives": [
        "Clean and jerk - 3 sets of 10",
        "Hang clean - 3 sets of 10"
      ]
    },
    {
      "exercise": "Leg curls - 3 sets of 10",
      "alternatives": [
        "Leg press - 3 sets of 10",
        "Calf raise - 3 sets of 10"
      ]
    },
    {
      "exercise": "Dumbbell chest press - 3 sets of 10",
      "alternatives": [
        "Incline dumbbell press - 3 sets of 10",
        "Chest fly - 3 sets of 10"
      ]
    },
    {
      "exercise": "Seated row - 3 sets of 10",
      "alternatives": [
        "Lat pulldowns - 3 sets of 10",
        "Bent-over row - 3 sets of 10"
      ]
    },
    {
      "exercise": "Glute-ham raise - 3 sets of 10",
      "alternatives": [
        "Deadlift - 3 sets of 10",
        "Hip thrust - 3 sets of 10"
      ]
    }
  ],
  "4. Cooldown portion": [
    {
      "exercise": "5-10 minutes of jogging on the treadmill, gradually reducing speed",
      "alternatives": [
        "5-10 minutes of rowing on the rowing machine, gradually reducing speed",
        "5-10 minutes of cycling on the stationary bike, gradually reducing speed"
      ]
    },
    {
      "exercise": "Quad stretch - 3 sets of 30 seconds",
      "alternatives": [
        "Hamstring stretch - 3 sets of 30 seconds",
        "Back stretch - 3 sets of 30 seconds"
      ]
    }
  ]
}
*/
