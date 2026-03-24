import assert from 'node:assert/strict';
import { DOCUMENT } from '@angular/common';
import { ApplicationConfig, createComponent, PlatformRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  INITIAL_CONFIG,
  platformServer,
  provideServerRendering,
  ɵrenderInternal as renderInternal,
} from '@angular/platform-server';
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

  return renderMovieCardFragmentDocument(movie);
}

async function renderMovieCardFragmentDocument(
  movie: FragmentMovieCardData
): Promise<string> {
  const platformRef = platformServer([
    {
      provide: INITIAL_CONFIG,
      useValue: {
        document: FRAGMENT_DOCUMENT,
        url: `/fragments/movie-card/${movie.id}`,
      },
    },
  ]);

  try {
    const appRef = await createApplication(
      {
        ...FRAGMENT_APP_CONFIG,
        providers: [
          ...(FRAGMENT_APP_CONFIG.providers ?? []),
          {
            provide: FRAGMENT_MOVIE_CARD_DATA,
            useValue: movie,
          },
        ],
      },
      { platformRef }
    );

    const document = appRef.injector.get(DOCUMENT);
    const hostElement = document.querySelector('exp-fragment-movie-card');

    assert(hostElement, 'Angular fragment render could not find the fragment host element.');

    const componentRef = createComponent(FragmentMovieCardComponent, {
      environmentInjector: appRef.injector,
      hostElement,
    });

    appRef.attachView(componentRef.hostView);
    componentRef.changeDetectorRef.detectChanges();
    await appRef.whenStable();
    await renderInternal(platformRef, appRef);

    const renderedHostElement = componentRef.location.nativeElement as Element | null;
    assert(renderedHostElement, 'Angular fragment render completed, but the rendered host element was not found.');

    const fragmentHtml = renderedHostElement.outerHTML.trim();

    assert(fragmentHtml, 'Angular fragment render completed, but the fragment HTML was empty.');

    return fragmentHtml;
  } finally {
    await destroyPlatform(platformRef);
  }
}

function destroyPlatform(platformRef: PlatformRef): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      platformRef.destroy();
      resolve();
    }, 0);
  });
}
