import ditherPng from '@renderer/assets/brand/dither-mascot.png'

/* GitHub's banner dither, pixel for pixel, recoloured to the mascot's purple. Sits in a
   frame's top-right corner at 1:1, kept to the right half so it never crowds the header
   controls, fades in from the left and out down the right gutter, and paints beneath the
   content layer. The host frame must be `relative` and its content `relative` too. */
export function DitherCorner({
  fadeFrom = 48,
  fadeTo = 134
}: {
  /** Height in px that stays fully opaque before the field fades out downward. */
  fadeFrom?: number
  /** Height in px by which the field is fully gone. Keep it above any translucent chrome. */
  fadeTo?: number
}): React.JSX.Element {
  const mask = `linear-gradient(to right, transparent 0%, black 55%), linear-gradient(to bottom, black ${fadeFrom}px, transparent ${fadeTo}px)`
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 -z-10 h-[134px] w-[56%]"
      style={{
        backgroundImage: `url(${ditherPng})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '100% 0',
        backgroundSize: 'auto 134px',
        maskImage: mask,
        WebkitMaskImage: mask,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in'
      }}
    />
  )
}
