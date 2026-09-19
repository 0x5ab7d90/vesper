import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/coming-soon')({
  component: ComingSoonPage
})

function ComingSoonPage(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 pb-8 text-center">
      <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] text-text">
        Coming soon
      </h1>
      <p className="max-w-[360px] text-[14px] leading-5 font-medium text-text-secondary">
        We're still building this part of vesper. Check back shortly.
      </p>
    </div>
  )
}
