'use client'

import * as React from 'react'
import Textarea from 'react-textarea-autosize'

import { useActions, useUIState } from 'ai/rsc'

import { UserMessage } from './workouts-utils/message'
import { UIState, type AI } from '@/lib/chat/actions'
import { Button } from '@/components/ui/button'
import { IconArrowElbow, IconPlus } from '@/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit'
import { nanoid } from 'nanoid'
import { useRouter } from 'next/navigation'

export function PromptForm({
  id,
  input,
  setInput
}: {
  id: string | undefined
  input: string
  setInput: (value: string) => void
}) {
  const router = useRouter()  // Next.js router defined here for the new workout button to the left of chat input
  const { formRef, onKeyDown } = useEnterSubmit() // Allows user to type enter to submit revision message
  const inputRef = React.useRef<HTMLTextAreaElement>(null)  // Refers to the input element so it can be focused automatically
  const { continueGeneratingWorkout } = useActions() // AI action - invokes the LangServe runnable to revise the workout based on the free form text input provided
  const [messages, setMessages] = useUIState<typeof AI>() // Hook to get and set the UI messages which are based on the AI state

  // Focus on the input by default
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // The input is only ever enabled when the user currently has the option to revise the current workout generated
  // If providing intial input for the LangServe endpoint, selecting alternatives for an already revised workout, etc.,
  // then there is no need for the input so it is disabled
  const inputDisabled = messages.length < 1 || messages[messages.length - 1].stage !== "generatedWorkout"

  return (
    <form
      ref={formRef}
      onSubmit={async (e: any) => {
        e.preventDefault()

        // Blur focus on mobile
        if (window.innerWidth < 600) {
          e.target['message']?.blur()
        }

        const value = input.trim()
        setInput('')
        if (!value) return

        setMessages((currentMessages: UIState) => [
          ...currentMessages,
          {
            id: nanoid(),
            stage: "userMessage",
            display: <UserMessage>{value}</UserMessage>
          }
        ])
    
        const response = await continueGeneratingWorkout(id, value, undefined);
    
        setMessages((currentMessages: UIState[]) => [...currentMessages, response.newMessage]);
      }}
    >
      <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-0 top-[14px] size-8 rounded-full bg-background p-0 sm:left-4 primary-color-text"
              onClick={() => {
                router.push('/new')
              }}
            >
              <IconPlus />
              <span className="sr-only">New Workout</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Workout</TooltipContent>
        </Tooltip>
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          placeholder={inputDisabled ? "Wait until you are given a workout to revise to provide input here..." : "(Optional) Provide input to revise workout"}
          className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          name="message"
          rows={1}
          value={input}
          disabled={inputDisabled}
          onChange={e => {if (e.target.value.length < 600) {setInput(e.target.value)}}}
        />
        <div className="absolute right-0 top-[13px] sm:right-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" size="icon" className="color-btn" disabled={inputDisabled || input === ''}>
                <IconArrowElbow />
                <span className="sr-only">Provide input to revise workout</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Provide input to revise workout</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </form>
  )
}
