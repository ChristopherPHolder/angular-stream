import 'reflect-metadata';
import fastifyCompress from '@fastify/compress';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createRequestListener } from '@push-based/angular-ssr-stream-nestjs';
import { AppModule } from './app.module';

/**
 * The Nest server entry, on Fastify. Built to dist/server/server.js, next to
 * the template (dist/server/index.server.html) and one folder away from the
 * browser build (dist/client), which is where the URLs in AppModule point.
 */
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
app.setGlobalPrefix('api');

// Before the app initializes, so it applies to the controllers and the pages.
// `flushOnIdle` sends each chunk of a page as it comes, instead of the whole
// page at the end.
await app.register(fastifyCompress, { flushOnIdle: true });

// `vite dev` imports this module for its default export, and serves it itself.
export default createRequestListener(app);

// In `vite dev`, an edit to the server runs this module again, which creates a
// new app: close the old one, so its `onModuleDestroy` hooks run.
import.meta.hot?.accept();
import.meta.hot?.dispose(() => app.close());

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  console.log(`Listening on http://localhost:${port}`);
}
