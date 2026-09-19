import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { AuthSplitLayout } from '@renderer/components/auth/auth-split-layout'

export const Route = createFileRoute('/forgot')({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: ForgotPage
})

function ForgotPage(): React.JSX.Element {
  return (
    <AuthSplitLayout>
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-balance text-text">
          Reset password
        </h1>
        <p className="text-[14px] leading-5 font-medium text-text-secondary">
          Email-based password reset is coming soon. For now, contact support if you can't sign in.
        </p>
      </header>
      <Link
        to="/signin"
        className="text-center text-[13px] leading-4 font-semibold text-text outline-none"
      >
        Back to sign in
      </Link>
    </AuthSplitLayout>
  )
}
