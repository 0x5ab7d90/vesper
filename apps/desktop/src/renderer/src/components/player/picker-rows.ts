import { EASE_OUT } from '@renderer/lib/motion'

// The source picker's row anatomy, shared by every list that wears its frame:
// a quality chip, the row's name, and a trailing icon, fading in as rows land.

export const ROW_ANIM = { duration: 0.18, ease: EASE_OUT }

export const ROW_CLASS =
  'flex items-center justify-between gap-2.5 rounded-[10px] py-2.5 pr-3 pl-2.5 text-left outline-none transition-colors'

export const CHIP_CLASS =
  'flex h-5 w-14 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[11px] leading-3.5 font-medium tracking-[0.02em] text-text'
