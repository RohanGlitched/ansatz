/**
 * The picture a gallery card shows for an experiment: its Marey print (/prints/<id>.webp), or, where that print is
 * hard to read (a tall bob printed over itself), frames of the real swing side by side, cut from the clip.
 */
const STRIPS: Record<string, string> = {
  "foucault-pendulum": "/prints/foucault-pendulum-strip.webp",
  "foucault-pendulum-5x": "/prints/foucault-pendulum-5x-strip.webp",
};

export const printOf = (id: string) => STRIPS[id] ?? `/prints/${id}.webp`;
