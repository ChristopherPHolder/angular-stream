This is the setup of `apps/example-aws-lambda`. Angular is compiled by ngp
through Vite. The server bundle runs as a Node.js Lambda function behind a
Function URL whose invoke mode is `RESPONSE_STREAM`. CloudFront sits in front,
sending static files to S3 and every navigation to the function. The stack is
described as one [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/)
template. SAM was chosen because the whole stack fits in one declarative file,
and nothing in it is an npm dependency of the app, which CDK or SST would add.

> [!WARNING]
> Lambda buffers by default. A Function URL left on `BUFFERED`, an API Gateway
> HTTP API, or anything else that calls the function with `Invoke` holds the
> page until the handler has finished, so the whole page arrives at once. See
> [Which AWS setups stream](#which-aws-setups-stream).

> [!IMPORTANT]
> This setup has not been deployed. Everything on this page was built and run
> locally, through a stand-in for the Lambda runtime and the Function URL (see
> [Check that it streams](#7-check-that-it-streams)). Nothing was checked
> against a real AWS account. That includes CloudFront, which AWS doesn't
> document as streaming either way.

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The handler

```ts title="src/lambda.ts"
import { join } from 'node:path';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingLambda } from '@push-based/angular-stream-aws-lambda';
import { App } from './app/app';
import { config } from './app/app.config.server';

export const handler = createStreamingLambda({
  rootComponent: App,
  config,
  eventDispatchContract,
  // The built client sits next to the server bundle in the deployment package.
  templatePath: join(import.meta.dirname, '../client/index.html'),
  allowedHosts: ['localhost', `*.lambda-url.${process.env['AWS_REGION']}.on.aws`],
});
```

`createStreamingLambda()` wraps the handler in `awslambda.streamifyResponse()`.
Each Function URL event becomes a web `Request`. The response goes out through
`awslambda.HttpResponseStream`, with the status and headers first and then each
chunk as the renderer flushes it.

`templatePath` is the built `index.html`. It ships in the same zip as the
handler, is read on the first request, and is kept for as long as the
execution environment lives.

`allowedHosts` must list the Function URL's hostname. Behind CloudFront too:
CloudFront sends the Function URL its own hostname as `Host`, so that is the
host the request is rendered for. Function URLs look like
`<url-id>.lambda-url.<region>.on.aws`, and Lambda always sets `AWS_REGION` to
the function's region, so the pattern above matches any Function URL in the
region the function is deployed to, whichever that is.

`eventDispatchContract` is for `withEventReplay()`, as on
[Cloudflare Workers](cloudflare-workers.md#3-the-worker).

## 4. Vite

```ts title="vite.config.ts"
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: {
      build: { outDir: 'dist/client' },
    },
    ssr: {
      resolve: { noExternal: true },
      build: {
        outDir: 'dist/server',
        copyPublicDir: false,
        target: 'node24',
        rollupOptions: {
          input: { lambda: 'src/lambda.ts' },
          output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
        },
      },
    },
  },
  plugins: [ngp({ entries: ['src/main.ts', 'src/lambda.ts'] })],
});
```

`vite build` builds both environments: the browser app into `dist/client`, and
the handler into `dist/server/lambda.mjs`. The handler is one ES module with
every dependency bundled in (`noExternal: true`), because the deployment
package has no `node_modules`. The `.mjs` extension makes Lambda load it as an
ES module without a `package.json`.

ngp's own `ssr` option stays off. It builds a `render(url, document)` entry,
not a Lambda handler. ngp still compiles `src/lambda.ts` with its server
compiler, since it's listed in `entries`.

## 5. The function, CloudFront and S3

The whole template is
[`apps/example-aws-lambda/template.yaml`](../../../../../apps/example-aws-lambda/template.yaml).
These are the parts that decide whether the page streams.

The function and its URL:

```yaml title="template.yaml"
RenderFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: dist/
    Handler: server/lambda.handler
    Runtime: nodejs24.x
    Architectures: [arm64]
    MemorySize: 1024
    Timeout: 30
    FunctionUrlConfig:
      AuthType: NONE
      # BUFFERED, the default, holds the whole response until the handler
      # returns: the page arrives in one piece.
      InvokeMode: RESPONSE_STREAM
```

`CodeUri: dist/` zips the client and the server together, so
`server/lambda.mjs` finds `../client/index.html`. With `AuthType: NONE`, SAM
adds both permissions a public Function URL needs: `lambda:InvokeFunctionUrl`,
and `lambda:InvokeFunction` limited to calls through the URL.

CloudFront's default behavior sends navigations to the Function URL:

```yaml title="template.yaml"
DefaultCacheBehavior:
  TargetOriginId: render
  ViewerProtocolPolicy: redirect-to-https
  AllowedMethods: [GET, HEAD, OPTIONS, PUT, PATCH, POST, DELETE]
  Compress: false
  CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad # Managed-CachingDisabled
  OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac # Managed-AllViewerExceptHostHeader
```

Pages are never cached. `AllViewerExceptHostHeader` is
[AWS's managed policy for Function URL origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html):
a Function URL only answers to its own hostname. Compression stays off on this
behavior, so CloudFront has no reason to hold the body back.

Static files are served from S3, through an origin access control. They match
these patterns: Vite's hashed files under `assets/*`, plus `*.ico`, `*.svg` and
`*.png` for what `public/` holds. Change the patterns if your `public/` holds
other files. Everything that doesn't match goes to the function, which renders
it as a page.

## 6. Build and deploy

```bash
vite build                                   # client to dist/client, handler to dist/server
sam deploy --guided                          # the function, its URL, the bucket and CloudFront
aws s3 sync dist/client s3://<AssetsBucketName> --exclude index.html
```

`sam deploy` prints the stack's outputs: `SiteUrl` (CloudFront), `FunctionUrl`
and `AssetsBucketName`. `index.html` stays out of the bucket: it's the
template, which only the function reads.

> [!NOTE]
> These commands were not run. The template passes `cfn-lint` with the SAM
> translator, but it has never been deployed.

## 7. Check that it streams

`curl -N` the page and note when each part arrives. The shell comes at once.
Each `<template data-ngs>` chunk follows when its data does. A response that
arrives all at once after the slowest request was buffered somewhere.

Neither SAM local nor the Runtime Interface Emulator streams a response. The
example has its own stand-in instead,
[`scripts/lambda-emulator.ts`](../../../../../apps/example-aws-lambda/scripts/lambda-emulator.ts),
which follows AWS's runtime client source. It defines the `awslambda` global
the way the runtime does. The response stream is a chunked POST to a local
Runtime API, and `HttpResponseStream.from()` makes the first write send the
JSON metadata prelude and eight null bytes. A Function URL in front reads the
prelude for the status and headers, and forwards the rest as it arrives.

```bash
pnpm nx serve example-aws-lambda   # builds it first; http://localhost:3000/
curl -sN http://localhost:3000/
```

Through the stand-in, the example's shell, with the widget's
`data-placeholder`, arrives at about 0 ms. The widget's
`<template data-ngs="d0">` arrives about 2000 ms later.

After a deploy, check the Function URL first and then the CloudFront URL. If
the Function URL streams and CloudFront doesn't, the buffering is in CloudFront.

```bash
curl -sN https://<FunctionUrl>/
curl -sN https://<SiteUrl>/
```

## 8. Stream something

<!-- include ../_shared/stream-something.md -->

## Which AWS setups stream

| Setup                                                   | Streams                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| Function URL, `InvokeMode: RESPONSE_STREAM`             | Yes. This is what the adapter is for.                  |
| Function URL, `InvokeMode: BUFFERED` (the default)      | No.                                                    |
| CloudFront in front of a streaming Function URL         | Expected, not documented by AWS, and not checked here. |
| API Gateway REST API, response transfer mode `STREAM`   | Yes, but the adapter can't serve it (see below).       |
| API Gateway REST API, response transfer mode `BUFFERED` | No.                                                    |
| API Gateway HTTP API                                    | No.                                                    |
| Anything that calls the function with `Invoke`          | No. Only `InvokeWithResponseStream` streams.           |

API Gateway used to buffer every Lambda response. REST APIs can now stream:
[response transfer mode](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html)
`STREAM`, on a Lambda proxy integration, calls the function with
`InvokeWithResponseStream`. AWS's page is explicit that "Response streaming is
only supported for REST APIs", so HTTP APIs still buffer. A REST API proxy
integration sends the REST event format (payload 1.0), not the Function URL's
payload 2.0, and this adapter only reads the latter.

AWS documents streaming for Function URLs, `InvokeWithResponseStream` and API
Gateway REST APIs, and nothing else. Treat anything else as buffering, such as
an Application Load Balancer or Lambda@Edge.

Also from
[AWS's response streaming page](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html):

- "Lambda function URLs do not support response streaming within a VPC
  environment."
- "The first 6 MB of your function's response payload has uncapped bandwidth.
  After this initial burst, Lambda streams your response at a maximum rate of
  2 MBps." A streamed response can be up to 200 MB.
- Response streaming is available on the Node.js managed runtimes, which define
  the `awslambda` global the handler needs.
- "Streaming responses incur cost and streamed responses are not interrupted or
  stopped when the invoking client connection is broken." A client that leaves
  early doesn't stop the function: the render runs to the end, and you pay for
  all of it. The function isn't told about the disconnect either, so the
  adapter gives the request no abort signal. Keep the function's timeout close
  to your slowest page.

## Not checked against AWS

- A deployment: the template, `sam deploy`, the S3 upload and the CloudFront
  distribution have never run.
- That CloudFront passes each chunk on as it arrives. AWS doesn't say either
  way.
- How the real Function URL forwards the body after the prelude. The local
  stand-in forwards each chunk at once. The real one is documented to stream,
  but its buffering of small chunks, if any, isn't documented.
- The `nodejs24.x` runtime itself. The stand-in's response stream is checked
  against the runtime client's own code: with that code driving the same
  handler, the bytes and timings match.
- What the client gets when the handler fails before it writes anything.
  Locally there is no prelude to read a status from, so the stand-in drops the
  connection. A real Function URL probably answers 502, but AWS doesn't say.
