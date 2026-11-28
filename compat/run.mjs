#!/usr/bin/env node
// Checks the packages against one Angular version, the way an app made by the
// Angular CLI uses them: installs that version into a copy of `fixture/`, with
// the packages packed from this repository, builds it, starts its server and
// checks what it sends and what a browser makes of it.
//
//   node compat/run.mjs --angular 21.2 --mode zoneless
//
// --angular   A minor (`21.2`, the latest patch of it), an exact version, or a
//             dist-tag (`next`).
// --mode      `zoneless` or `zone`.
// --packs     A folder with the packed packages. Packed from the repository
//             when left out.
//
// Exits non-zero when a check fails. Writes the outcome to
// `compat/.work/<label>/result.json` as well.

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkInBrowser } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { values: args } = parseArgs({
  options: {
    angular: { type: 'string' },
    mode: { type: 'string', default: 'zoneless' },
    packs: { type: 'string' },
  },
});
if (!args.angular || !['zoneless', 'zone'].includes(args.mode)) {
  console.error('Usage: node compat/run.mjs --angular <minor|version|tag> --mode <zoneless|zone>');
  process.exit(2);
}

const npm = (...a) => execFileSync('npm', a, { encoding: 'utf8' }).trim();
const view = (spec, field) => {
  const out = npm('view', spec, field, '--json');
  const value = out === '' ? undefined : JSON.parse(out);
  // A range resolves to every matching version; the last one is the newest.
  return Array.isArray(value) ? value.at(-1) : value;
};

/** `21.2` → its newest patch; anything else is passed to npm as it is. */
function resolveAngular(input) {
  const spec = /^\d+\.\d+$/.test(input) ? `~${input}.0` : input;
  const version = view(`@angular/core@${spec}`, 'version');
  if (!version) {
    throw new Error(`No @angular/core matches ${input}`);
  }
  return version;
}

/** The newest version of a CLI package in the same minor as Angular. */
function sameMinor(pkg, version) {
  const [major, minor] = version.split('.');
  const prerelease = version.includes('-');
  const spec = prerelease ? version : `~${major}.${minor}.0`;
  return view(`${pkg}@${spec}`, 'version') ?? version;
}

const angular = resolveAngular(args.angular);
const major = Number(angular.split('.')[0]);
const label = `angular-${angular}-${args.mode}`;
const work = join(here, '.work', label);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

console.log(`Angular ${angular}, ${args.mode}, in ${work}`);

// 1. The app: the fixture, with what differs between versions written in.
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
cpSync(join(here, 'fixture'), work, { recursive: true });

const build = sameMinor('@angular/build', angular);
const corePeers = view(`@angular/core@${angular}`, 'peerDependencies') ?? {};
const buildPeers = view(`@angular/build@${build}`, 'peerDependencies') ?? {};
const zoneJs = corePeers['zone.js'] ?? 'latest';
const typescript = buildPeers['typescript'] ?? 'latest';

const packs = args.packs ? resolve(args.packs) : packPackages(join(here, '.work', 'packs'));
const tarballs = readdirSync(packs)
  .filter((file) => file.endsWith('.tgz'))
  .map((file) => join(packs, file));

const pkg = {
  name: 'compat-fixture',
  private: true,
  type: 'module',
  dependencies: {
    '@angular/common': angular,
    '@angular/compiler': angular,
    '@angular/core': angular,
    '@angular/platform-browser': angular,
    '@angular/platform-server': angular,
    '@angular/router': angular,
    '@angular/ssr': sameMinor('@angular/ssr', angular),
    express: '^5.1.0',
    rxjs: '~7.8.0',
    tslib: '^2.3.0',
    ...(args.mode === 'zone' ? { 'zone.js': zoneJs } : {}),
  },
  devDependencies: {
    '@angular/build': build,
    '@angular/cli': sameMinor('@angular/cli', angular),
    '@angular/compiler-cli': angular,
    '@types/express': '^5.0.1',
    '@types/node': '^22.12.0',
    typescript,
  },
};
for (const tarball of tarballs) {
  const name = tarball.includes('angular-ssr-stream-angular-ssr')
    ? '@push-based/angular-ssr-stream-angular-ssr'
    : '@push-based/angular-ssr-stream-core';
  pkg.dependencies[name] = `file:${tarball}`;
}
writeFileSync(join(work, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

writeFileSync(join(work, 'src/app/change-detection.ts'), changeDetection(major, args.mode));
writeFileSync(join(work, 'src/app/app.config.server.ts'), serverConfig(major));
if (args.mode === 'zone') {
  const angularJson = join(work, 'angular.json');
  const config = JSON.parse(readFileSync(angularJson, 'utf8'));
  config.projects.fixture.architect.build.options.polyfills = ['zone.js'];
  writeFileSync(angularJson, JSON.stringify(config, null, 2) + '\n');
}

// 2. Install. No --legacy-peer-deps: the packages' peer ranges must admit
// this version, or the install fails, which is what it should do for users.
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], work);

const outcome = { angular, mode: args.mode, build, typescript, zoneJs, results };
try {
  // 3. A production build: what the server sends, and what Chrome makes of it.
  run('npx', ['ng', 'build'], work);
  await withServer(work, async (origin) => {
    await checkResponses(origin);
    for (const attempt of [1, 2]) {
      await browserCheck(`production, page load ${attempt}`, origin, false);
    }
  });

  // 4. A development build, where Angular checks every node it hydrates.
  run('npx', ['ng', 'build', '--configuration', 'development'], work);
  await withServer(work, async (origin) => {
    for (const attempt of [1, 2]) {
      await browserCheck(`development, page load ${attempt}`, origin, true);
    }
  });
} catch (error) {
  check('run', false, error instanceof Error ? error.message : String(error));
}

const failed = results.some((result) => !result.ok);
writeFileSync(join(work, 'result.json'), JSON.stringify(outcome, null, 2) + '\n');
console.log(failed ? `\nFAILED: ${label}` : `\nPASSED: ${label}`);
process.exit(failed ? 1 : 0);

// ---------------------------------------------------------------------------

function changeDetection(major, mode) {
  if (mode === 'zone') {
    return [
      "import { provideZoneChangeDetection } from '@angular/core';",
      '',
      'export const changeDetection = provideZoneChangeDetection({ eventCoalescing: true });',
      '',
    ].join('\n');
  }
  // Stable from 20; experimental, and named so, in 19.
  const name =
    major >= 20 ? 'provideZonelessChangeDetection' : 'provideExperimentalZonelessChangeDetection';
  return [
    `import { ${name} } from '@angular/core';`,
    '',
    `export const changeDetection = ${name}();`,
    '',
  ].join('\n');
}

function serverConfig(major) {
  // 19 splits rendering and routes over two packages; 20 has withRoutes().
  const imports =
    major >= 20
      ? "import { provideServerRendering, withRoutes } from '@angular/ssr';"
      : "import { provideServerRendering } from '@angular/platform-server';\nimport { provideServerRouting } from '@angular/ssr';";
  const providers =
    major >= 20
      ? 'provideServerRendering(withRoutes(serverRoutes))'
      : 'provideServerRendering(), provideServerRouting(serverRoutes)';
  return [
    "import { type ApplicationConfig, mergeApplicationConfig } from '@angular/core';",
    imports,
    "import { appConfig } from './app.config';",
    "import { serverRoutes } from './app.routes.server';",
    '',
    'const serverConfig: ApplicationConfig = {',
    `  providers: [${providers}],`,
    '};',
    '',
    'export const config = mergeApplicationConfig(appConfig, serverConfig);',
    '',
  ].join('\n');
}

function packPackages(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const name of ['core', 'angular-ssr']) {
    const dir = join(root, 'packages', name);
    run('pnpm', ['run', 'build'], dir);
    run('pnpm', ['pack', '--pack-destination', out], dir);
  }
  return out;
}

function run(command, commandArgs, cwd) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit' });
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function withServer(dir, body) {
  const port = await freePort();
  const server = spawn('node', ['dist/fixture/server/server.mjs'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), NG_ALLOWED_HOSTS: 'localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (data) => (log += data));
  server.stderr.on('data', (data) => (log += data));
  const origin = `http://localhost:${port}`;
  try {
    // A minute: on a busy machine a cold server can take a while to listen.
    const deadline = Date.now() + 60000;
    for (;;) {
      try {
        await fetch(`${origin}/favicon.ico`);
        break;
      } catch (error) {
        if (Date.now() > deadline || server.exitCode !== null) {
          throw new Error(`The server did not start:\n${log}`, { cause: error });
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await body(origin);
    const fellBack = log.includes('falling back');
    check('the server never fell back to a buffered render', !fellBack, fellBack ? log : '');
  } finally {
    server.kill();
  }
}

/** Reads a response chunk by chunk, with the time each one arrived. */
async function timedFetch(url, init) {
  const start = performance.now();
  const response = await fetch(url, init);
  const chunks = [];
  if (response.body) {
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      chunks.push({ at: performance.now() - start, text: decoder.decode(chunk, { stream: true }) });
    }
  }
  return { response, chunks, text: chunks.map((chunk) => chunk.text).join('') };
}

async function checkResponses(origin) {
  // Twice: Angular renders `hydrate when` blocks differently once their
  // dependencies are loaded, which is from the second request on.
  for (const attempt of [1, 2]) {
    const { response, chunks } = await timedFetch(`${origin}/`);
    const shell = chunks.find((chunk) => chunk.text.includes('data-shell'));
    const data = chunks.find((chunk) => chunk.text.includes('<template data-ngs'));
    check(`GET / ${attempt}: 200`, response.status === 200, String(response.status));
    check(
      `GET / ${attempt}: the shell arrives before the data`,
      shell !== undefined && shell.at < 1000 && !shell.text.includes('Answered by'),
      shell ? `${Math.round(shell.at)} ms` : 'no shell',
    );
    check(
      `GET / ${attempt}: the widget follows in a chunk`,
      data !== undefined && data.at >= 1500 && data.text.includes('Answered by the server'),
      data ? `${Math.round(data.at)} ms` : 'no chunk',
    );
  }

  const teapot = await timedFetch(`${origin}/teapot`);
  check(
    'GET /teapot: the route status and header',
    teapot.response.status === 418 && teapot.response.headers.get('x-route') === 'teapot',
    `${teapot.response.status}, x-route ${teapot.response.headers.get('x-route')}`,
  );
  check(
    'GET /teapot: streamed',
    teapot.chunks.some((c) => c.text.includes('<template data-ngs')),
  );

  const old = await fetch(`${origin}/old`, { redirect: 'manual' });
  check(
    'GET /old: a redirect to /teapot',
    old.status >= 300 &&
      old.status < 400 &&
      (old.headers.get('location') ?? '').endsWith('/teapot'),
    `${old.status} ${old.headers.get('location')}`,
  );

  const missing = await timedFetch(`${origin}/nope`);
  check(
    'GET /nope: 404 from RESPONSE_INIT',
    missing.response.status === 404 && missing.text.includes('data-not-found'),
    String(missing.response.status),
  );

  const prerendered = await timedFetch(`${origin}/static`);
  check(
    'GET /static: prerendered, whole',
    prerendered.response.status === 200 && prerendered.text.includes('Answered by the server'),
    String(prerendered.response.status),
  );

  const client = await timedFetch(`${origin}/csr`);
  check(
    'GET /csr: rendered in the browser',
    client.response.status === 200 && !client.text.includes('data-shell'),
    String(client.response.status),
  );
}

async function browserCheck(name, origin, devMode) {
  const report = await checkInBrowser(`${origin}/`, { waitMs: 5000 });
  const problems = [];
  if (!report.streamed) problems.push('no stream runtime on the page');
  if (!report.done) problems.push('the stream never ended');
  if (!(report.widgetText ?? '').includes('Answered by the server'))
    problems.push(`widget: ${report.widgetText}`);
  if (report.hydratedAttr !== 'true') problems.push('the widget did not hydrate');
  if (devMode && report.debugStatus !== 'hydrated')
    problems.push(`Angular's hydration status: ${report.debugStatus}`);
  if (report.click !== '0 -> 1') problems.push(`click: ${report.click}`);
  if ((args.mode === 'zone') !== report.zone) problems.push(`Zone.js loaded: ${report.zone}`);
  if (report.errors.length > 0) problems.push(...report.errors);
  check(`browser, ${name}`, problems.length === 0, problems.join('; '));
}
