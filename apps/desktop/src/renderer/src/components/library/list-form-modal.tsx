import { useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@base-ui/react/input'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@renderer/components/ui/button'
import { IconButton } from '@renderer/components/ui/icon-button'
import { AlertCircleIcon, CloseIcon, LockIcon } from '@renderer/components/icons'
import { CropModal } from '@renderer/components/settings/crop-modal'
import { Ring } from '@renderer/components/ui/spinner'
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, uploadListCover } from '@renderer/lib/image-upload'
import { cn } from '@renderer/lib/cn'
import { SquircleSurface } from '@renderer/components/ui/squircle-surface'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { BACKDROP_MOTION, DIALOG_MOTION } from '@renderer/components/ui/popup-motion'

const NAME_MAX = 40
const DESC_MAX = 200

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(NAME_MAX, { message: `Name is too long (max ${NAME_MAX})` }),
  description: z
    .string()
    .trim()
    .max(DESC_MAX, { message: `Description is too long (max ${DESC_MAX})` })
    .optional(),
  isPrivate: z.boolean()
})

type FormValues = z.infer<typeof schema>

interface ListFormModalProps {
  mode: 'new' | 'edit'
  list?: Doc<'lists'>
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ListFormModal({
  mode,
  list,
  open,
  onOpenChange
}: ListFormModalProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', BACKDROP_MOTION)}
        />
        <Dialog.Popup
          aria-label={mode === 'edit' ? 'Edit list' : 'New list'}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 outline-none',
            DIALOG_MOTION
          )}
        >
          <SquircleSurface variant="frame" className="p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            {open ? (
              <ModalBody mode={mode} list={list} onClose={() => onOpenChange(false)} />
            ) : null}
          </SquircleSurface>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ModalBody({
  mode,
  list,
  onClose
}: {
  mode: 'new' | 'edit'
  list?: Doc<'lists'>
  onClose: () => void
}): React.JSX.Element {
  const convex = useConvex()
  const createList = useMutation(api.lists.createList)
  const updateList = useMutation(api.lists.updateList)
  const setListCover = useMutation(api.lists.setListCover)
  const removeListCover = useMutation(api.lists.removeListCover)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropError, setCropError] = useState<string | null>(null)
  const pendingCoverKeyRef = useRef<string | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(list?.coverUrl ?? null)
  const [coverBusy, setCoverBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isEdit = mode === 'edit'
  const privacy = useQuery(api.profiles.getPrivacy)
  const defaultIsPrivate = isEdit
    ? list?.visibility !== 'public'
    : (privacy?.defaultListVisibility ?? 'private') === 'private'

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setCropError(null)
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) {
      setCropError('Use PNG, JPG, or WebP')
      return
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setCropError('File is too large (max 5 MB)')
      return
    }
    setCropFile(f)
  }

  const handleCropConfirm = async (blob: Blob): Promise<void> => {
    setCropFile(null)
    setCoverBusy(true)
    setCropError(null)
    try {
      const key = await uploadListCover(convex, blob)
      const previewUrl = URL.createObjectURL(blob)
      setCoverPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return previewUrl
      })
      pendingCoverKeyRef.current = key
      if (isEdit && list) {
        await setListCover({ listId: list._id as Id<'lists'>, key })
      }
    } catch (e) {
      setCropError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setCoverBusy(false)
    }
  }

  const handleRemoveCover = async (): Promise<void> => {
    if (coverPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl)
    setCoverPreviewUrl(null)
    pendingCoverKeyRef.current = null
    if (isEdit && list) {
      setCoverBusy(true)
      try {
        await removeListCover({ listId: list._id as Id<'lists'> })
      } finally {
        setCoverBusy(false)
      }
    }
  }

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: list?.name ?? '',
      description: list?.description ?? '',
      isPrivate: defaultIsPrivate
    }
  })

  const onSubmit = async (values: FormValues): Promise<void> => {
    setSubmitError(null)
    try {
      if (isEdit && list) {
        await updateList({
          listId: list._id as Id<'lists'>,
          name: values.name,
          description: values.description ?? '',
          visibility: values.isPrivate ? 'private' : 'public'
        })
      } else {
        await createList({
          name: values.name,
          description: values.description,
          visibility: values.isPrivate ? 'private' : 'public',
          coverKey: pendingCoverKeyRef.current ?? undefined
        })
      }
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <header className="flex items-center justify-between pt-1 pb-1.5 pl-2.5 pr-0.5">
        <Dialog.Title className="text-[15px] leading-5 font-medium text-text">
          {isEdit ? 'Edit list' : 'New list'}
        </Dialog.Title>
        <IconButton variant="ghost" size="md" aria-label="Close" onClick={onClose} type="button">
          <CloseIcon className="size-[18px]" />
        </IconButton>
      </header>

      <SquircleSurface variant="inset" className="gap-4 px-3.5 py-3.5">
        <div className="flex gap-3">
          <CoverThumb
            previewUrl={coverPreviewUrl}
            busy={coverBusy}
            onPick={() => fileInputRef.current?.click()}
            onRemove={handleRemoveCover}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handlePickFile}
            className="hidden"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[12px] leading-4 font-semibold text-text-tertiary">Name</span>
            <Input
              {...register('name')}
              placeholder="List name"
              maxLength={NAME_MAX + 32}
              autoFocus
              className={inputClass(!!errors.name)}
            />
            {errors.name?.message ? (
              <span className="flex items-center gap-1.5 text-[12px] leading-4 font-medium text-red-400">
                <AlertCircleIcon className="size-3.5" />
                {errors.name.message}
              </span>
            ) : cropError ? (
              <span className="flex items-center gap-1.5 text-[12px] leading-4 font-medium text-red-400">
                <AlertCircleIcon className="size-3.5" />
                {cropError}
              </span>
            ) : null}
          </div>
        </div>

        <Field label="Description" error={errors.description?.message}>
          <textarea
            {...register('description')}
            placeholder="What's this list about?"
            rows={2}
            className={cn(
              'min-h-[68px] resize-none px-[14px] py-3',
              inputClass(!!errors.description)
            )}
          />
        </Field>

        <Controller
          control={control}
          name="isPrivate"
          render={({ field }) => <PrivacyToggle value={field.value} onChange={field.onChange} />}
        />

        {submitError ? (
          <div className="flex items-center gap-2 text-[12px] leading-4 font-medium text-red-400">
            <AlertCircleIcon className="size-4 shrink-0" />
            {submitError}
          </div>
        ) : null}
      </SquircleSurface>

      <footer className="flex justify-end gap-2 px-1 pt-2 pb-0.5">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={isSubmitting || coverBusy}>
          {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save' : 'Create list'}
        </Button>
      </footer>
      <CropModal
        open={cropFile !== null}
        kind="listCover"
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onConfirm={handleCropConfirm}
      />
    </form>
  )
}

function CoverThumb({
  previewUrl,
  busy,
  onPick,
  onRemove
}: {
  previewUrl: string | null
  busy: boolean
  onPick: () => void
  onRemove: () => void | Promise<void>
}): React.JSX.Element {
  const hasCover = !!previewUrl
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] leading-4 font-semibold text-text-tertiary">Cover</span>
      <div className="relative size-12 shrink-0">
        <button
          type="button"
          onClick={onPick}
          aria-label={hasCover ? 'Replace cover' : 'Upload cover'}
          disabled={busy}
          className={cn(
            'group relative flex size-12 items-center justify-center overflow-hidden rounded-[14px] outline-none transition-colors',
            hasCover ? 'bg-white/[0.06]' : 'bg-white/[0.06] text-text-tertiary hover:text-text'
          )}
          style={
            hasCover && previewUrl
              ? {
                  backgroundImage: `url(${previewUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }
              : undefined
          }
        >
          {busy ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-white">
              <Ring className="size-4" />
            </span>
          ) : hasCover ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <UploadGlyph />
            </span>
          ) : (
            <UploadGlyph />
          )}
        </button>
        {hasCover && !busy ? (
          <button
            type="button"
            onClick={() => void onRemove()}
            aria-label="Remove cover"
            disabled={busy}
            // The visible circle stays small; the pseudo-element gives it a 32px target.
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-black text-white outline-none ring-2 ring-surface after:absolute after:-inset-1.5 after:content-['']"
          >
            <CloseIcon className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function UploadGlyph(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 16.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5M16 8l-4-4-4 4M12 4v12"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function inputClass(hasError: boolean): string {
  return cn(
    'h-12 w-full rounded-[14px] bg-white/[0.06] px-[14px] text-[14px] leading-5 font-medium text-text outline-none placeholder:text-text-muted',
    hasError && 'ring-1 ring-red-500/70'
  )
}

function Field({
  label,
  error,
  children
}: {
  label: string
  error?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] leading-4 font-semibold text-text-tertiary">{label}</span>
      {children}
      {error ? (
        <span className="flex items-center gap-1.5 text-[12px] leading-4 font-medium text-red-400">
          <AlertCircleIcon className="size-3.5" />
          {error}
        </span>
      ) : null}
    </div>
  )
}

function PrivacyToggle({
  value,
  onChange
}: {
  value: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.04] px-3 py-2.5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-text-tertiary">
        <LockIcon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] leading-4 font-semibold text-text">
          {value ? 'Private' : 'Public'}
        </span>
        <span className="text-[12px] leading-4 font-medium text-text-tertiary">
          {value ? 'Only you can see this list' : 'Anyone with the link can see this list'}
        </span>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  )
}
