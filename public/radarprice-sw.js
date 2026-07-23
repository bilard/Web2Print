// Service worker de la PWA « radarPrice » — scope /radarprice uniquement.
// Rôle : installabilité + coquille hors-ligne. N'intercepte JAMAIS les autres
// routes du site (promo, dashboard, /pulse…), qui gardent leur stratégie Hosting.
const CACHE = 'radarprice-v1'
const SHELL = ['/radarprice', '/radarprice-icon-192.png', '/radarprice.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Navigation (chargement de la coquille) : réseau d'abord, repli cache hors-ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/radarprice', copy))
          return res
        })
        .catch(() => caches.match('/radarprice')),
    )
    return
  }

  // Assets même origine : cache d'abord (stale-while-revalidate léger).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
  }
})
