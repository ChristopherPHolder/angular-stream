import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';
import { HttpBackend, provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { EXAMPLE_RUNTIME, ExampleBackend } from '@angular-ssr-stream/stream-example';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    // After `provideHttpClient()`: the example's fake API, answered in-process.
    { provide: HttpBackend, useExisting: ExampleBackend },
    { provide: EXAMPLE_RUNTIME, useValue: 'AWS Lambda' },
    provideClientHydration(withEventReplay()),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
