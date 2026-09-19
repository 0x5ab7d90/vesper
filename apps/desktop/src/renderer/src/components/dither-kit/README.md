# dither-kit (vendored)

Source: https://www.tripwire.sh/dither-kit, pulled from the shadcn registry at
`https://tripwire.sh/r/<name>.json` for `core`, `bar-chart`, `area-chart`, `radar-chart`, `pie-chart`.

Kept as close to upstream as possible so a fresh registry pull can be diffed in. Local
changes, all marked in the files:

- `palette.ts`: adds the `violet` colour, the app's mascot purple.

The components read shadcn token names (`text-muted-foreground`, `bg-popover`, `stroke-border`,
…). Those are aliased onto Vesper's tokens in `assets/main.css` rather than edited here.

To update: download the registry JSON, extract each file's `content`, copy over this folder,
then re-apply the changes above and run prettier.
