/**
 * Render the drop mascot (rest pose) as favicon.svg plus the PNG sizes.
 *
 * The lighting is lifted straight from src/components/drop-mascot.astro so the
 * favicon and the mascot on the page are the same object: cast shadow, vertical
 * body gradient, a blue radial shade in the lower right, a soft rim plus a crisp
 * one, a specular highlight up on the left, and eyes that bloom a little.
 *
 * Run from apps/site: node scripts/gen-favicon.mjs
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const PUBLIC = join(dirname(dirname(fileURLToPath(import.meta.url))), "public")

const BODY =
  "M-44.0 -39.8 A62.2 62.2 0 1 0 44.0 -39.8 L10.6 -73.2 A15.0 15.0 0 0 0 -10.6 -73.2 Z"
const BOX = 150
const CX = 75
// Sits a touch high: the cast shadow falls below the drop and needs the room.
const CY = 74
const SCALE = 0.88
const TILT = -23
const EYES = [
  [31.7 - 14, -8.3],
  [31.7 + 14, -8.3],
]
const EYE_W = 14.5
const EYE_H = 32

// The mascot's stops are color-mix(in oklch, fill 72% white) and (fill 78% black),
// resolved here because SVG assets are rasterised without a CSS engine.
const FILL = "#7A3FE4"
const FILL_TOP = "#9A7CF0"
const FILL_BOT = "#562AA3"
const SHADE = "#1E46AA"

const eyes = EYES.map(
  ([x, y]) =>
    `<g filter="url(#glow)"><rect x="${(x - EYE_W / 2).toFixed(2)}" y="${(y - EYE_H / 2).toFixed(2)}" width="${EYE_W}" height="${EYE_H}" rx="${EYE_W / 2}" fill="#fff"/></g>`
).join("")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">
<defs>
<clipPath id="c"><path d="${BODY}"/></clipPath>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${FILL_TOP}"/>
<stop offset=".55" stop-color="${FILL}"/>
<stop offset="1" stop-color="${FILL_BOT}"/>
</linearGradient>
<radialGradient id="shade" cx=".35" cy=".3" r=".85">
<stop offset=".55" stop-color="${SHADE}" stop-opacity="0"/>
<stop offset="1" stop-color="${SHADE}" stop-opacity=".38"/>
</radialGradient>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="glow" x="-120%" y="-70%" width="340%" height="240%">
<feGaussianBlur stdDeviation="3" result="b"/>
<feComponentTransfer in="b" result="g"><feFuncA type="linear" slope=".6"/></feComponentTransfer>
<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>
<g transform="translate(${CX} ${CY}) rotate(${TILT}) scale(${SCALE})">
<path d="${BODY}" transform="translate(0 9)" fill="#000" opacity=".35" filter="url(#soft)"/>
<path d="${BODY}" fill="url(#body)"/>
<g clip-path="url(#c)">
<path d="${BODY}" fill="url(#shade)"/>
<path d="${BODY}" fill="none" stroke="#fff" stroke-width="10" opacity=".55" filter="url(#soft)"/>
<path d="${BODY}" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>
<ellipse cx="-20" cy="-40" rx="15" ry="22" fill="#fff" opacity=".3" filter="url(#soft)"/>
${eyes}
</g>
</g>
</svg>
`

await mkdir(PUBLIC, { recursive: true })
await writeFile(join(PUBLIC, "favicon.svg"), svg, "utf8")

/** Apple touch icons need an opaque background. */
const BG = "#121212"

async function png(name, size, background) {
  let img = sharp(Buffer.from(svg), { density: 72 * (1024 / BOX) }).resize(
    size,
    size
  )
  if (background) img = img.flatten({ background })
  await img.png({ compressionLevel: 9 }).toFile(join(PUBLIC, name))
  console.log(name, size)
}

await png("favicon.png", 32)
await png("favicon-192.png", 192)
await png("apple-touch-icon.png", 180, BG)
