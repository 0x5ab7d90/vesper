/**
 * The mascot's moods, in the order the lab and any picker should list them. Kept next to the
 * component rather than inside it so a file that only needs the list does not pull in the SVG.
 *
 * - idle: the five second daydream loop. With `loop` off it holds the rest pose.
 * - glance: looks left, then right, then back. For "no matches".
 * - confused: tilted the other way, one eye narrowed, a slow wobble. For not found and errors.
 * - waiting: shrinks and sits upright while a ring of twelve dots turns around it; the eyes follow
 *   the leading dot. With a percentage, dots light up in proportion. For loading and updates.
 * - sleepy: slumped, eyes nearly shut, slow breathing. For picture-in-picture.
 * - happy: pops in and the eyes fold into two smiling arches. For success moments.
 */
export type DropMood = 'idle' | 'glance' | 'confused' | 'waiting' | 'sleepy' | 'happy'

export const DROP_MOODS: DropMood[] = ['idle', 'glance', 'confused', 'waiting', 'sleepy', 'happy']
