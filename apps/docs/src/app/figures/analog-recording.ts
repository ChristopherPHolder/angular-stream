/**
 * One page sent through Analog 3.0.0's `renderStream()` and through this
 * library, as recorded on 2026-11-28: a heading with a button under it, and
 * two `@defer` blocks, the recommendations (their API answers after 0.9 s)
 * above the reviews (0.3 s).
 *
 * The `analog-steps` and `analog-timeline` figures draw these numbers, and
 * "Analog's streaming SSR, compared" (`content/guides/analog-streaming-ssr.md`)
 * prints them and says how they were captured. Change all three together, from
 * a new recording, never by hand.
 */

/** The names the two lanes go by, in this order everywhere. */
export const RENDERERS = { analog: 'Analog 3.0.0', here: 'angular-ssr-stream' } as const;

export type Renderer = keyof typeof RENDERERS;

/** When each API answered on the server, in seconds since the request. */
export const REVIEWS_DATA_AT = 0.3;
export const RECOMMENDATIONS_DATA_AT = 0.9;

/**
 * When something was true in Chrome, in seconds since the navigation started:
 * the median of five loads, to two places.
 */
export interface Moment {
  what: string;
  /** What the reader should take from the row. */
  note: string;
  analog: number;
  here: number;
}

export const MOMENTS: readonly Moment[] = [
  {
    what: 'The heading is on screen',
    note: 'Everything outside the blocks.',
    analog: 0.93,
    here: 0.02,
  },
  {
    what: 'The button under the heading answers a click',
    note: 'Outside the blocks too.',
    analog: 0.94,
    here: 0.02,
  },
  {
    what: 'The reviews can be read',
    note: 'Their API answers after 0.3 s.',
    analog: 0.93,
    here: 0.31,
  },
  {
    what: 'The reviews answer a click',
    note: 'Their own button.',
    analog: 0.95,
    here: 0.32,
  },
  {
    what: 'The recommendations can be read',
    note: 'Their API answers after 0.9 s.',
    analog: 0.93,
    here: 0.91,
  },
  {
    what: 'The recommendations answer a click',
    note: 'Their own button.',
    analog: 0.95,
    here: 0.92,
  },
];

/** A piece of a response: what one read of it held, and its size in bytes. */
export interface Piece {
  what: string;
  bytes: number;
}

export const PIECES: Record<Renderer, readonly Piece[]> = {
  analog: [
    { what: 'The head, an inline runtime and an empty preview region', bytes: 5291 },
    { what: 'Recommendations, in their loading state', bytes: 220 },
    { what: 'Reviews, in their loading state', bytes: 221 },
    {
      what: 'The whole document: the head again, the heading, both blocks with their data',
      bytes: 2974,
    },
  ],
  here: [
    {
      what: 'The shell: the head, the heading, both blocks in their loading state, the app’s script',
      bytes: 3910,
    },
    { what: 'Reviews, with their data', bytes: 481 },
    { what: 'Recommendations, with their data', bytes: 484 },
  ],
};

/** `0.31` as "0.31 s". */
export function seconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

/** `3910` as "3.9 kB". */
export function kilobytes(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}
