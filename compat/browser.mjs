// Opens a page in headless Chrome over the DevTools protocol, with nothing
// but Node's own WebSocket, and reports whether the streamed widget hydrated
// from the server's HTML.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env['CHROME_PATH'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  const found = CANDIDATES.find((candidate) => candidate && existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome found: set CHROME_PATH.');
  }
  return found;
}

/**
 * Starts headless Chrome on a free DevTools port, and resolves with that port
 * once Chrome has written it to `DevToolsActivePort` in its profile, which is
 * steadier than watching its log.
 */
async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'compat-chrome-'));
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let output = '';
  chrome.stderr.on('data', (data) => (output += data));

  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
      if (port) {
        return { chrome, profile, port };
      }
    } catch {
      // Not written yet.
    }
    if (Date.now() > deadline || chrome.exitCode !== null) {
      chrome.kill();
      rmSync(profile, { recursive: true, force: true });
      throw new Error(`Chrome did not start:\n${output.slice(-2000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * @returns {Promise<{
 *   streamed: boolean, done: boolean, widgetText: string | null,
 *   hydratedAttr: string | null, debugStatus: string | null,
 *   zone: boolean, click: string, errors: string[]
 * }>}
 */
export async function checkInBrowser(url, { waitMs = 5000 } = {}) {
  // A cold start on a CI runner can be slow, and a first launch can die;
  // one more try is cheaper than a red cell.
  let launched;
  try {
    launched = await launchChrome();
  } catch {
    launched = await launchChrome();
  }
  const { chrome, profile, port } = launched;

  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(
          'console: ' +
            message.params.args
              .map((arg) => arg.value ?? arg.description)
              .join(' ')
              .slice(0, 300),
        );
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push('exception: ' + (details.exception?.description ?? details.text).slice(0, 300));
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const callId = ++id;
        pending.set(callId, resolve);
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
        .result?.result?.value;

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const report = await evaluate(`(() => {
      const widget = document.querySelector('[data-widget]');
      return {
        streamed: typeof window.__ngs !== 'undefined',
        done: Boolean(window.__ngs && window.__ngs.done),
        widgetText: widget && widget.textContent.trim().replace(/\\s+/g, ' '),
        hydratedAttr: widget && widget.getAttribute('data-hydrated'),
        debugStatus: (widget && widget.__ngDebugHydrationInfo__ && widget.__ngDebugHydrationInfo__.status) || null,
        zone: typeof Zone !== 'undefined',
      };
    })()`);
    const click = await evaluate(`(async () => {
      const button = document.querySelector('[data-widget] button');
      if (!button) return 'no button';
      const count = () => button.closest('[data-widget]').textContent.match(/Count: (\\d+)/)?.[1];
      const before = count();
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return before + ' -> ' + count();
    })()`);

    ws.close();
    return { ...report, click, errors };
  } finally {
    // Chrome goes on writing to its profile for a moment after it is told to
    // stop, so wait for it to exit before cleaning up after it.
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // A temporary folder; the OS clears it eventually.
    }
  }
}
