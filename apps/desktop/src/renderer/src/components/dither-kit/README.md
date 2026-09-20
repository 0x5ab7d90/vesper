# dither-kit (vendored)

Source: https://www.tripwire.sh/dither-kit, pulled from the shadcn registry at
`https://tripwire.sh/r/<name>.json` for `core`, `bar-chart`, `area-chart`, `radar-chart`,
`pie-chart`, `avatar`.

Kept as close to upstream as possible so a fresh registry pull can be diffed in. Local
changes, all marked in the files:

- `palette.ts`: adds the `violet` colour, the app's mascot purple. The `avatar` item ships its
  own copy of this file; the local one wins and is not overwritten on a pull.
- `avatar.tsx` / `pixel.ts`: the generative avatar, taken verbatim. Used wherever a person or a
  list has no picture of its own, seeded by username or list name.
- `heatmap-*.tsx`: a heat map family the kit doesn't ship. `HeatmapChart` takes `rows`,
  `columns` and a `values[row][column]` grid and paints one dithered tile per cell, density
  following the value; `HeatmapXAxis` / `HeatmapYAxis` / `HeatmapValues` compose inside it and
  the shared `<Tooltip>` works unchanged via the common context. Built on the kit's own
  primitives (`dither-paint`, `palette`, `use-chart-dimensions`, `useRevision`) in the shape of
  the polar root, so an upstream heat map could replace it later.

The components read shadcn token names (`text-muted-foreground`, `bg-popover`, `stroke-border`,
…). Those are aliased onto Vesper's tokens in `assets/main.css` rather than edited here.

To update: download the registry JSON, extract each file's `content`, copy over this folder,
then re-apply the changes above and run prettier.
