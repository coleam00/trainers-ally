'use client'

import * as React from 'react'
import { useActions, useUIState } from 'ai/rsc'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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

function updateOriginalWorkout(originalJson: any, formJson: any) {
  // Iterate over each key-value pair in the form JSON
  for (const formKey in formJson) {
    const [section, index] = formKey.split('-');
    const exerciseIndex = parseInt(index, 10);

    // Find the corresponding section in the original JSON
    const originalSection = originalJson[section];
    if (originalSection && originalSection[exerciseIndex]) {
      const originalExerciseObject = originalSection[exerciseIndex];
      const selectedExercise = formJson[formKey];

      // Check if the selected exercise is in the alternatives
      const altIndex = originalExerciseObject.alternatives.indexOf(selectedExercise);

      if (altIndex !== -1) {
        // Swap the selected exercise with the main exercise
        const oldExercise = originalExerciseObject.exercise;
        originalExerciseObject.exercise = selectedExercise;
        originalExerciseObject.alternatives[altIndex] = oldExercise;
      }
    }
  }

  return originalJson;
}

export function WorkoutReviser({ chatId, index, day, workout }: { chatId: string | undefined, index: number, day: number, workout: Workout}) {
  const { continueGeneratingWorkout } = useActions()
  const [messages, setMessages] = useUIState<typeof AI>()
  const [formUpdates, setFormUpdates] = React.useState<Object>({})
  const [generatingUI, setGeneratingUI] = React.useState<null | React.ReactNode>(null)

  const revisionDisabled = messages.length < 1 || messages[messages.length - 1].stage !== "generatedWorkout"
  const formDisabled = index < messages.length - 1 || !!generatingUI

  const sectionToIconMapping: {[key: string]: React.JSX.Element} = {
    "1. Warm up": <IconWarmup />,
    "2. Balance portion": <IconBalanceCore />,
    "3. Strength portion": <IconStrength />,
    "4. Cooldown portion": <IconCooldown />
  }

  // Extract the keys from the workout object
  const workoutKeys = Object.keys(workout) as Array<string>;

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
  
  const form = useForm<z.infer<typeof WorkoutOutputSchema>>({
    resolver: zodResolver(WorkoutOutputSchema),
    shouldUnregister: false,
    defaultValues: defaultValues
  });

  function replaceDictValues(target: any, source: any) {
    for (const [key, value] of Object.entries(source)) {
      target[key] = value;
    }
    return target;
  }  
  
  async function onSubmit(data: z.infer<typeof WorkoutOutputSchema>, userFeedback: "" | "CONTINUE") {   
    const finalWorkouts = replaceDictValues(data, formUpdates);
    
    console.log(updateOriginalWorkout(workout, finalWorkouts))

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

    const response = await continueGeneratingWorkout(chatId, userFeedback, updateOriginalWorkout(workout, finalWorkouts));
    setGeneratingUI(response.workoutGenerateUI);

    setMessages((currentMessages: UIState[]) => [...currentMessages, response.newMessage]);
    form.reset(data);
  }

  const updateFormState = (value: any, field: any, form: any) => {
    form.setValue(field.name, value);
    setFormUpdates((prevFormUpdates) => { return {
      ...prevFormUpdates,
      [field.name]: value
    }})
  }

  const handleContinueNextDay = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    form.handleSubmit((data: z.infer<typeof WorkoutOutputSchema>) => onSubmit(data, "CONTINUE"))();
  }

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
