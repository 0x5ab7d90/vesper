import { cn } from '@renderer/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}): React.JSX.Element {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )
  return (
    <div
      role="tablist"
      className={cn(
        // Equal columns sized to the widest label, so the sliding highlight's
        // (100% / n) width lines up with every tab.
        'relative grid h-8 auto-cols-fr grid-flow-col items-center rounded-full bg-white/[0.06] p-0.5',
        className
      )}
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-white transition-transform duration-200 ease-(--ease-out)"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 flex h-7 items-center justify-center rounded-full px-3.5 text-[13px] leading-4 font-medium whitespace-nowrap outline-none',
            o.value === value ? 'text-black' : 'text-text-tertiary'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
