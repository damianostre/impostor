// Service worker: gra działa bez internetu.
// Zasada: najpierw sieć (żeby nowe hasła i poprawki docierały od razu),
// a gdy sieci nie ma albo odpowiada dłużej niż 3 s, kopia z telefonu.

const CACHE = 'impostor-v1';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'words.dat',
  'manifest.webmanifest',
  'fonts/baloo2-latin.woff2',
  'fonts/baloo2-latin-ext.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'test/',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(handle(e, req));
});

async function handle(e, req) {
  const cache = await caches.open(CACHE);
  const net = fetch(new Request(req, { cache: 'no-cache' })).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  e.waitUntil(net.then(() => {}, () => {}));

  const cached = await cache.match(req, { ignoreSearch: true });
  if (!cached) {
    try { return await net; } catch { return fallback(req, cache); }
  }
  const timeout = new Promise((r) => setTimeout(() => r(null), 3000));
  try {
    const res = await Promise.race([net, timeout]);
    if (res && (res.ok || res.type === 'opaqueredirect')) return res;
  } catch { /* brak sieci */ }
  return cached;
}

async function fallback(req, cache) {
  if (req.mode === 'navigate') {
    const isTest = new URL(req.url).pathname.includes('/test');
    const page = await cache.match(isTest ? 'test/' : './');
    if (page) return page;
  }
  return Response.error();
}
