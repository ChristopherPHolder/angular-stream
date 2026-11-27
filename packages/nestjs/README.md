<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-stream/main/press-kit/logo/png/angular-stream-logo.png"
    alt="angular-stream"
    width="420"
  />
</p>

# @push-based/angular-stream-nestjs

Streamed server-side rendering for Angular in a NestJS app. The browser starts
hydrating the page while the response is still arriving. `AngularStreamModule`
renders every `GET` that nothing else in the app answers, on `@nestjs/platform-express`,
through the Node adapter,
[`@push-based/angular-stream-node`](https://www.npmjs.com/package/@push-based/angular-stream-node).

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-nestjs@next
```

```ts
// src/app.module.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { AngularStreamModule } from '@push-based/angular-stream-nestjs';

@Module({
  imports: [
    AngularStreamModule.forRoot({
      rootComponent: App,
      config, // the server ApplicationConfig
      eventDispatchContract, // for withEventReplay()
      allowedHosts: ['localhost', 'my-app.example.com'],
      template: new URL('./index.server.html', import.meta.url),
      staticDir: new URL('../client/', import.meta.url),
    }),
  ],
  controllers: [HelloController],
})
export class AppModule {}
```

```ts
// src/server.ts
import 'reflect-metadata';
import { createRequestListener } from '@push-based/angular-stream-nestjs';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api'); // the API under /api, pages everywhere else

export default createRequestListener(app); // for `vite dev`

if (import.meta.env.PROD) {
  await app.listen(Number(process.env['PORT'] ?? 3000));
}
```

```ts
// vite.config.ts
import { angularStreamNest } from '@push-based/angular-stream-nestjs/vite';

plugins: [angularStreamNest({ entry: 'src/server.ts' }), ngp({ ssr: { entry: 'src/server.ts' } })];
```

- [The docs](https://push-based.github.io/angular-stream/): start with
  [NestJS](https://push-based.github.io/angular-stream/docs/getting-started/nestjs),
  then [this package's API](https://push-based.github.io/angular-stream/docs/reference/nestjs)
  and [Streaming through proxies](https://push-based.github.io/angular-stream/docs/guides/streaming-through-proxies).
- [The repository](https://github.com/push-based/angular-stream), with an
  example that uses it.
