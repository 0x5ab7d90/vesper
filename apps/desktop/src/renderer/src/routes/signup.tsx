import { useState } from 'react'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@renderer/components/ui/button'
import { TextField } from '@renderer/components/ui/text-field'
import { AuthSplitLayout } from '@renderer/components/auth/auth-split-layout'
import { DiscordIcon } from '@renderer/components/icons'
import { signUpSchema, type SignUpValues } from '@renderer/lib/auth-schemas'
import { signInWithDiscord } from '@renderer/lib/discord-oauth'

export const Route = createFileRoute('/signup')({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: SignUpPage
})

function SignUpPage(): React.JSX.Element {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched'
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await signIn('password', { ...values, flow: 'signUp' })
      navigate({ to: '/' })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign up failed')
    }
  })

  return (
    <AuthSplitLayout>
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-balance text-text">
          Create your account
        </h1>
        <p className="text-[14px] leading-5 font-medium text-text-secondary">
          One library for everything you'll ever watch.
        </p>
      </header>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <TextField
          label="Name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError ? (
          <p className="text-[13px] leading-4 font-medium text-red-400">{serverError}</p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="h-12">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <Divider>or</Divider>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="h-12 gap-2"
        onClick={() => void signInWithDiscord(signIn)}
      >
        <DiscordIcon className="size-4" />
        Continue with Discord
      </Button>
      <p className="text-center text-[13px] leading-4 font-medium text-text-secondary">
        Already a member?{' '}
        <Link to="/signin" className="font-semibold text-text outline-none">
          Sign in
        </Link>
      </p>
    </AuthSplitLayout>
  )
}

function Divider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[12px] leading-4 font-medium text-text-tertiary">{children}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}
