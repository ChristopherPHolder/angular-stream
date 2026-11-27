<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-stream/main/press-kit/logo/png/angular-stream-logo.png"
    alt="angular-stream"
    width="420"
  />
</p>

# @push-based/angular-stream-aws-lambda

Streamed server-side rendering for Angular on AWS Lambda. The browser starts
hydrating the page while the response is still arriving. This is the Lambda
adapter of
[`@push-based/angular-stream-core`](https://www.npmjs.com/package/@push-based/angular-stream-core):
`createStreamingLambda()`, a response-streaming handler for a Function URL.

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-aws-lambda@next
```

```ts
// src/lambda.ts
import { join } from 'node:path';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingLambda } from '@push-based/angular-stream-aws-lambda';

export const handler = createStreamingLambda({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  templatePath: join(import.meta.dirname, '../client/index.html'),
  allowedHosts: ['localhost', '*.lambda-url.eu-central-1.on.aws'],
});
```

The page only streams when the Function URL's invoke mode is
`RESPONSE_STREAM`. With the default, `BUFFERED`, or behind an API Gateway HTTP
API, it arrives all at once.

- [The docs](https://push-based.github.io/angular-stream/): start with
  [AWS Lambda](https://push-based.github.io/angular-stream/docs/getting-started/aws-lambda),
  then [this package's API](https://push-based.github.io/angular-stream/docs/reference/aws-lambda).
- [The repository](https://github.com/push-based/angular-stream), with an
  example that uses it.
