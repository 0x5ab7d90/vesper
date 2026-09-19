// Entrance and exit for every anchored popup (menus, selects, popovers). Base UI sets
// `--transform-origin` to the anchor side, so the popup grows out of the thing that opened
// it; 0.95 is a hint of movement, not a zoom. The exit is half the length and quieter.

export const POPUP_MOTION =
  'origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-(--ease-out) data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-75'

/** Centred dialogs: no anchor, so scale from the middle and lean on the fade. */
export const DIALOG_MOTION =
  'transition-[opacity,scale] duration-150 ease-(--ease-out) data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-75'

export const BACKDROP_MOTION =
  'transition-opacity duration-150 ease-(--ease-out) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75'

/** Popups that hang off a full-width bar (the search field) fade without scaling. */
export const SHEET_MOTION =
  'transition-opacity duration-150 ease-(--ease-out) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75'
