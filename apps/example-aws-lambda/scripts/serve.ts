/**
 * Serves the built function locally the way a Function URL would, with the
 * built client in front as CloudFront and S3 would serve it. Run
 * `pnpm nx build example-aws-lambda` first. See `lambda-emulator.ts` for what
 * is and isn't like AWS.
 */
import { fileURLToPath } from 'node:url';
import { installAwsLambdaGlobal, serveFunctionUrl } from './lambda-emulator.ts';

const port = Number(process.env['PORT'] ?? 3000);

// The runtime defines the global before it loads the handler's module.
installAwsLambdaGlobal();
const { handler } = (await import('../dist/server/lambda.mjs')) as { handler: unknown };

await serveFunctionUrl({
  handler,
  staticDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
  port,
});
console.log(`Function URL (local): http://localhost:${port}/`);
