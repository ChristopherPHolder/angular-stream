Add the interceptor and the stream's providers next to Angular's hydration:

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

`streamHttpInterceptor` reports each request to the renderer on the server,
and in the browser holds back a request the server is already making until its
response arrives on the stream. `provideStreamHydration()` keeps Angular's
hydration data and block registry in step with the chunks.
