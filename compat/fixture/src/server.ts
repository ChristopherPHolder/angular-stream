import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { withStreaming } from '@push-based/angular-ssr-stream-angular-ssr';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
// The host check reads NG_ALLOWED_HOSTS where @angular/ssr has one.
const angularApp = withStreaming(new AngularNodeAppEngine());

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}

export const reqHandler = createNodeRequestHandler(app);
