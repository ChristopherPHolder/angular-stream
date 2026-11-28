import { HttpBackend, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';
import { routes } from './app.routes';
import { FakeBackend } from './backend';
import { changeDetection } from './change-detection';

export const appConfig: ApplicationConfig = {
  providers: [
    changeDetection,
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([streamHttpInterceptor])),
    { provide: HttpBackend, useExisting: FakeBackend },
    // On by default from Angular 22; 19 to 21 need it spelled out.
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    provideStreamHydration(),
  ],
};
