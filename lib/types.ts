import { CoreMessage } from 'ai'
import { z } from 'zod'

export type Message = CoreMessage & {
  id: string
}

export interface Chat extends Record<string, any> {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: (Message | AIWorkoutType)[]
  sharePath?: string
}

export type ServerActionResult<Result> = Promise<
  | Result
  | {
      error: string
    }
>

export interface Session {
  user: {
    id: string
    email: string
  }
}

export interface AuthResult {
  type: string
  message: string
}

export interface User extends Record<string, any> {
  id: string
  email: string
  password: string
  salt: string
}

export const WorkoutInputSchema = z.object({
  title: z.string()
    .min(1, { message: "Title is required." })
    .max(100, { message: "Title is too long." }),
  phase: z.enum(["1", "2", "3"], {
    required_error: "Workout Phase must be between 1 and 3.",
  }),
  workoutsInWeek: z.enum(["1", "2", "3", "4", "5", "6", "7"], {
    required_error: "Number of Workouts in Week must be between 1 and 7.",
  }),
  workoutLength: z.string()
    .min(1, { message: "Workout length is required." })
    .max(50, { message: "Workout length is too long." }),
  gymEquipment: z.string()
    .min(1, { message: "Gym Equipment is required." })
    .max(200, { message: "Gym Equipment is too long." }),
  preferredWorkouts: z.string()
    .min(1, { message: "Workout Preferences are required." })
    .max(200, { message: "Workout Preferences are too long." }),
  weight: z.string()
    .min(1, { message: "Weight is required." })
    .max(50, { message: "Weight is too long." }),
  sex: z.enum(["male", "female"], {
    required_error: "Sex must be either male or female."
  }),
  height: z.string()
    .min(1, { message: "Height is required." })
    .max(50, { message: "Height is too long." }),
  goals: z.string()
    .min(1, { message: "Goals are required." })
    .max(200, { message: "Goals are too long." }),
});

export const WorkoutOutputSchema = z.object({
  phase: z.enum(["1", "2", "3"], {
    required_error: "Workout Phase must be between 1 and 3.",
  }),    
  workoutsInWeek: z.enum(["1", "2", "3", "4", "5", "6", "7"], {
    required_error: "Number of Workouts in Week must be between 1 and 7.",
  }),
  workoutLength: z.string().min(1, {
    message: "Workout length is required.",
  }),
  gymEquipment: z.string().min(1, {
    message: "Gym Equipment is required.",
  }),
  preferredWorkouts: z.string().min(1, {
    message: "Workout Preferences are required.",
  }),
  weight: z.string().min(1, {
      message: "Weight is required.",
  }),
  sex: z.enum(["male", "female"], {
    required_error: "Sex must be either male or female.",
  }),
  height: z.string().min(1, {
      message: "Height is required.",
  }),
  goals: z.string().min(1, {
    message: "Goals are required.",
  }),
});

export type Exercise = {
  exercise: string
  alternatives: string[]
};

export type WorkoutSection = Exercise[];

export interface Workout {
  [key: string]: WorkoutSection;
};

export interface WorkoutState {
  day: number
  phase: number
  workouts_in_week: number
  workout_length: string
  extra_criteria: string
  current_workout: Workout
  created_workouts: Workout[]
  client_info: string
  user_feedback: string
  done: boolean
  thread_id: string
  input?: z.infer<typeof WorkoutInputSchema>
}

export interface AIWorkoutType {
  id: string
  role: 'assistant'
  content: [{
    toolName: string
    state: WorkoutState
  }]
}

export interface MessageContentType {
  toolName: string
  state: WorkoutState
}
