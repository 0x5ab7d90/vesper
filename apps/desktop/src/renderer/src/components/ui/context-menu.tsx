import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cn } from '@renderer/lib/cn'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { POPUP_MOTION } from '@renderer/components/ui/popup-motion'

const POPUP_CLASS = cn(
  'z-[120] flex min-w-[220px] flex-col gap-px bg-surface-2 p-1.5 outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.4)]',
  POPUP_MOTION
)

const POPUP_STYLE = squircleStyle('frame-sm')

const ITEM_BASE = cn(
  'flex h-8 items-center gap-3 rounded-md bg-transparent px-2.5 text-left text-[13px] leading-4 font-medium outline-none select-none data-[highlighted]:bg-white/[0.08]'
)

export const ContextMenu = {
  Root: BaseContextMenu.Root,
  Trigger: BaseContextMenu.Trigger,
  Portal: BaseContextMenu.Portal,
  Positioner: BaseContextMenu.Positioner,
  Popup: BaseContextMenu.Popup
} as const

interface RootProps {
  children: React.ReactNode
  trigger: React.ReactNode
}

export function ContextMenuRoot({ children, trigger }: RootProps): React.JSX.Element {
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger className="contents">{trigger}</BaseContextMenu.Trigger>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="z-[120]">
          <BaseContextMenu.Popup className={POPUP_CLASS} style={POPUP_STYLE}>
            {children}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}

interface PopoverProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  trigger: React.ReactNode
  children: React.ReactNode
}

export function ContextMenuPopover({
  open,
  onOpenChange,
  trigger,
  children
}: PopoverProps): React.JSX.Element {
  return (
    <BaseMenu.Root open={open} onOpenChange={onOpenChange}>
      <BaseMenu.Trigger render={trigger as React.ReactElement} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="z-[120]" align="end" side="bottom" sideOffset={6}>
          <BaseMenu.Popup className={POPUP_CLASS} style={POPUP_STYLE}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

interface ItemProps {
  icon?: React.ReactNode
  label: string
  onClick?: () => void
  danger?: boolean
  trailing?: React.ReactNode
}

export function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
  trailing
}: ItemProps): React.JSX.Element {
  return (
    <BaseContextMenu.Item
      onClick={onClick}
      className={cn(ITEM_BASE, danger ? 'text-[#ff5a5a]' : 'text-white')}
    >
      {icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </BaseContextMenu.Item>
  )
}

export function ContextMenuSeparator(): React.JSX.Element {
  return <BaseContextMenu.Separator className="my-1 h-px bg-white/[0.06]" />
}

interface ListRowProps {
  thumb?: React.ReactNode
  label: string
  onClick?: () => void
  trailing?: React.ReactNode
}

export function ContextMenuListRow({
  thumb,
  label,
  onClick,
  trailing
}: ListRowProps): React.JSX.Element {
  return (
    <BaseContextMenu.Item
      onClick={onClick}
      className={cn(
        'flex h-12 items-center gap-2.5 rounded-md bg-transparent px-1.5 text-left text-[13px] leading-4 font-medium text-white outline-none select-none data-[highlighted]:bg-white/[0.08]'
      )}
    >
      {thumb ? <span className="flex shrink-0 items-center">{thumb}</span> : null}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </BaseContextMenu.Item>
  )
}

interface SubmenuProps {
  icon?: React.ReactNode
  label: string
  children: React.ReactNode
}

export function ContextMenuSubmenu({ icon, label, children }: SubmenuProps): React.JSX.Element {
  return (
    <BaseContextMenu.SubmenuRoot>
      <BaseContextMenu.SubmenuTrigger
        className={cn(ITEM_BASE, 'text-white data-[popup-open]:bg-white/[0.08]')}
      >
        {icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRightGlyph />
      </BaseContextMenu.SubmenuTrigger>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="z-[120]" sideOffset={8} alignOffset={-6}>
          <BaseContextMenu.Popup className={POPUP_CLASS} style={POPUP_STYLE}>
            {children}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.SubmenuRoot>
  )
}

export function ContextMenuRadioGroup({
  value,
  onChange,
  children
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={onChange}>
      {children}
    </BaseMenu.RadioGroup>
  )
}

export function PlayGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M9.24 2.36C7.41 1.18 5 2.49 5 4.67V19.32C5 21.50 7.41 22.81 9.24 21.63L20.56 14.30C22.23 13.22 22.23 10.77 20.56 9.69L9.24 2.36Z" />
    </svg>
  )
}

export function PlusGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3C12.41 3 12.75 3.33 12.75 3.75V11.25H20.25C20.66 11.25 21 11.58 21 12C21 12.41 20.66 12.75 20.25 12.75H12.75V20.25C12.75 20.66 12.41 21 12 21C11.58 21 11.25 20.66 11.25 20.25V12.75H3.75C3.33 12.75 3 12.41 3 12C3 11.58 3.33 11.25 3.75 11.25H11.25V3.75C11.25 3.33 11.58 3 12 3Z"
      />
    </svg>
  )
}

export function ShareGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M12 1C12.20 1 12.40 1.08 12.54 1.23L16.79 5.73C17.07 6.03 17.06 6.51 16.76 6.79C16.46 7.07 15.98 7.06 15.70 6.76L12.75 3.63V13.25C12.75 13.66 12.41 14 12 14C11.58 14 11.25 13.66 11.25 13.25V3.63L8.29 6.76C8.01 7.06 7.53 7.07 7.23 6.79C6.93 6.51 6.92 6.03 7.20 5.73L11.45 1.23C11.59 1.08 11.79 1 12 1Z" />
      <path d="M4 11.75C4 10.23 5.23 9 6.75 9H9.75V13.25C9.75 14.49 10.75 15.5 12 15.5C13.24 15.5 14.25 14.49 14.25 13.25V9H17.25C18.76 9 20 10.23 20 11.75V18.25C20 19.76 18.76 21 17.25 21H6.75C5.23 21 4 19.76 4 18.25V11.75Z" />
    </svg>
  )
}

export function InfoGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.47 2 2 6.47 2 12C2 17.52 6.47 22 12 22C17.52 22 22 17.52 22 12C22 6.47 17.52 2 12 2ZM10 11C10 10.58 10.33 10.25 10.75 10.25H12C12.41 10.25 12.75 10.58 12.75 11L12.75 16.25C12.75 16.66 12.41 17 12 17C11.58 17 11.25 16.66 11.25 16.25L11.25 11.75H10.75C10.33 11.75 10 11.41 10 11ZM12 7.25C11.58 7.25 11.25 7.58 11.25 8C11.25 8.41 11.58 8.75 12 8.75C12.41 8.75 12.75 8.41 12.75 8C12.75 7.58 12.41 7.25 12 7.25Z"
      />
    </svg>
  )
}

export function EditGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.91 3L11.25 3C11.66 3 12 3.33 12 3.75C12 4.16 11.66 4.5 11.25 4.5H6.95C6.37 4.5 5.99 4.50 5.69 4.52C5.41 4.54 5.27 4.59 5.18 4.63C4.94 4.75 4.75 4.94 4.63 5.18C4.59 5.27 4.54 5.41 4.52 5.69C4.50 5.99 4.5 6.37 4.5 6.95V17.05C4.5 17.62 4.50 18.00 4.52 18.30C4.54 18.58 4.59 18.72 4.63 18.81C4.75 19.05 4.94 19.24 5.18 19.36C5.27 19.40 5.41 19.45 5.69 19.47C5.99 19.49 6.37 19.5 6.95 19.5H17.05C17.62 19.5 18.00 19.49 18.30 19.47C18.58 19.45 18.72 19.40 18.81 19.36C19.05 19.24 19.24 19.05 19.36 18.81C19.40 18.72 19.45 18.58 19.47 18.30C19.49 18.00 19.5 17.62 19.5 17.05V12.75C19.5 12.33 19.83 12 20.25 12C20.66 12 21 12.33 21 12.75V17.08C21 17.61 21 18.06 20.97 18.42C20.93 18.80 20.87 19.16 20.70 19.49C20.43 20.01 20.01 20.43 19.49 20.70C19.16 20.87 18.80 20.93 18.42 20.97C18.06 21 17.61 21 17.08 21H6.91C6.38 21 5.93 21 5.57 20.97C5.19 20.93 4.83 20.87 4.50 20.70C3.98 20.43 3.56 20.01 3.29 19.49C3.12 19.16 3.06 18.80 3.02 18.42C2.99 18.06 2.99 17.61 3 17.08V6.91C2.99 6.38 2.99 5.93 3.02 5.57C3.06 5.19 3.12 4.83 3.29 4.50C3.56 3.98 3.98 3.56 4.50 3.29C4.83 3.12 5.19 3.06 5.57 3.02C5.93 2.99 6.38 2.99 6.91 3Z"
      />
      <path d="M20.94 2.88C19.87 1.80 18.12 1.80 17.05 2.88L8.51 11.42C8.18 11.75 8 12.19 8 12.66V15.24C8 15.66 8.33 15.99 8.75 15.99H11.33C11.79 15.99 12.24 15.81 12.57 15.48L21.11 6.94C22.19 5.87 22.19 4.12 21.11 3.05L20.94 2.88Z" />
    </svg>
  )
}

export function TrashGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.86 5H3.25C2.83 5 2.5 5.33 2.5 5.75C2.5 6.16 2.83 6.5 3.25 6.5H3.99C3.99 6.51 4.00 6.53 4.00 6.55L4.90 19.44C5.00 20.88 6.20 22 7.65 22H16.34C17.79 22 18.99 20.88 19.09 19.44L19.99 6.55C19.99 6.53 20 6.51 20 6.5H20.75C21.16 6.5 21.5 6.16 21.5 5.75C21.5 5.33 21.16 5 20.75 5H16.13C15.68 3.13 14.00 1.75 12 1.75C9.99 1.75 8.31 3.13 7.86 5ZM9.43 5H14.56C14.16 3.97 13.16 3.25 12 3.25C10.83 3.25 9.83 3.97 9.43 5Z"
      />
    </svg>
  )
}

export function PinGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M4.01 12.32L7.31 15.62L3.21 19.71C2.92 20.01 2.92 20.48 3.21 20.78C3.51 21.07 3.98 21.07 4.28 20.78L8.37 16.68L11.67 19.98C13.27 21.58 15.99 20.68 16.34 18.46L17.08 13.65C17.14 13.24 17.40 12.89 17.77 12.71L20.52 11.39C22.23 10.57 22.62 8.31 21.28 6.97L17.02 2.71C15.68 1.37 13.42 1.76 12.60 3.47L11.28 6.22C11.10 6.59 10.75 6.85 10.34 6.91L5.53 7.65C3.31 8.00 2.41 10.72 4.01 12.32Z" />
    </svg>
  )
}

export function SignOutGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M15 12H4M4 12L7 9M4 12L7 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CheckGlyph(): React.JSX.Element {
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

function ChevronRightGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.46 3.46C8.76 3.17 9.23 3.17 9.53 3.46L16.11 10.05C17.19 11.12 17.19 12.87 16.11 13.94L9.53 20.53C9.23 20.82 8.76 20.82 8.46 20.53C8.17 20.23 8.17 19.76 8.46 19.46L15.05 12.88C15.54 12.39 15.54 11.60 15.05 11.11L8.46 4.53C8.17 4.23 8.17 3.76 8.46 3.46Z"
      />
    </svg>
  )
}
