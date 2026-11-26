import { ApplicationConfig } from '@angular/core';
import { provideFastSVG } from '@push-based/ngx-fast-svg';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { tmdbContentTypeInterceptor } from './data-access/api/tmdbContentTypeInterceptor';
import { tmdbReadAccessInterceptor } from './auth/tmdb-http-interceptor.feature';
import { provideTmdbImageLoader } from './data-access/images/image-loader';
import { provideRouter } from '@angular/router';
import { ROUTES } from './routes';
import { provideStreamHydration, streamHttpInterceptor } from '@angular-stream/streaming';
import {
  provideClientHydration,
  withEventReplay,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([
        streamHttpInterceptor,
        tmdbContentTypeInterceptor,
        tmdbReadAccessInterceptor,
      ]),
    ),
    provideTmdbImageLoader(),
    provideFastSVG({ url: (name: string) => `assets/svg-icons/${name}.svg` }),
    provideRouter(ROUTES),
    provideClientHydration(
      withEventReplay(),
      // Every TMDB request carries the read access token, and Angular leaves
      // authenticated requests out of the transfer cache unless told
      // otherwise. The token ships in the client bundle anyway, and without
      // the cache the client would refetch what the server just rendered.
      withHttpTransferCacheOptions({ includeRequestsWithAuthHeaders: true }),
    ),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
