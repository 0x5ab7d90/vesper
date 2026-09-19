// Shared motion vocabulary for motion/react call sites. The curves mirror the CSS tokens in
// assets/main.css (--ease-out, --ease-in-out) so JS-driven and CSS-driven motion settle the
// same way.

/** The ease-out for anything the user triggers: moves at once, then composes itself. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number]

/** Accelerating away; only for exits, which nobody needs to see settle. */
export const EASE_IN = [0.4, 0, 1, 1] as [number, number, number, number]

/**
 * The default exit: fade, no travel, about half the entrance, easing in. Something leaving
 * deserves less ceremony than something arriving. Spread into an `exit` prop.
 */
export const EXIT_FADE = {
  opacity: 0,
  transition: { duration: 0.1, ease: EASE_IN }
} as const
