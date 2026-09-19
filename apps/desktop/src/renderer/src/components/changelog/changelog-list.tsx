import type { ComponentProps } from 'react'
import {
  latestEntry,
  SectionHeader,
  SparklesIcon,
  BugIcon,
  BroomSparkleIcon,
  TrashCanIcon
} from '@vesper/changelog'

const SECTION_ICONS: Record<string, React.ReactNode> = {
  New: <SparklesIcon />,
  Improvements: <BroomSparkleIcon />,
  Fixes: <BugIcon />,
  Removed: <TrashCanIcon />
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC'
})

const mdxComponents = {
  h2: ({ children }: ComponentProps<'h2'>) => (
    <SectionHeader icon={typeof children === 'string' ? SECTION_ICONS[children] : undefined}>
      {children}
    </SectionHeader>
  ),
  h3: (props: ComponentProps<'h3'>) => (
    <h4 {...props} className="mt-6 mb-2 text-[13px] leading-4 font-semibold text-text" />
  ),
  p: (props: ComponentProps<'p'>) => (
    <p {...props} className="my-3 text-[14px] leading-6 text-text-secondary" />
  ),
  ul: (props: ComponentProps<'ul'>) => (
    <ul
      {...props}
      className="my-3 flex flex-col gap-1.5 pl-[23px] text-[14px] leading-6 text-text-secondary"
    />
  ),
  li: (props: ComponentProps<'li'>) => (
    <li
      {...props}
      className="relative pl-5 before:absolute before:top-0 before:left-0 before:text-text-tertiary before:content-['–']"
    />
  ),
  a: (props: ComponentProps<'a'>) => (
    <a {...props} className="text-text underline underline-offset-2 outline-none" />
  ),
  hr: (props: ComponentProps<'hr'>) => <hr {...props} className="my-5 border-white/[0.06]" />,
  code: (props: ComponentProps<'code'>) => (
    <code
      {...props}
      className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[12.5px] text-text"
    />
  )
}

export function ChangelogList(): React.JSX.Element {
  const entry = latestEntry()
  if (!entry) return <div />
  const Body = entry.body
  return (
    <article className="flex flex-col">
      <header className="flex flex-col gap-1 pb-2">
        <h2 className="text-[18px] leading-6 font-bold tracking-[-0.01em] text-text tabular-nums">
          v{entry.version}
        </h2>
        <p className="text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
          {dateFmt.format(new Date(entry.date))}
        </p>
      </header>
      <div className="-mt-2">
        <Body components={mdxComponents} />
      </div>
    </article>
  )
}
