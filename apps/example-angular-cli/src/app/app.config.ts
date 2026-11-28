import { HttpBackend, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { EXAMPLE_RUNTIME, ExampleBackend } from '@angular-ssr-stream/stream-example';
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([streamHttpInterceptor])),
    // After `provideHttpClient()`: the example's fake API, answered in-process.
    { provide: HttpBackend, useExisting: ExampleBackend },
    { provide: EXAMPLE_RUNTIME, useValue: 'the Angular CLI' },
    provideClientHydration(withEventReplay()),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
