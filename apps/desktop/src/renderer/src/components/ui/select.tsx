import type { ReactNode } from 'react'
import { Select as BaseSelect } from '@base-ui/react/select'
import { cn } from '@renderer/lib/cn'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
}

interface Props {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  ariaLabel?: string
  className?: string
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className
}: Props): React.JSX.Element {
  return (
    <BaseSelect.Root value={value} onValueChange={(v) => onChange(v ?? '')}>
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-8 min-w-[140px] shrink-0 items-center justify-between gap-2 rounded-md bg-white/[0.06] px-3.5 text-[13px] leading-4 font-medium text-text outline-none data-[popup-open]:bg-white/[0.10]',
          className
        )}
      >
        <BaseSelect.Value>
          {(v) => {
            const key = Array.isArray(v) ? v[0] : v
            const opt = options.find((o) => o.value === key)
            return (
              <span className="flex min-w-0 items-center gap-2">
                {opt?.icon ? (
                  <span
                    className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-full"
                    aria-hidden
                  >
                    {opt.icon}
                  </span>
                ) : null}
                <span className="truncate">{opt?.label ?? '—'}</span>
              </span>
            )
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon>
          <ChevronDown />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-[120] outline-none"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup
            className={cn(
              'min-w-[var(--anchor-width)] overflow-hidden border border-white/[0.06] bg-surface-2 outline-none shadow-[0_4px_16px_rgba(0,0,0,0.3)]'
            )}
            style={squircleStyle('frame-sm')}
          >
            <BaseSelect.List className="flex max-h-[320px] flex-col gap-1 overflow-y-auto p-1.5">
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg bg-transparent px-3 py-2 text-[14px] leading-5 font-medium text-white outline-none select-none data-[highlighted]:bg-white/[0.08]'
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {o.icon ? (
                      <span
                        className="grid size-4 shrink-0 place-items-center text-white/80 [&_svg]:size-full"
                        aria-hidden
                      >
                        {o.icon}
                      </span>
                    ) : null}
                    <span className="truncate">
                      <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                    </span>
                  </span>
                  <BaseSelect.ItemIndicator className="grid size-4 shrink-0 place-items-center">
                    <CheckMark />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

function ChevronDown(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.46 8.46C3.76 8.17 4.23 8.17 4.53 8.46L11.11 15.05C11.60 15.54 12.39 15.54 12.88 15.05L19.46 8.46C19.76 8.17 20.23 8.17 20.53 8.46C20.82 8.76 20.82 9.23 20.53 9.53L13.94 16.11C12.87 17.19 11.12 17.19 10.05 16.11L3.46 9.53C3.17 9.23 3.17 8.76 3.46 8.46Z"
      />
    </svg>
  )
}

function CheckMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
