// The mascot's eye, as two shapes with identical structure (a move then six cubics, closed) so
// one can be tweened into the other point for point. Both are centred on the origin and start
// at the bottom tip, running counter-clockwise: the pill's bottom cap and left side become the
// heart's left lobe, its top cap becomes the dip, and so on round.

/** The resting pill: 14.5 wide, 32 tall, fully rounded. */
export const PILL = [
  0, 16, -4, 16, -7.25, 12.75, -7.25, 8.75, -7.25, 3, -7.25, -3, -7.25, -8.75,
  -7.25, -12.75, -4, -16, 0, -16, 4, -16, 7.25, -12.75, 7.25, -8.75, 7.25, -3,
  7.25, 3, 7.25, 8.75, 7.25, 12.75, 4, 16, 0, 16,
]

/** The heart, 27 wide and 25 tall. The eyes spread apart while in this state so the pair
 * never touch once the idle loop widens them. */
export const HEART = [
  0, 11.9, -3.2, 8.75, -13.5, 3.1, -13.5, -3.1, -13.5, -9.4, -10.5, -13.1, -6.7,
  -13.1, -3.2, -13.1, -0.8, -11.25, 0, -8.1, 0.8, -11.25, 3.2, -13.1, 6.7,
  -13.1, 10.5, -13.1, 13.5, -9.4, 13.5, -3.1, 13.5, 3.1, 3.2, 8.75, 0, 11.9,
]

/** Builds a path `d` from a shape, or from a blend of the two at `t` (0 = pill, 1 = heart). */
export function eyePath(t: number): string {
  const n = (i: number): string =>
    (PILL[i] + (HEART[i] - PILL[i]) * t).toFixed(2)
  let d = `M${n(0)} ${n(1)}`
  for (let i = 2; i < PILL.length; i += 6) {
    d += ` C${n(i)} ${n(i + 1)} ${n(i + 2)} ${n(i + 3)} ${n(i + 4)} ${n(i + 5)}`
  }
  return d + " Z"
}
