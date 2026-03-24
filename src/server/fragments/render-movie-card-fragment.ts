import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import {
  FragmentMovieCardData,
  FRAGMENT_MOVIE_CARD_DATA,
  getFragmentMovieCardData,
} from '../../app/experiments/fragments/movie-card/fragment-movie-card.data';
import { FragmentMovieCardComponent } from '../../app/experiments/fragments/movie-card/fragment-movie-card.component';

const FRAGMENT_DOCUMENT = `<!doctype html><html><head></head><body><exp-fragment-movie-card></exp-fragment-movie-card></body></html>`;

const FRAGMENT_APP_CONFIG: ApplicationConfig = {
  providers: [provideServerRendering()],
};

export class FragmentRenderNotFoundError extends Error {
  constructor(readonly fragmentId: string) {
    super(`No fragment fixture was found for id "${fragmentId}".`);
    this.name = 'FragmentRenderNotFoundError';
  }
}

export async function renderMovieCardFragment(id: string): Promise<string> {
  const movie = getFragmentMovieCardData(id);

  if (!movie) {
    throw new FragmentRenderNotFoundError(id);
  }

  const renderedDocument = await renderMovieCardFragmentDocument(movie);
  return extractRenderedFragmentHtml(renderedDocument);
}

async function renderMovieCardFragmentDocument(
  movie: FragmentMovieCardData
): Promise<string> {
  return renderApplication(
    (context: BootstrapContext) =>
      bootstrapApplication(
        FragmentMovieCardComponent,
        mergeApplicationConfig(FRAGMENT_APP_CONFIG, {
          providers: [
            {
              provide: FRAGMENT_MOVIE_CARD_DATA,
              useValue: movie,
            },
          ],
        }),
        context
      ),
    {
      document: FRAGMENT_DOCUMENT,
      url: `/fragments/movie-card/${movie.id}`,
    }
  );
}

function extractRenderedFragmentHtml(documentHtml: string): string {
  const fragmentHtml = documentHtml
    .replace(/^[\s\S]*<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '')
    .trim();

  if (!fragmentHtml) {
    throw new Error('Angular fragment render completed, but the body was empty.');
  }

  return fragmentHtml;
}
