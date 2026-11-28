<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-aws-lambda

Streamed server-side rendering for Angular on AWS Lambda. The browser starts
hydrating the page while the response is still arriving. This is the Lambda
adapter of
[`@push-based/angular-ssr-stream-core`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-core):
`createStreamingLambda()`, a response-streaming handler for a Function URL.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-aws-lambda@next
```

```ts
// src/lambda.ts
import { join } from 'node:path';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingLambda } from '@push-based/angular-ssr-stream-aws-lambda';

export const handler = createStreamingLambda({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  templatePath: join(import.meta.dirname, '../client/index.html'),
  allowedHosts: ['localhost', `*.lambda-url.${process.env['AWS_REGION']}.on.aws`],
});
```

The page only streams when the Function URL's invoke mode is
`RESPONSE_STREAM`. With the default, `BUFFERED`, or behind an API Gateway HTTP
API, it arrives all at once.

- [The docs](https://push-based.github.io/angular-ssr-stream/): start with
  [AWS Lambda](https://push-based.github.io/angular-ssr-stream/docs/getting-started/aws-lambda),
  then [this package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/aws-lambda).
- [The repository](https://github.com/push-based/angular-ssr-stream), with an
  example that uses it.
