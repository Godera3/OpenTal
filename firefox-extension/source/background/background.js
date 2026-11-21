/* Relays analysis requests between Chess.com tabs and the OpenTal native host. */

const HOST_NAME = 'com.opental.analysis';
const DEFAULT_SETTINGS = {
  searchMode: 'time',
  movetime: 250,
  depth: 12,
  hash: 128,
  threads: 1,
  multiPv: 1,
  useBook: true,
  talMode: true,
  talRandom: false,
  ponder: true
};

const pending = new Map();
const queue = [];
let port = null;
let ready = false;
let engineName = null;
let nextId = 0;
let settings = Object.assign({}, DEFAULT_SETTINGS);

function report(message) {
  console.log('[OpenTal background]', message);
}

function sanitizeSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  };
  const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
  const mode = source.searchMode === 'depth' ? 'depth' : 'time';
  return {
    searchMode: mode,
    movetime: clamp(source.movetime, 50, 10000, DEFAULT_SETTINGS.movetime),
    depth: clamp(source.depth, 1, 30, DEFAULT_SETTINGS.depth),
    hash: clamp(source.hash, 1, 4096, DEFAULT_SETTINGS.hash),
    threads: clamp(source.threads, 1, 8, DEFAULT_SETTINGS.threads),
    multiPv: clamp(source.multiPv, 1, 3, DEFAULT_SETTINGS.multiPv),
    useBook: bool(source.useBook, DEFAULT_SETTINGS.useBook),
    talMode: bool(source.talMode, DEFAULT_SETTINGS.talMode),
    talRandom: bool(source.talRandom, DEFAULT_SETTINGS.talRandom),
    ponder: bool(source.ponder, DEFAULT_SETTINGS.ponder)
  };
}

function toUciOptions(current) {
  return {
    Hash: current.hash,
    Threads: current.threads,
    MultiPV: current.multiPv,
    UseBook: current.useBook,
    TalMode: current.talMode,
    TalRandom: current.talRandom,
    Ponder: current.ponder
  };
}

async function loadSettings() {
  try {
    const stored = await browser.storage.local.get('opentalSettings');
    settings = sanitizeSettings(stored.opentalSettings);
  } catch (error) {
    settings = Object.assign({}, DEFAULT_SETTINGS);
  }
  return settings;
}

function sendConfigure() {
  queue.push({
    type: 'configure',
    searchMode: settings.searchMode,
    movetime: settings.movetime,
    depth: settings.depth,
    options: toUciOptions(settings)
  });
  flush();
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
      sendConfigure();
      flush();
    } else if (msg.type === 'analysis' || msg.type === 'error') {
      report('host -> tab ' + JSON.stringify(msg).slice(0, 300));
      deliver(msg);
    } else if (msg.type === 'configured') {
      report('settings applied');
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
      searchMode: settings.searchMode,
      movetime: settings.movetime,
      depth: settings.depth
    });
    flush();
    return Promise.resolve({ ok: true, id });
  }
  if (msg.type === 'status') {
    return Promise.resolve({ ready, engine: engineName, settings });
  }
  if (msg.type === 'getSettings') {
    return Promise.resolve({ settings, ready, engine: engineName });
  }
  if (msg.type === 'saveSettings') {
    settings = sanitizeSettings(msg.settings);
    return browser.storage.local.set({ opentalSettings: settings }).then(() => {
      sendConfigure();
      return { ok: true, settings, ready, engine: engineName };
    });
  }
  return Promise.resolve({ ok: false });
});

loadSettings().then(connect);
