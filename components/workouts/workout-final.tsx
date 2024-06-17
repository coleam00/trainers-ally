'use client'

import * as React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z, ZodSchema } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

import { BotCard } from '../stocks'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select'
import { IconCooldown, IconBalanceCore, IconDumbell, IconWarmup, IconStrength } from '../ui/icons'
import { Workout } from '@/lib/types'

const sectionToIconMapping: { [key: string]: React.JSX.Element } = {
  "1. Warm up": <IconWarmup />,
  "2. Balance portion": <IconBalanceCore />,
  "3. Strength portion": <IconStrength />,
  "4. Cooldown portion": <IconCooldown />
};

export function WorkoutFinal({ workouts }: { workouts: Workout[] }) {
  // Create the dynamic workout schema for an array of workouts
  const workoutSchemas = workouts.map((workout, workoutIndex) => {
    const workoutKeys = Object.keys(workout) as Array<keyof Workout>;
    const schema = workoutKeys.reduce((acc, key) => {
      for (let i = 0; i < workout[key].length; i++) {
        const exercise = workout[key][i].exercise;
        const options = [exercise, ...workout[key][i].alternatives];
        acc[`workout-${workoutIndex}-${key}-${i}`] = z.enum(options as any, {
          message: "Exercise is required",
        });
      }
      return acc;
    }, {} as Record<string, ZodSchema<any>>);

    return schema;
  });

  // Combine all workout schemas into one
  const WorkoutOutputSchema = z.object(Object.assign({}, ...workoutSchemas));

  // Initialize default values for all workouts
  const defaultValues = workouts.reduce((acc, workout, workoutIndex) => {
    const workoutKeys = Object.keys(workout) as Array<keyof Workout>;
    workoutKeys.forEach((key) => {
      for (let i = 0; i < workout[key].length; i++) {
        acc[`workout-${workoutIndex}-${key}-${i}`] = workout[key][i].exercise;
      }
    });
    return acc;
  }, {} as Record<string, string>);

  const form = useForm<z.infer<typeof WorkoutOutputSchema>>({
    resolver: zodResolver(WorkoutOutputSchema),
    defaultValues: defaultValues,
  });

  return (
    <BotCard>
      <div className="p-4 ml-2 border rounded-xl bg-zinc-100 dark:bg-zinc-950">
        <h3 className="primary-color-text text-center pt-2 mb-2 text-2xl font-bold">Final Workouts</h3>
        <p className="text-md text-center">Here are your final workouts! Feel free to still select altneratives.</p>
        <div className="flex justify-center">
          <Form {...form}>
            <form className="space-y-6">
              {workouts.map((workout, workoutIndex) => (
                <div key={workoutIndex}>
                  <h2 className="text-xl font-bold mb-4 primary-color-text mt-10 text-center flex justify-center">
                    <IconDumbell style={{marginTop: '3px'}} />
                    &nbsp;&nbsp;&nbsp;Workout for Day {workoutIndex + 1}&nbsp;&nbsp;&nbsp;
                    <IconDumbell style={{marginTop: '3px'}} />
                  </h2>
                  {Object.keys(workout).map((key) => (
                    <div key={key}>
                      <h2 className="primary-color-text font-bold text-lg flex mt-4">
                        {sectionToIconMapping[key]}&nbsp;&nbsp;{key.split(". ")[1]}
                      </h2>
                      {workout[key as keyof Workout].map((exercise, index) => (
                        <FormField
                          key={index}
                          control={form.control}
                          name={`workout-${workoutIndex}-${key}-${index}`}
                          render={({ field }) => (
                            <FormItem className="mt-3">
                              <FormControl>
                                <Select {...field} value={field.value} onValueChange={field.onChange}>
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
                </div>
              ))}
            </form>
          </Form>
        </div>
      </div>
    </BotCard>
  );
}
