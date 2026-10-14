(() => {
  'use strict';

  const TEST = document.documentElement.dataset.mode === 'test';
  const BASE = TEST ? '../' : './';
  const NS = TEST ? 'imp.test.' : 'imp.'; // osobny stan dla trybu testowego
  const KEY = 'imp0st0r!';
  const HOLD_MS = 1200;
  const MAX_NAME = 16;

  // Hasła na niby do sprawdzania wyglądu i działania. Nie ma ich w prawdziwej puli.
  const TEST_WORDS = [
    [9001, 'Test', 'sprawdzam'],
    [9002, 'Próba', 'na niby'],
    [9003, 'Źdźbło', 'zielone'],
    [9004, 'Przykład', 'jak ten'],
    [9005, 'Bardzo długie hasło testowe', 'długa podpowiedź'],
  ];

  const store = {
    get(k, def) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? def : JSON.parse(v);
      } catch { return def; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* brak miejsca lub zablokowane */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* j.w. */ } },
  };

  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    finger: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"><path d="M14 40c1.5-4 1-9 1-13a17 17 0 0 1 34 0c0 5-.3 9.5-1.5 14"/><path d="M22 47c2.5-5 3-11 3-17a7 7 0 0 1 14 0c0 9-1.5 17-5 24"/><path d="M32 31c0 10-2 18-6.5 25"/><path d="M19 17a19 19 0 0 1 26 0"/></svg>',
    mark: '<svg viewBox="100 160 312 250" aria-hidden="true"><ellipse cx="204" cy="238" rx="52" ry="60" fill="#fff"/><ellipse cx="308" cy="238" rx="52" ry="60" fill="#fff"/><circle cx="228" cy="236" r="25" fill="#141B4D"/><circle cx="332" cy="236" r="25" fill="#141B4D"/><rect x="116" y="262" width="280" height="140" rx="30" fill="#fff"/><path d="M146 306 q16 -14 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0" fill="none" stroke="#C8D0FF" stroke-width="10" stroke-linecap="round"/><path d="M146 336 q16 -14 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0" fill="none" stroke="#2E44D8" stroke-width="10" stroke-linecap="round"/><path d="M146 366 q16 -14 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0" fill="none" stroke="#C8D0FF" stroke-width="10" stroke-linecap="round"/></svg>',
  };

  const $app = document.getElementById('app');

  let words = null; // [[id, hasło, podpowiedź], ...]
  let loadError = false;
  let wakeLock = null;
  let cleanup = []; // sprzątanie po bieżącym ekranie

  const state = {
    players: store.get('imp.players', []), // [{ name, on }], wspólne dla gry i testu
    impostors: store.get('imp.impostors', 1),
    game: validGame(store.get(NS + 'game', null)),
  };

  function validGame(g) {
    return g && Array.isArray(g.names) && Array.isArray(g.imps) && Array.isArray(g.word) ? g : null;
  }
  const savePlayers = () => store.set('imp.players', state.players);
  const saveGame = () => (state.game ? store.set(NS + 'game', state.game) : store.del(NS + 'game'));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
  }

  function rand(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }

  async function loadWords() {
    if (TEST) return TEST_WORDS;
    const res = await fetch(BASE + 'words.dat', { cache: 'no-cache' });
    if (!res.ok) throw new Error('words ' + res.status);
    const bin = atob((await res.text()).trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const k = new TextEncoder().encode(KEY);
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= k[i % k.length];
    return JSON.parse(new TextDecoder().decode(bytes)).items;
  }

  const usedSet = () => new Set(store.get(NS + 'used', []));
  const freshCount = () => {
    const u = usedSet();
    return words.filter((it) => !u.has(it[0])).length;
  };
  const activeNames = () => state.players.filter((p) => p.on).map((p) => p.name);
  const impostorsFor = (n) => (n >= 5 ? state.impostors : 1);

  // ---------- przebieg gry ----------

  function startGame() {
    const names = activeNames();
    if (names.length < 3 || !words || !words.length) return;

    let used = usedSet();
    let pool = words.filter((it) => !used.has(it[0]));
    if (!pool.length) { used = new Set(); pool = words.slice(); } // pula od nowa
    const word = pool[rand(pool.length)];
    used.add(word[0]);
    const ids = new Set(words.map((it) => it[0]));
    store.set(NS + 'used', [...used].filter((id) => ids.has(id)));

    const left = names.map((_, i) => i);
    const imps = [];
    const k = impostorsFor(names.length);
    while (imps.length < k) imps.push(left.splice(rand(left.length), 1)[0]);

    state.game = {
      names,
      imps: imps.sort((a, b) => a - b),
      word,
      turn: 0,
      seen: false,
      starter: rand(names.length),
      phase: 'reveal',
    };
    saveGame();
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch { /* opcjonalne */ }
    keepAwake(true);
    render();
  }

  function quitGame() {
    if (!confirm('Przerwać grę?')) return;
    state.game = null;
    saveGame();
    keepAwake(false);
    render();
  }

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { wakeLock = null; }
  }

  // ---------- przytrzymanie ----------

  function holdable(el, onDown, onUp) {
    const active = new Set();
    let down = false;
    const start = () => { if (!down) { down = true; onDown(); } };
    const stop = () => { if (down) { down = false; onUp(); } };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* starsze przeglądarki */ }
      active.add(e.pointerId);
      start();
    });
    const end = (e) => {
      if (!active.delete(e.pointerId)) return;
      if (!active.size) stop();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); }
    });
    el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
    el.addEventListener('blur', stop);
    const force = () => { active.clear(); stop(); };
    cleanup.push(force);
    return force;
  }

  // Dopasuj wielkość napisu, żeby długie hasło zmieściło się w max 2 linijkach.
  function fit(el, max = 68, min = 28) {
    let s = max;
    el.style.fontSize = s + 'px';
    // clientHeight = wysokość linijek (scrollHeight dolicza wystające litery)
    while (s > min && (el.scrollWidth > el.clientWidth + 1 || el.clientHeight > s * 1.04 * 2 + 2)) {
      s -= 2;
      el.style.fontSize = s + 'px';
    }
  }
  function fitAll() {
    $app.querySelectorAll('.s-main').forEach((el) => fit(el));
  }

  // ---------- ekrany ----------

  function render(opts = {}) {
    cleanup.forEach((f) => f());
    cleanup = [];
    const g = state.game;
    const stripe = TEST ? '<div class="teststripe"><span>Tryb testowy: hasła na niby</span></div>' : '';
    if (!g) renderHome(stripe, opts);
    else if (g.phase === 'reveal') renderReveal(stripe, g);
    else if (g.phase === 'play') renderPlay(stripe, g);
    else renderResult(stripe, g);
    if (!opts.keepScroll) window.scrollTo(0, 0);
    fitAll();
  }

  function renderHome(stripe, opts) {
    const prevInput = $app.querySelector('.add input');
    const draft = prevInput ? prevInput.value : '';
    const hadFocus = prevInput && document.activeElement === prevInput;

    const n = activeNames().length;
    const canTwo = n >= 5;
    const k = impostorsFor(n);

    let pool;
    let reset = '';
    if (loadError) pool = 'Nie udało się wczytać haseł. Połącz się z internetem i otwórz grę jeszcze raz.';
    else if (!words) pool = 'Wczytuję hasła…';
    else {
      const fresh = freshCount();
      pool = fresh
        ? `W puli ${fresh} ${plural(fresh, 'nowe hasło', 'nowe hasła', 'nowych haseł')}`
        : 'Wszystkie hasła już były. Następna gra zacznie pulę od nowa.';
      if (fresh < words.length && fresh > 0) reset = '<button class="link reset" type="button">Zacznij pulę od nowa</button>';
    }

    let why = '';
    if (n < 3) why = n === 0 ? 'Dodaj co najmniej 3 graczy' : `Dodaj jeszcze ${3 - n} ${plural(3 - n, 'gracza', 'graczy', 'graczy')}`;
    const ready = n >= 3 && words && words.length;

    const roster = state.players.map((p, i) => `
      <li class="player ${p.on ? 'on' : 'off'}">
        <button class="toggle" type="button" data-i="${i}" aria-pressed="${p.on}"><span class="tick">${ICON.check}</span><span class="pname">${esc(p.name)}</span></button>
        ${i > 0 ? `<button class="icon-btn up" type="button" data-i="${i}" aria-label="Przesuń wyżej: ${esc(p.name)}">${ICON.up}</button>` : '<span class="icon-gap"></span>'}
        <button class="icon-btn del" type="button" data-i="${i}" aria-label="Usuń: ${esc(p.name)}">${ICON.x}</button>
      </li>`).join('');

    $app.innerHTML = `${stripe}
      <main class="screen home">
        <header class="brand">${ICON.mark}<h1>Impostor</h1></header>
        <section class="players">
          <h2>Kto gra?</h2>
          ${roster ? `<ul class="roster">${roster}</ul>` : ''}
          <form class="add" autocomplete="off">
            <input type="text" name="name" placeholder="Imię" maxlength="${MAX_NAME}" enterkeyhint="done" autocapitalize="words" aria-label="Imię gracza">
            <button type="submit">Dodaj</button>
          </form>
          <p class="note">Wpisujcie imiona w kolejności, w jakiej siedzicie. W tej kolejności podajecie telefon.</p>
        </section>
        <section>
          <h2>Ilu impostorów?</h2>
          <div class="seg-row">
            <div class="seg" role="group" aria-label="Liczba impostorów">
              <button type="button" data-k="1" aria-pressed="${k === 1}">1</button>
              <button type="button" data-k="2" aria-pressed="${k === 2}" ${canTwo ? '' : 'disabled'}>2</button>
            </div>
            ${canTwo ? '' : '<p class="note">Dwóch od 5 graczy</p>'}
          </div>
        </section>
        <p class="pool"><span>${pool}</span>${reset}</p>
        <div class="cta">
          <button class="big go" type="button" ${ready ? '' : 'disabled'}>Gramy!</button>
          ${why ? `<p class="why">${why}</p>` : ''}
        </div>
      </main>`;

    const input = $app.querySelector('.add input');
    input.value = draft;
    if (hadFocus || opts.focusInput) input.focus({ preventScroll: true });

    $app.querySelector('.add').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
      if (!name) return;
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      state.players.push({ name, on: true });
      savePlayers();
      input.value = '';
      render({ focusInput: true, keepScroll: true });
    });

    $app.querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => {
      const p = state.players[+b.dataset.i];
      p.on = !p.on;
      savePlayers();
      render({ keepScroll: true });
    }));
    $app.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      [state.players[i - 1], state.players[i]] = [state.players[i], state.players[i - 1]];
      savePlayers();
      render({ keepScroll: true });
    }));
    $app.querySelectorAll('.del').forEach((b) => b.addEventListener('click', () => {
      state.players.splice(+b.dataset.i, 1);
      savePlayers();
      render({ keepScroll: true });
    }));
    $app.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      state.impostors = +b.dataset.k;
      store.set('imp.impostors', state.impostors);
      render({ keepScroll: true });
    }));
    const resetBtn = $app.querySelector('.reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!confirm('Wszystkie hasła wrócą do puli i mogą się powtórzyć. Na pewno?')) return;
      store.set(NS + 'used', []);
      render({ keepScroll: true });
    });
    $app.querySelector('.go').addEventListener('click', startGame);
  }

  function renderReveal(stripe, g) {
    const i = g.turn;
    const total = g.names.length;
    const last = i === total - 1;
    const imp = g.imps.includes(i);
    const [, word, hint] = g.word;

    // Oba warianty mają ten sam układ i kolory, różni się tylko treść.
    const top = imp ? 'Jesteś impostorem' : 'Twoje hasło';
    const main = imp ? hint : word;
    const sub = imp ? 'to twoja podpowiedź' : 'nie mów go nikomu';

    $app.innerHTML = `${stripe}
      <main class="screen reveal">
        <header class="bar">
          <button class="icon-btn quit" type="button" aria-label="Przerwij grę">${ICON.x}</button>
          <span class="count">${i + 1} z ${total}</span>
        </header>
        <div class="who"><p class="for">Telefon dla</p><p class="name">${esc(g.names[i])}</p></div>
        <div class="card" tabindex="0" role="button" aria-label="Przytrzymaj, żeby zobaczyć">
          <div class="secret"><p class="s-top">${top}</p><p class="s-main">${esc(main)}</p><p class="s-sub">${sub}</p></div>
          <div class="cover"><div class="press">${ICON.finger}<span>Przytrzymaj</span></div></div>
        </div>
        <button class="big next" type="button" ${g.seen ? '' : 'disabled'}>${last ? 'Zaczynamy!' : 'Dalej'}</button>
      </main>`;

    const card = $app.querySelector('.card');
    const next = $app.querySelector('.next');
    holdable(card, () => {
      card.classList.add('open');
    }, () => {
      card.classList.remove('open');
      if (!g.seen) {
        g.seen = true;
        saveGame();
        next.disabled = false;
      }
    });
    next.addEventListener('click', () => {
      if (!g.seen) return;
      g.turn += 1;
      g.seen = false;
      if (g.turn >= total) g.phase = 'play';
      saveGame();
      render();
    });
    $app.querySelector('.quit').addEventListener('click', quitGame);
  }

  function renderPlay(stripe, g) {
    $app.innerHTML = `${stripe}
      <main class="screen play">
        <header class="bar">
          <button class="icon-btn quit" type="button" aria-label="Przerwij grę">${ICON.x}</button>
        </header>
        <div class="who">
          <p class="for">Zaczyna</p>
          <p class="name">${esc(g.names[g.starter])}</p>
          <p class="tip">Po kolei każdy mówi jedno słowo.</p>
        </div>
        <button class="big hold" type="button" style="--hold-ms:${HOLD_MS}ms">
          <span class="fill"></span>
          <span class="lbl">Kto jest impostorem?<small>przytrzymaj, żeby odkryć</small></span>
        </button>
      </main>`;

    const btn = $app.querySelector('.hold');
    let timer = null;
    holdable(btn, () => {
      btn.classList.add('holding');
      timer = setTimeout(() => {
        timer = null;
        g.phase = 'result';
        saveGame();
        keepAwake(false);
        render();
      }, HOLD_MS);
    }, () => {
      btn.classList.remove('holding');
      if (timer) { clearTimeout(timer); timer = null; }
    });
    $app.querySelector('.quit').addEventListener('click', quitGame);
  }

  function renderResult(stripe, g) {
    const imps = g.imps.map((i) => esc(g.names[i]));
    const [, word, hint] = g.word;
    $app.innerHTML = `${stripe}
      <main class="screen result">
        <div class="who">
          <p class="for">${imps.length > 1 ? 'Impostorzy to' : 'Impostor to'}</p>
          <p class="name">${imps.join(' i ')}</p>
        </div>
        <div class="card static">
          <p class="s-top">Hasło</p>
          <p class="s-main">${esc(word)}</p>
          <p class="s-sub">Podpowiedź: ${esc(hint)}</p>
        </div>
        <div class="actions">
          <button class="big again" type="button">Jeszcze raz</button>
          <button class="big ghost change" type="button">Zmień graczy</button>
        </div>
      </main>`;
    $app.querySelector('.again').addEventListener('click', startGame);
    $app.querySelector('.change').addEventListener('click', () => {
      state.game = null;
      saveGame();
      render();
    });
  }

  // ---------- start ----------

  // Gdy telefon zgaśnie albo ktoś przełączy aplikację, hasło od razu się chowa.
  const hideAll = () => cleanup.forEach((f) => f());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hideAll();
    else if (state.game && state.game.phase !== 'result') keepAwake(true);
  });
  window.addEventListener('blur', hideAll);
  window.addEventListener('pagehide', hideAll);

  if (state.game && state.game.phase !== 'result') keepAwake(true);
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

  loadWords()
    .then((items) => { words = items; })
    .catch(() => { loadError = true; })
    .finally(() => { if (!state.game) render({ keepScroll: true }); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {});
    });
  }
})();
