This setup builds the app with Vite and
[`@push-based/vite-plugin-ngp`](https://github.com/push-based/vite-plugin-ngp),
not the Angular CLI. For an app made by `ng new --ssr` that keeps
`@angular/ssr`, follow [Angular CLI](../getting-started/angular-cli.md)
instead.

ngp needs Node 26 to build, Vite 8.3 or later, TypeScript 6.0, and every
`@angular/*` package at exactly `22.3.0-rc.0`, the release it compiles
against:

```bash
npm install @angular/core@22.3.0-rc.0 @angular/common@22.3.0-rc.0 @angular/compiler@22.3.0-rc.0 \
  @angular/platform-browser@22.3.0-rc.0 @angular/platform-server@22.3.0-rc.0 \
  @angular/router@22.3.0-rc.0 rxjs tslib
npm install -D @angular/compiler-cli@22.3.0-rc.0 @push-based/vite-plugin-ngp vite typescript@~6.0
```

The app is an ES module (`"type": "module"` in `package.json`), with
`vite/client` in its `tsconfig.json`'s `types`. Vite starts from an
`index.html` that loads `src/main.ts`, which bootstraps the root component as
usual:

```html title="index.html"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts title="src/main.ts"
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error) => console.error(error));
```

The steps below call the root component `App`, in `src/app/app.ts`, and its
routes `routes`, in `src/app/app.routes.ts`.
