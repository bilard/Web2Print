/* Consentement cookies + chargement conditionnel de Contentsquare (Hotjar).
   Le script de mesure n'est chargé QU'APRÈS acceptation explicite (RGPD).
   Texte du bandeau adapté à la langue de la page (document.documentElement.lang). */
(function () {
  var KEY = 'cs_consent'; // 'granted' | 'denied'
  var CS = 'https://t.contentsquare.net/uxa/ff38b52be0a2c.js';

  function load() {
    if (window.__csLoaded) return;
    window.__csLoaded = 1;
    var s = document.createElement('script');
    s.src = CS; s.defer = true;
    document.head.appendChild(s);
  }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'granted') { load(); return; }
  if (choice === 'denied') { return; }

  var L = (document.documentElement.lang || 'fr').slice(0, 2);
  var T = {
    fr: { t: 'Nous utilisons des cookies de mesure d’audience (Contentsquare) pour améliorer le site. Vous pouvez accepter ou refuser.', a: 'Accepter', r: 'Refuser' },
    en: { t: 'We use analytics cookies (Contentsquare) to improve the site. You can accept or decline.', a: 'Accept', r: 'Decline' },
    es: { t: 'Usamos cookies de analítica (Contentsquare) para mejorar el sitio. Puede aceptar o rechazar.', a: 'Aceptar', r: 'Rechazar' },
    de: { t: 'Wir verwenden Analyse-Cookies (Contentsquare), um die Website zu verbessern. Sie können zustimmen oder ablehnen.', a: 'Zustimmen', r: 'Ablehnen' },
    it: { t: 'Utilizziamo cookie di analisi (Contentsquare) per migliorare il sito. Puoi accettare o rifiutare.', a: 'Accetta', r: 'Rifiuta' }
  };
  var x = T[L] || T.fr;

  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt) e.textContent = txt;
    return e;
  }

  function banner() {
    var wrap = el('div', 'position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:680px;margin:0 auto;background:#12131a;color:#e6e7ee;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.5);font:400 13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Cookies');
    var p = el('span', 'flex:1 1 320px', x.t);
    var btns = el('div', 'display:flex;gap:8px;flex:0 0 auto');
    var acc = el('button', 'cursor:pointer;border:0;border-radius:999px;padding:8px 16px;font:600 13px system-ui;background:#6366f1;color:#fff', x.a);
    var ref = el('button', 'cursor:pointer;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 16px;font:600 13px system-ui;background:transparent;color:#e6e7ee', x.r);
    acc.onclick = function () { try { localStorage.setItem(KEY, 'granted'); } catch (e) {} wrap.remove(); load(); };
    ref.onclick = function () { try { localStorage.setItem(KEY, 'denied'); } catch (e) {} wrap.remove(); };
    btns.appendChild(ref); btns.appendChild(acc);
    wrap.appendChild(p); wrap.appendChild(btns);
    document.body.appendChild(wrap);
  }

  if (document.body) banner();
  else document.addEventListener('DOMContentLoaded', banner);
})();
