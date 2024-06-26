'use client'

import * as React from 'react'
import { useActions, useUIState } from 'ai/rsc'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { IconDumbell } from '@/components/ui/icons'
import { z } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from '@/components/ui/button'
import { WorkoutInputSchema } from "@/lib/types"

import { BotCard } from '../workouts-utils/message'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select'
import { UIState, type AI } from '@/lib/chat/actions'
import { useTheme } from 'next-themes'

export const defaultWorkoutInput: z.infer<typeof WorkoutInputSchema> = {
    title: "",
    phase: "1",
    workoutsInWeek: "4",
    workoutLength: "",
    gymEquipment: "",
    preferredWorkouts: "",
    weight: "",
    sex: "female",
    height: "",
    goals: "",
  }

export function WorkoutForm({ chatId, isShared }: { chatId: string | undefined, isShared: boolean }) {
  const { generateWorkout } = useActions()  // AI action - invokes the LangServe runnable to start generating the first workout for the week
  const [messages, setMessages] = useUIState<typeof AI>()   // Hook to get and set the UI messages which are based on the AI state
  const [generatingUI, setGeneratingUI] = React.useState<null | React.ReactNode>(null)  // Defines the UI that displays while a workout is generating
  const { setTheme, theme } = useTheme()    // Hook to change the theme (either light or dark themed)
  
  // Creates a React Hook form with a Zod scheme defined in types.ts
  // The default values for this form are based on the inputs initially supplied.
  // That way, when the page is refreshed the inputs can be rehydrated here so the form won't be blank.
  const form = useForm<z.infer<typeof WorkoutInputSchema>>({
    resolver: zodResolver(WorkoutInputSchema),
    shouldUnregister: false,
    defaultValues: messages[0]?.input || defaultWorkoutInput
  });
  
  /**
   * Invokes the LangServe runnable to generate the first workout with the inputs for the workouts for the week.
   * @param {z.infer<typeof WorkoutInputSchema>} data - The inputs for the workout week, includes the phase, client info, gym equipment access, etc.
   */    
  async function onSubmit(data: z.infer<typeof WorkoutInputSchema>) { 
    // Calls the AI function which actually performs the LangServe invocation to generate the first workout for the week     
    const response = await generateWorkout(chatId, data);
    setGeneratingUI(response.workoutGenerateUI);

    // Updates the UI state with the component that displays the first generated workout
    setMessages((currentMessages: UIState[]) => [...currentMessages, response.newMessage]);
    form.reset(data);
  }

  // Sets the theme to dark by default if sharing a workout just because it looks better
  React.useEffect(() => {
    if (isShared) {
      setTheme('dark');
    }
  }, [])

  // The form is disabled after the first workout is generated
  // Once it is disabled, it just serves as a part of the chat history to see what inputs went into the workout
  const formDisabled = (!!generatingUI || messages.length > 0)
  
  return (
    <>
    {
        isShared ? (
            <div></div>
        )
        : (
        <BotCard>
            <div className="p-4 ml-2 border rounded-xl bg-zinc-100 dark:bg-zinc-950">
                <h3 className="primary-color-text text-center mb-2 pt-3 text-2xl font-bold">Workout Generator</h3>
                <div className="flex justify-center">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="title"
                        disabled={formDisabled}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Workout Title</FormLabel>
                            <FormControl>
                            <Input placeholder="6/17 Week for Ben, workout for myself this week, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                        <FormField
                        control={form.control}
                        name="phase"
                        disabled={formDisabled}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Workout Phase</FormLabel>
                            <FormControl>
                                <Select {...field} value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select a phase" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                    <SelectLabel>Phase</SelectLabel>
                                    <SelectItem value="1">1</SelectItem>
                                    <SelectItem value="2">2</SelectItem>
                                    <SelectItem value="3">3</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="workoutsInWeek"
                        disabled={formDisabled}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel># of Workouts in Week</FormLabel>
                            <FormControl>
                                <Select {...field} value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select # workouts in week" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                    <SelectLabel># Workouts</SelectLabel>
                                    <SelectItem value="1">1</SelectItem>
                                    <SelectItem value="2">2</SelectItem>
                                    <SelectItem value="3">3</SelectItem>
                                    <SelectItem value="4">4</SelectItem>
                                    <SelectItem value="5">5</SelectItem>
                                    <SelectItem value="6">6</SelectItem>
                                    <SelectItem value="7">7</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="workoutLength"
                        disabled={formDisabled}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Workout Length</FormLabel>
                            <FormControl>
                                <Input placeholder="45-60 mins, 1 hour, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>
            
                    <FormField
                        control={form.control}
                        name="gymEquipment"
                        disabled={formDisabled}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>What Gym Equipment does the Client have Access to?</FormLabel>
                            <FormControl>
                            <Input placeholder="Dumbbells and a treadmill, full gym access, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="preferredWorkouts"
                        disabled={formDisabled}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                            Workout Preferences - Workout Style and/or Specific Workouts to Include/Exclude
                            </FormLabel>
                            <FormControl>
                            <Input placeholder="Prefers strength training, no handstand pushups, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="goals"
                        disabled={formDisabled}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Goals</FormLabel>
                            <FormControl>
                            <Input placeholder="Lose weight, gain muscle, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
            
                    <div className="grid grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name="weight"
                            disabled={formDisabled}
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Weight</FormLabel>
                                <FormControl>
                                <Input placeholder="70 kg, 150 lbs, etc." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="height"
                            disabled={formDisabled}
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Height</FormLabel>
                                <FormControl>
                                <Input placeholder={"6'0\" kg, 200 cm, etc."} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                        control={form.control}
                        name="sex"
                        disabled={formDisabled}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Sex</FormLabel>
                            <FormControl>
                                <Select {...field} value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select sex" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                    <SelectLabel>Sex</SelectLabel>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>
            
                    <div className="text-center">
                        {
                            generatingUI ? (
                                generatingUI
                            )
                            :
                            (
                                <Button type="submit" className="color-btn w-full mt-2" disabled={formDisabled}>
                                    <IconDumbell />&nbsp;&nbsp;&nbsp;Generate Workouts&nbsp;&nbsp;&nbsp;<IconDumbell />
                                </Button>
                            )
                        }
                    </div>
                    </form>
                </Form>
                </div>
            </div>
            </BotCard>
        )
    }
    </>
  );
}
