import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { HttpBackend, provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DemoBackend } from './demo-backend';
import { routes } from './routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    // After `provideHttpClient()`: answers every request in-process, with the
    // delay the URL asks for. See `DemoBackend`.
    { provide: HttpBackend, useExisting: DemoBackend },
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
