/* Relays analysis requests between Chess.com tabs and the OpenTal native host. */

const HOST_NAME = 'com.opental.analysis';
const pending = new Map();
const queue = [];
let port = null;
let ready = false;
let engineName = null;
let nextId = 0;

function report(message) {
  console.log('[OpenTal background]', message);
}

function deliver(msg) {
  const request = pending.get(msg.id);
  if (!request) return;
  pending.delete(msg.id);
  const out = Object.assign({}, msg, { revision: request.revision });
  browser.tabs.sendMessage(request.tabId, out).catch(() => {});
}

function flush() {
  while (ready && queue.length) {
    port.postMessage(queue.shift());
  }
}

function connect() {
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (error) {
    report('native host unavailable: ' + error);
    setTimeout(connect, 3000);
    return;
  }

  port.onMessage.addListener((msg) => {
    if (msg.type === 'ready') {
      ready = true;
      engineName = msg.engine;
      report('connected to ' + engineName);
      flush();
    } else if (msg.type === 'analysis' || msg.type === 'error') {
      deliver(msg);
    } else if (msg.type === 'pong') {
      engineName = msg.engine;
    }
  });

  port.onDisconnect.addListener(() => {
    ready = false;
    port = null;
    for (const id of pending.keys()) {
      deliver({ type: 'error', id, message: 'OpenTal native host disconnected' });
    }
    setTimeout(connect, 3000);
  });
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'analyse') {
    const id = ++nextId;
    pending.set(id, { tabId: sender.tab.id, revision: msg.revision });
    queue.push({
      type: 'analyse',
      id,
      fen: msg.fen,
      moves: msg.moves || [],
      movetime: msg.movetime || 600
    });
    flush();
    return Promise.resolve({ ok: true, id });
  }
  if (msg.type === 'status') {
    return Promise.resolve({ ready, engine: engineName });
  }
  return Promise.resolve({ ok: false });
});

connect();
