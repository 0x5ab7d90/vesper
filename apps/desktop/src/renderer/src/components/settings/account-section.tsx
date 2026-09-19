import { useEffect, useRef, useState } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, m as motion } from 'motion/react'
import { Avatar } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { Ring } from '@renderer/components/ui/spinner'
import { TextField } from '@renderer/components/ui/text-field'
import { TextArea } from '@renderer/components/ui/text-area'
import { CheckCircleIcon, ImageEditIcon } from '@renderer/components/icons'
import { CropModal } from '@renderer/components/settings/crop-modal'
import {
  ALLOWED_AVATAR_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  uploadProfileImage
} from '@renderer/lib/image-upload'
import {
  BIO_MAX,
  bioSchema,
  displayNameSchema,
  usernameSchema
} from '@renderer/lib/settings-schemas'
import { api } from '@convex/_generated/api'
import { EXIT_FADE } from '@renderer/lib/motion'

interface ProfileShape {
  displayName: string
  username: string
  bio?: string
  avatarUrl?: string
  bannerUrl?: string
}

export function AccountSection(): React.JSX.Element | null {
  const data = useQuery(api.profiles.me)
  if (!data?.profile) return null
  return <AccountFields profile={data.profile} email={data.user?.email ?? ''} />
}

function AccountFields({
  profile,
  email
}: {
  profile: ProfileShape
  email: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <BannerSection bannerUrl={profile.bannerUrl} username={profile.username} />
      <AvatarSection avatarUrl={profile.avatarUrl} username={profile.username} />
      <div className="grid grid-cols-2 gap-4">
        <DisplayNameField initial={profile.displayName} />
        <UsernameField initial={profile.username} />
      </div>
      <BioField initial={profile.bio ?? ''} />
      <div className="flex flex-col gap-2">
        <label htmlFor="account-email" className="text-[13px] font-medium text-text-tertiary">
          Email
        </label>
        <input
          id="account-email"
          type="email"
          value={email}
          disabled
          className="h-12 rounded-[14px] bg-surface-2 px-[14px] text-[14px] leading-5 font-medium text-text-muted outline-none"
        />
        <p className="text-[12px] font-medium text-text-muted">Email change coming soon.</p>
      </div>
    </div>
  )
}

function HoverScrim({
  show,
  label,
  rounded
}: {
  show: boolean
  label: string
  rounded?: string
}): React.JSX.Element {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/45 text-white ${rounded ?? ''}`}
        >
          <motion.span
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={EXIT_FADE}
            transition={{ type: 'spring', visualDuration: 0.18, bounce: 0.1 }}
            className="inline-flex items-center gap-2"
          >
            <ImageEditIcon className="size-5" />
            {label ? <span className="text-[13px] font-semibold">{label}</span> : null}
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function BannerSurface({
  bannerUrl,
  username,
  onClick
}: {
  bannerUrl?: string
  username: string
  onClick: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="relative h-[220px] w-full overflow-hidden rounded-xl bg-surface-3 outline-none"
      style={
        bannerUrl
          ? {
              backgroundImage: `url(${bannerUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }
          : undefined
      }
      aria-label="Change banner"
    >
      {!bannerUrl ? <span className="sr-only">{username}</span> : null}
      <HoverScrim show={hover || !bannerUrl} label="Change banner" rounded="rounded-xl" />
    </button>
  )
}

function BannerSection({
  bannerUrl,
  username
}: {
  bannerUrl?: string
  username: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const convex = useConvex()
  const remove = useMutation(api.profiles.removeBanner)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const pick = (): void => inputRef.current?.click()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setFile(f)
    setOpen(true)
  }

  const handleConfirm = async (blob: Blob): Promise<void> => {
    await uploadProfileImage(convex, 'banner', blob)
    setOpen(false)
    setFile(null)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-tertiary">Banner</span>
        {bannerUrl ? (
          <button
            type="button"
            onClick={() => remove()}
            className="bg-transparent text-[12px] font-medium text-text-muted outline-none hover:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      <BannerSurface bannerUrl={bannerUrl} username={username} onClick={pick} />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFile}
      />
      <CropModal
        open={open}
        kind="banner"
        file={file}
        onCancel={() => {
          setOpen(false)
          setFile(null)
        }}
        onConfirm={handleConfirm}
      />
    </section>
  )
}

function AvatarSurface({
  avatarUrl,
  username,
  onClick
}: {
  avatarUrl?: string
  username: string
  onClick: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="relative size-[72px] shrink-0 overflow-hidden rounded-full bg-transparent outline-none"
      aria-label="Change profile picture"
    >
      <Avatar size="lg" className="size-[72px]" alt={username} seed={username} src={avatarUrl} />
      <HoverScrim show={hover || !avatarUrl} label="" rounded="rounded-full" />
    </button>
  )
}

function AvatarSection({
  avatarUrl,
  username
}: {
  avatarUrl?: string
  username: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const convex = useConvex()
  const remove = useMutation(api.profiles.removeAvatar)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [gifError, setGifError] = useState<string | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setGifError(null)
    if (f.type === 'image/gif') {
      // Cropping through a canvas would flatten the GIF to one frame, so upload it as-is.
      if (f.size > MAX_AVATAR_UPLOAD_BYTES) {
        setGifError('Max 10 MB')
        return
      }
      try {
        await uploadProfileImage(convex, 'avatar', f)
      } catch (err) {
        setGifError(err instanceof Error ? err.message : 'Upload failed')
      }
      return
    }
    setFile(f)
    setOpen(true)
  }

  const handleConfirm = async (blob: Blob): Promise<void> => {
    await uploadProfileImage(convex, 'avatar', blob)
    setOpen(false)
    setFile(null)
  }

  return (
    <section className="flex items-center gap-4">
      <AvatarSurface
        avatarUrl={avatarUrl}
        username={username}
        onClick={() => inputRef.current?.click()}
      />
      <div className="flex flex-1 flex-col">
        <span className="text-[14px] font-semibold text-text">Profile picture</span>
        <span className="text-[12px] font-medium text-text-tertiary">
          PNG, JPG, or GIF, 400×400+ recommended
        </span>
        {gifError ? <span className="text-[12px] font-medium text-red-400">{gifError}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="rounded-md"
          onClick={() => inputRef.current?.click()}
        >
          Change
        </Button>
        {avatarUrl ? (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md text-text-muted hover:text-red-400"
            onClick={() => remove()}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_AVATAR_TYPES.join(',')}
        className="hidden"
        onChange={handleFile}
      />
      <CropModal
        open={open}
        kind="avatar"
        file={file}
        onCancel={() => {
          setOpen(false)
          setFile(null)
        }}
        onConfirm={handleConfirm}
      />
    </section>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function useDebouncedSave<T>(
  value: T,
  initial: T,
  save: (v: T) => Promise<void>,
  delay = 800,
  enabled = true
): SaveState {
  const [state, setState] = useState<SaveState>('idle')
  const lastSavedRef = useRef(initial)
  useEffect(() => {
    if (value === lastSavedRef.current) return
    if (!enabled) {
      setState('idle')
      return
    }
    setState('saving')
    const id = setTimeout(async () => {
      try {
        await save(value)
        lastSavedRef.current = value
        setState('saved')
        setTimeout(() => setState('idle'), 1200)
      } catch {
        setState('error')
      }
    }, delay)
    return () => clearTimeout(id)
  }, [value, save, delay, enabled])
  return state
}

function StatusDot({ state }: { state: SaveState }): React.JSX.Element | null {
  if (state === 'idle') return null
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
        Saving
        <Ring className="size-3" />
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-tertiary">
        Saved
        <CheckCircleIcon className="size-3" />
      </span>
    )
  }
  return <span className="text-[11px] font-medium text-red-400">Error</span>
}

const displayNameForm = z.object({ displayName: displayNameSchema })

function DisplayNameField({ initial }: { initial: string }): React.JSX.Element {
  const update = useMutation(api.profiles.updateDisplayName)
  const {
    register,
    watch,
    formState: { errors }
  } = useForm<z.infer<typeof displayNameForm>>({
    defaultValues: { displayName: initial },
    resolver: zodResolver(displayNameForm),
    mode: 'onChange'
  })
  const value = watch('displayName')
  const error = errors.displayName?.message
  const state = useDebouncedSave(
    value,
    initial,
    async (v) => {
      const p = displayNameSchema.safeParse(v)
      if (!p.success) throw new Error(p.error.issues[0]?.message ?? 'Invalid')
      await update({ displayName: p.data })
    },
    800,
    !error
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-tertiary">Display name</span>
        <StatusDot state={state} />
      </div>
      <TextField {...register('displayName')} error={error} />
    </div>
  )
}

const usernameForm = z.object({ username: usernameSchema })

function UsernameField({ initial }: { initial: string }): React.JSX.Element {
  const update = useMutation(api.profiles.updateUsername)
  const {
    register,
    watch,
    formState: { errors }
  } = useForm<z.infer<typeof usernameForm>>({
    defaultValues: { username: initial },
    resolver: zodResolver(usernameForm),
    mode: 'onChange'
  })
  const value = watch('username')
  const schemaValid = usernameSchema.safeParse(value).success
  const available = useQuery(
    api.profiles.usernameAvailable,
    schemaValid && value !== initial ? { username: value } : 'skip'
  )
  const availabilityPending = schemaValid && value !== initial && available === undefined
  const availabilityError =
    schemaValid && value !== initial && available && !available.ok
      ? available.reason === 'taken'
        ? 'Username taken'
        : 'Invalid username'
      : undefined
  const error = errors.username?.message ?? availabilityError
  const state = useDebouncedSave(
    value,
    initial,
    async (v) => {
      const parsed = usernameSchema.safeParse(v)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid')
      if (parsed.data === initial) return
      await update({ username: parsed.data })
    },
    800,
    !error && !availabilityPending
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-tertiary">Username</span>
        <StatusDot state={state} />
      </div>
      <TextField {...register('username')} error={error} />
    </div>
  )
}

const bioForm = z.object({ bio: bioSchema })

function BioField({ initial }: { initial: string }): React.JSX.Element {
  const update = useMutation(api.profiles.updateBio)
  const {
    register,
    watch,
    formState: { errors }
  } = useForm<z.infer<typeof bioForm>>({
    defaultValues: { bio: initial },
    resolver: zodResolver(bioForm),
    mode: 'onChange'
  })
  const value = watch('bio')
  const state = useDebouncedSave(
    value,
    initial,
    async (v) => {
      const parsed = bioSchema.safeParse(v)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid')
      await update({ bio: parsed.data })
    },
    800,
    !errors.bio
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-tertiary">Bio</span>
        <div className="flex items-center gap-2">
          <StatusDot state={state} />
          <span className="text-[11px] font-medium text-text-muted tabular-nums">
            {value.length}/{BIO_MAX}
          </span>
        </div>
      </div>
      <TextArea {...register('bio')} rows={3} maxLength={BIO_MAX} error={errors.bio?.message} />
    </div>
  )
}
