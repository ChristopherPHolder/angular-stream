/**
 * The figures a page can hold: a drawing that moves, where a picture explains
 * more than text. A page places one with a line of its own,
 * `<!-- figure <name> -->`; `DocPage` renders it there, and the build fails on
 * a name that is not listed here (`markdown.ts`).
 *
 * A figure needs no request: the docs are static. What only a live streamed
 * response can show belongs in the demo.
 */
export const FIGURES = ['race', 'response'] as const;

export type FigureName = (typeof FIGURES)[number];
