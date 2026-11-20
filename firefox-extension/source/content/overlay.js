/* Draws OpenTal's move as a Tal-gold arrow and square highlights. */

(function () {
  const HOST_ID = 'opental-overlay-root';
  const MARKUP = `
    <style>
      svg { display: block; width: 100%; height: 100%; overflow: visible; }
      #arrow { stroke: #ffd166; stroke-width: 0.13; stroke-linecap: round; opacity: 0.92; }
      #arrow.hidden, .square.hidden { display: none; }
      .square { fill: #ffd166; opacity: 0.22; }
      .badge {
        position: absolute; top: 4px; left: 4px; padding: 2px 7px;
        background: rgba(8, 8, 12, 0.82); color: #ffd166;
        border: 1px solid rgba(255, 209, 102, 0.35); border-radius: 4px;
        font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: 0.03em;
        white-space: nowrap;
      }
    </style>
    <svg viewBox="0 0 8 8" preserveAspectRatio="none">
      <defs>
        <marker id="tal-head" viewBox="0 0 3 3" markerWidth="3" markerHeight="3"
                refX="2.2" refY="1.5" orient="auto">
          <path d="M0,0 L3,1.5 L0,3 Z" fill="#ffd166"></path>
        </marker>
      </defs>
      <g id="hits"><rect class="square hidden" id="from"></rect><rect class="square hidden" id="to"></rect></g>
      <line id="arrow" class="hidden" marker-end="url(#tal-head)"></line>
    </svg>
    <div class="badge" id="badge">TAL …</div>`;

  let host = null;
  let shadow = null;
  let flipped = false;
  let revision = -1;

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0',
      pointerEvents: 'none', zIndex: '2147483646'
    });
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = MARKUP;
    document.body.appendChild(host);
  }

  function place() {
    ensureHost();
    const state = window.OpenTalBoard.current();
    const element = state && state.board;
    if (!element || !element.isConnected) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    host.style.left = rect.left + 'px';
    host.style.top = rect.top + 'px';
    host.style.width = rect.width + 'px';
    host.style.height = rect.height + 'px';
  }

  function squareCentre(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return flipped
      ? { x: 7 - file + 0.5, y: rank + 0.5 }
      : { x: file + 0.5, y: 7 - rank + 0.5 };
  }

  function clear() {
    if (!shadow) return;
    shadow.querySelector('#arrow').classList.add('hidden');
    shadow.querySelectorAll('.square').forEach((rect) => rect.classList.add('hidden'));
  }

  function draw(result) {
    ensureHost();
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.lastResult = result;
    const best = result && result.bestmove != null ? String(result.bestmove) : '';
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(best);
    clear();
    if (!match) {
      const shown = best ? best : '(empty)';
      shadow.querySelector('#badge').textContent = 'TAL — NO MOVE [' + shown + ']';
      return;
    }

    const from = squareCentre(match[1]);
    const to = squareCentre(match[2]);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const tip = { x: to.x - (0.28 * dx) / length, y: to.y - (0.28 * dy) / length };

    const line = shadow.querySelector('#arrow');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', tip.x);
    line.setAttribute('y2', tip.y);
    line.setAttribute('marker-end', 'url(#tal-head)');
    line.classList.remove('hidden');

    const fromRect = shadow.querySelector('#from');
    fromRect.setAttribute('x', Math.floor(from.x));
    fromRect.setAttribute('y', Math.floor(from.y));
    fromRect.setAttribute('width', 1);
    fromRect.setAttribute('height', 1);
    fromRect.classList.remove('hidden');

    const toRect = shadow.querySelector('#to');
    toRect.setAttribute('x', Math.floor(to.x));
    toRect.setAttribute('y', Math.floor(to.y));
    toRect.setAttribute('width', 1);
    toRect.setAttribute('height', 1);
    toRect.classList.remove('hidden');

    const label = (result.lines && result.lines[0] && result.lines[0].move) || match[0];
    const score = result.mate != null
      ? 'M' + Math.abs(result.mate)
      : result.score != null
        ? (result.score >= 0 ? '+' : '') + (result.score / 100).toFixed(2)
        : 'book';
    shadow.querySelector('#badge').textContent = 'TAL ' + label + ' · ' + score;
    place();
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'analysis') {
      if (msg.revision != null && msg.revision < revision) return;
      console.log('[OpenTal] analysis', msg);
      draw(msg);
    } else if (msg.type === 'error') {
      console.log('[OpenTal] error', msg);
      ensureHost();
      clear();
      shadow.querySelector('#badge').textContent = 'TAL — ' + (msg.message || 'error').slice(0, 48);
    }
  });

  window.OpenTalBoard.start((state) => {
    revision = state.revision;
    flipped = state.flipped;
    clear();
    ensureHost();
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.lastSentFen = state.fen;
    console.log('[OpenTal] analyse', state.source, state.fen);
    shadow.querySelector('#badge').textContent = 'TAL …';
    place();
    browser.runtime.sendMessage({
      type: 'analyse', fen: state.fen, revision: state.revision, movetime: 600
    }).catch((error) => {
      shadow.querySelector('#badge').textContent = 'TAL — bridge unavailable';
      console.log('[OpenTal] send failed', error);
    });
  });

  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
})();
