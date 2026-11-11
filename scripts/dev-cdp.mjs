#!/usr/bin/env node
// Developer tool: talks to a running Atomic Atlas window over the Chrome
// DevTools Protocol. Start the app with --remote-debugging-port=9333 first.
//
//   node scripts/dev-cdp.mjs shot out.png            screenshot of the window contents
//   node scripts/dev-cdp.mjs eval "document.title"   run an expression in the page
//   node scripts/dev-cdp.mjs click 640 360           mouse click at window coordinates
//   node scripts/dev-cdp.mjs rclick 640 360          right click
//   node scripts/dev-cdp.mjs type "text"             type text into the focused element
//   node scripts/dev-cdp.mjs key Escape              press a key
//   node scripts/dev-cdp.mjs errors                  console errors and warnings since page load
//
// It is for diagnosis during development. Release testing is done with real
// clicks on an installed build.

import { writeFileSync } from 'node:fs';

const port = process.env.CDP_PORT || '9333';
const [, , command, ...args] = process.argv;

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const events = [];
ws.addEventListener('message', (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  } else if (data.method) events.push(data);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mouse(x, y, button) {
  const base = { x: Number(x), y: Number(y), button, clickCount: 1 };
  await send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', button: 'none' });
  await send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' });
}

switch (command) {
  case 'shot': {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(args[0] || 'shot.png', Buffer.from(data, 'base64'));
    break;
  }
  case 'eval': {
    const result = await send('Runtime.evaluate', { expression: args.join(' '), awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) console.error('exception:', result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    else console.log(typeof result.result.value === 'string' ? result.result.value : JSON.stringify(result.result.value));
    break;
  }
  case 'click':
    await mouse(args[0], args[1], 'left');
    break;
  case 'rclick':
    await mouse(args[0], args[1], 'right');
    break;
  case 'type':
    await send('Input.insertText', { text: args.join(' ') });
    break;
  case 'key': {
    const key = args[0];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
    break;
  }
  case 'errors': {
    await send('Runtime.enable');
    await send('Log.enable');
    await sleep(Number(args[0] || 800));
    for (const e of events) {
      if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
        console.log(`[${e.params.type}]`, e.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (e.method === 'Runtime.exceptionThrown') {
        console.log('[exception]', e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
      } else if (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)) {
        console.log(`[log ${e.params.entry.level}]`, e.params.entry.text, e.params.entry.url ?? '');
      }
    }
    break;
  }
  default:
    console.error('unknown command');
    process.exitCode = 2;
}
ws.close();
