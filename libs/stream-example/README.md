# @angular-stream/stream-example

The smallest page that streams, `ExamplePage` (the root component, `app-root`), shared by every runtime example
(`apps/example-*`): a heading and some text sent at once, and one widget whose
data takes `EXAMPLE_DELAY_MS` to arrive, rendered on the server once it does
and streamed into the open page.

The data comes from `ExampleBackend`, a fake API inside the app, so the
examples need no network and the delay is fixed.

An example app supplies only what differs between runtimes: `index.html`,
`src/main.ts`, its `app.config.ts` (the stream's providers come from
`@push-based/angular-stream-core`, which a `type:lib` project can't import)
and its server entry.

```ts
// app.config.ts
import { HttpBackend, provideHttpClient, withInterceptors } from '@angular/common/http';
import { EXAMPLE_RUNTIME, ExampleBackend } from '@angular-stream/stream-example';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    { provide: HttpBackend, useExisting: ExampleBackend },
    { provide: EXAMPLE_RUNTIME, useValue: 'Node' },
    provideClientHydration(withEventReplay()),
    provideStreamHydration(),
  ],
};
```

Checking that an example streams: `curl -N` the page and note when each part
arrives. The shell (with the widget's placeholder) comes at once; the widget,
in a `<template>` chunk, `EXAMPLE_DELAY_MS` later. A response that arrives all
at once after the delay was buffered somewhere.
