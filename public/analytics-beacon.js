// public/analytics-beacon.js
// Beacon analytics maison — sans cookie, sans dépendance. Voir docs/superpowers/specs.
(function () {
  var ENDPOINT = '/_w2p/collect'
  var SESSION_TTL = 30 * 60 * 1000 // 30 min d'inactivité

  function rand() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
  }
  function visitorId() {
    try {
      var v = localStorage.getItem('w2p_vid')
      if (!v) { v = rand(); localStorage.setItem('w2p_vid', v) }
      return v
    } catch (e) { return rand() }
  }
  function sessionId() {
    try {
      var now = Date.now()
      var sid = sessionStorage.getItem('w2p_sid')
      var last = parseInt(sessionStorage.getItem('w2p_sid_ts') || '0', 10)
      if (!sid || now - last > SESSION_TTL) { sid = rand() }
      sessionStorage.setItem('w2p_sid', sid)
      sessionStorage.setItem('w2p_sid_ts', String(now))
      return sid
    } catch (e) { return rand() }
  }
  function utmSource() {
    try {
      var p = new URLSearchParams(location.search).get('utm_source')
      return p ? p.slice(0, 120) : null
    } catch (e) { return null }
  }
  // Chemin = page + ancre (#section). Sur un site mono-page à ancres, c'est
  // l'ancre qui identifie la section consultée (#modules, #scraper, …).
  function currentPath() {
    return location.pathname + (location.hash || '')
  }
  var lastPath = null
  var timer = null
  function doSend() {
    try {
      var p = currentPath()
      if (p === lastPath) return // dédoublonnage (scroll-spy qui rejoue la même ancre)
      lastPath = p
      var payload = JSON.stringify({
        path: p,
        vid: visitorId(),
        sid: sessionId(),
        src: utmSource(),
        uid: window.__w2pAnalyticsUid || null,
      })
      var blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, blob)
      else fetch(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true })
    } catch (e) { /* best-effort */ }
  }
  function send() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doSend, 150) // petit anti-rebond pour les changements d'ancre rapides
  }

  // L'auth Firebase se résout APRÈS le chargement : le pont uid (uidBridge) appelle
  // ceci dès qu'il connaît l'utilisateur, pour ré-enregistrer la page courante avec l'uid.
  window.__w2pIdentify = function (uid) {
    window.__w2pAnalyticsUid = uid || null
    if (!uid) return
    lastPath = null // force le renvoi de la page courante, cette fois taguée avec l'uid
    send()
  }

  // Page vue initiale
  send()

  // Navigation par ancre (#section) sur les sites mono-page
  window.addEventListener('hashchange', send)

  // Navigation SPA : patcher history + popstate
  var push = history.pushState
  history.pushState = function () { push.apply(this, arguments); send() }
  var replace = history.replaceState
  history.replaceState = function () { replace.apply(this, arguments); send() }
  window.addEventListener('popstate', send)
})()
