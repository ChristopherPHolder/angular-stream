import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { HttpBackend, provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { EXAMPLE_RUNTIME, ExampleBackend } from '@angular-stream/stream-example';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    // After `provideHttpClient()`: the example's fake API, answered in-process.
    { provide: HttpBackend, useExisting: ExampleBackend },
    {
      provide: EXAMPLE_RUNTIME,
      // `vp build --mode edge` builds the Edge Function; dev runs the Netlify Function.
      useValue: import.meta.env.MODE === 'edge' ? 'Netlify Edge Functions' : 'Netlify Functions',
    },
    provideClientHydration(withEventReplay()),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
