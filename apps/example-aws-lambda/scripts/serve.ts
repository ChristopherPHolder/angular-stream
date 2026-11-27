/**
 * Serves the built function locally the way a Function URL would, with the
 * built client in front as CloudFront and S3 would serve it.
 * `pnpm nx serve example-aws-lambda` builds the function first. See
 * `lambda-emulator.ts` for what is and isn't like AWS.
 */
import { fileURLToPath } from 'node:url';
import { installAwsLambdaGlobal, serveFunctionUrl } from './lambda-emulator.ts';

const port = Number(process.env['PORT'] ?? 3000);

// Lambda always sets AWS_REGION; the handler builds its allowed host from it.
process.env['AWS_REGION'] ??= 'local';
// The runtime defines the global before it loads the handler's module.
installAwsLambdaGlobal();
// A computed specifier: the module is build output, absent from a clean
// checkout, so the type checker must not try to resolve it.
const handlerModule = new URL('../dist/server/lambda.mjs', import.meta.url).href;
const { handler } = (await import(handlerModule)) as { handler: unknown };

await serveFunctionUrl({
  handler,
  staticDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
  port,
});
console.log(`Function URL (local): http://localhost:${port}/`);
