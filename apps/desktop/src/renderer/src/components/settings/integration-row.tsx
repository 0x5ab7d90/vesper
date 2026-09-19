/** One integration in Settings: icon, name, a line about it, and its action on the right. */
export function Row({
  icon,
  title,
  description,
  trailing
}: {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  trailing: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-1 py-3 last:border-b-0">
      <div className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px]">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] leading-4 font-medium text-text">{title}</span>
        <span className="truncate text-[12px] leading-4 font-medium text-text-muted">
          {description}
        </span>
      </div>
      {trailing}
    </div>
  )
}
