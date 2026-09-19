// A faint edge painted just inside every image, so a pale poster or a photo with a bright
// corner still has a shape against the surface. Too faint to read as a border; you only
// notice that every image suddenly has an edge.

/** For an `<img>` (or any element with no children): an outline pulled one pixel inside. */
export const IMG_OUTLINE = 'outline-1 -outline-offset-1 outline-white/10'

/**
 * For a positioned container whose image sits underneath children (a card with a gradient
 * and text on top): a pseudo-element ring drawn over everything, so the edge stays visible.
 */
export const IMAGE_EDGE =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-white/10 after:ring-inset after:content-['']"
