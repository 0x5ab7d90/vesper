import { useEffect, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useAction, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { AnimatePresence, m as motion } from 'motion/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HeartDrop } from '@renderer/components/brand/heart-drop'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import { Select } from '@renderer/components/ui/select'
import { CloseIcon, CmdIcon, ReturnIcon } from '@renderer/components/icons'
import { isMac } from '@renderer/lib/platform'
import { cn } from '@renderer/lib/cn'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { useErrorShake } from '@renderer/hooks/use-error-shake'
import { api } from '@convex/_generated/api'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

const MIN_MSG = 5
const MAX_MSG = 4000

const POP = { type: 'spring', stiffness: 400, damping: 26 } as const

const feedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(MIN_MSG, `At least ${MIN_MSG} characters`)
    .max(MAX_MSG, `Max ${MAX_MSG} characters`),
  type: z.enum(['bug', 'feature', 'other'])
})

function extractError(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = (e as ConvexError<string>).data
    return typeof data === 'string' ? data : 'Something went wrong'
  }
  if (e instanceof Error) {
    // Strip "Uncaught ConvexError: " prefix and " at handler ..." suffix that
    // bubbles up from Convex actions on the client.
    const m = e.message.match(/ConvexError:\s*([\s\S]+?)(?:\s+at\s+\w|$)/)
    if (m && m[1]) return m[1].trim()
  }
  return 'Something went wrong. Please try again.'
}

type FeedbackType = 'bug' | 'feature' | 'other'

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'other', label: 'Other' }
]

const PLACEHOLDER: Record<FeedbackType, string> = {
  bug: 'What went wrong?',
  feature: 'What should Vesper do?',
  other: 'Write your message'
}

function detectPlatform(): string {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'win'
  if (/Mac/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

type FeedbackValues = z.infer<typeof feedbackSchema>

export function FeedbackModal({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): React.JSX.Element {
  const submit = useAction(api.feedback.submit)
  const me = useQuery(api.profiles.me)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors, isValid, isSubmitted }
  } = useForm<FeedbackValues>({
    resolver: zodResolver(feedbackSchema),
    mode: 'onChange',
    defaultValues: { message: '', type: 'bug' }
  })

  const message = watch('message')
  const type = watch('type')
  const fieldError = errors.message?.message
  const shownError = serverError ?? (isSubmitted ? fieldError : undefined)
  const shakeRef = useErrorShake<HTMLSpanElement>(shownError)

  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        reset({ message: '', type: 'bug' })
        setState('idle')
        setServerError(null)
      }, 200)
      return () => clearTimeout(id)
    }
    return
  }, [open, reset])

  const onSubmit = handleSubmit(async (values) => {
    setState('sending')
    setServerError(null)
    try {
      await submit({
        message: values.message,
        type: values.type,
        username: me?.profile?.username,
        displayName: me?.profile?.displayName,
        route: window.location.hash.slice(1) || '/',
        platform: detectPlatform()
      })
      setState('sent')
    } catch (e) {
      setState('error')
      setServerError(extractError(e))
    }
  })

  const canSend = isValid && state === 'idle'

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void onSubmit()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label="Send feedback"
          className="fixed top-1/2 left-1/2 z-50 w-[560px] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          {/* Squircle frame holding a recessed inset — the surface anatomy from oa-design,
              in Vesper's palette: frame surface-2, inset recessed to surface. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={POP}
            className="relative flex h-[380px] flex-col bg-surface-2 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.5)]"
            style={squircleStyle('frame')}
          >
            <DitherCorner />
            <div className="t-page-slide min-h-0 flex-1" data-page={state === 'sent' ? '2' : '1'}>
              <div className="t-page flex flex-col" data-page-id="2">
                <div className="flex shrink-0 items-center justify-end pb-1.5 pl-2.5 pr-1 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                    className="flex size-7 items-center justify-center rounded-full text-text-tertiary outline-none hover:bg-white/[0.08] hover:text-white active:opacity-70"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </div>
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface px-8 text-center shadow-edge-soft"
                  style={squircleStyle('inset')}
                >
                  <HeartDrop size={96} className="mb-1" />
                  <h2 className="text-[22px] leading-7 font-medium text-text">Thank you!</h2>
                  <p className="text-[13px] leading-5 font-medium text-text-tertiary">
                    We appreciate every message that helps us improve Vesper.
                  </p>
                </div>
              </div>
              <div className="t-page flex flex-col" data-page-id="1">
                <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5 pl-2.5 pr-1 pt-1">
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        ariaLabel="Feedback type"
                        value={field.value}
                        onChange={(v) => field.onChange(v as FeedbackType)}
                        options={TYPE_OPTIONS}
                      />
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                    className="flex size-7 items-center justify-center rounded-full text-text-tertiary outline-none hover:bg-white/[0.08] hover:text-white active:opacity-70"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </div>
                <span
                  ref={shakeRef}
                  className={cn(
                    't-input flex min-h-0 flex-1 flex-col overflow-hidden border border-white/[0.05] bg-surface',
                    shownError && 'is-error'
                  )}
                  style={squircleStyle('inset')}
                >
                  <textarea
                    autoFocus
                    {...register('message')}
                    onKeyDown={onKey}
                    placeholder={PLACEHOLDER[type]}
                    className="scroll-hide flex-1 resize-none bg-transparent px-4 pt-3.5 pb-3 text-[14px] leading-5 font-medium text-text outline-none placeholder:text-text-tertiary"
                  />
                  <AnimatePresence>
                    {serverError ? (
                      <motion.div
                        key="error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={EXIT_FADE}
                        transition={{ duration: 0.16, ease: EASE_OUT }}
                        className="px-4 pb-3"
                      >
                        <p className="line-clamp-2 text-[12px] leading-4 font-medium text-[#f08c8c]">
                          {serverError}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </span>
                <div className="flex shrink-0 items-center justify-between gap-3 px-2.5 pt-2 pb-1">
                  <span
                    className={cn(
                      'text-[11px] leading-4 font-medium tabular-nums',
                      fieldError && isSubmitted ? 'text-red-400' : 'text-text-muted'
                    )}
                  >
                    {fieldError && isSubmitted
                      ? fieldError
                      : `${message.trim().length} / ${MAX_MSG}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onSubmit()}
                    disabled={!canSend}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-[14px] bg-white px-4 py-2 text-[13px] leading-4 font-medium text-black outline-none transition-opacity disabled:opacity-40'
                    )}
                  >
                    <span className="leading-none whitespace-nowrap">
                      {state === 'sending' ? 'Sending…' : 'Send to the Vesper team'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-black/45" aria-hidden>
                      {isMac ? (
                        <CmdIcon className="size-3.5" />
                      ) : (
                        <span className="text-[11px] font-medium">Ctrl</span>
                      )}
                      <ReturnIcon className="size-3.5" />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
