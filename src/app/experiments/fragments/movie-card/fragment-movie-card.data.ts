import { InjectionToken } from '@angular/core';

export type FragmentMovieCardData = {
  id: string;
  title: string;
  year: string;
  rating: string;
  summary: string;
  genres: string[];
};

export const FRAGMENT_MOVIE_CARD_DATA =
  new InjectionToken<FragmentMovieCardData>('FRAGMENT_MOVIE_CARD_DATA');

export const fragmentMovieCardFixtures: Record<string, FragmentMovieCardData> = {
  '1': {
    id: '1',
    title: 'The Angular Heist',
    year: '2026',
    rating: '8.7/10',
    summary:
      'A small team probes Angular SSR internals to discover whether streamable fragments can be rendered independently and shipped out of order.',
    genres: ['Research', 'Thriller', 'Technology'],
  },
  '2': {
    id: '2',
    title: 'Standalone by Design',
    year: '2025',
    rating: '7.9/10',
    summary:
      'An isolated fragment experiment proves that a single standalone component can be rendered on the server without the full application shell.',
    genres: ['Experiment', 'Drama'],
  },
};

export function getFragmentMovieCardData(
  id: string
): FragmentMovieCardData | undefined {
  return fragmentMovieCardFixtures[id];
}
