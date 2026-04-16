/**
 * Script injecté dans l'iframe qui affiche la page source. Gère le mode
 * "capture" : hover → highlight, click → postMessage au parent avec le
 * sélecteur généré. Le parent gère l'UI de mappage (field cible).
 */
export const OVERLAY_SCRIPT = `
(function() {
  'use strict'
  if (window.__pimCaptureInstalled) return
  window.__pimCaptureInstalled = true

  // Mode capture : 'off' | 'single' | 'multiple' | 'group'
  var mode = 'off'
  var currentHover = null
  var highlightEl = null
  var tooltipEl = null
  // Overlays persistants (preview d'un selector stocké). Repositionnés au
  // scroll et resize pour suivre le contenu.
  window.__pimPersistentOverlays = window.__pimPersistentOverlays || []
  window.__pimPersistentNodes = window.__pimPersistentNodes || null
  function clearPersistentOverlays() {
    (window.__pimPersistentOverlays || []).forEach(function(o) { o.remove() })
    window.__pimPersistentOverlays = []
  }
  function renderPersistentOverlays() {
    clearPersistentOverlays()
    if (!window.__pimPersistentNodes || window.__pimPersistentNodes.length === 0) return
    window.__pimPersistentNodes.forEach(function(n) {
      if (!n || !n.getBoundingClientRect) return
      var r = n.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      var o = document.createElement('div')
      o.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #10b981;background:rgba(16,185,129,0.15);border-radius:3px;box-shadow:0 0 0 9999px rgba(0,0,0,0.0);'
      o.style.left = r.left + 'px'; o.style.top = r.top + 'px'
      o.style.width = r.width + 'px'; o.style.height = r.height + 'px'
      document.documentElement.appendChild(o)
      window.__pimPersistentOverlays.push(o)
    })
  }
  window.addEventListener('scroll', renderPersistentOverlays, { passive: true, capture: true })
  window.addEventListener('resize', renderPersistentOverlays, { passive: true })

  function ensureHighlight() {
    if (highlightEl) return highlightEl
    highlightEl = document.createElement('div')
    highlightEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6366f1;background:rgba(99,102,241,0.15);border-radius:3px;transition:all 0.05s ease;'
    document.documentElement.appendChild(highlightEl)
    tooltipEl = document.createElement('div')
    tooltipEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#1a1a1a;color:#fff;font:11px -apple-system,Segoe UI,sans-serif;padding:4px 8px;border-radius:4px;border:1px solid #6366f1;max-width:400px;'
    document.documentElement.appendChild(tooltipEl)
    return highlightEl
  }

  function removeHighlight() {
    if (highlightEl) highlightEl.remove()
    if (tooltipEl) tooltipEl.remove()
    highlightEl = null; tooltipEl = null; currentHover = null
  }

  function describeElement(el) {
    if (!el) return ''
    var tag = el.tagName.toLowerCase()
    var cls = Array.from(el.classList || []).slice(0, 2).map(function(c) { return '.' + c }).join('')
    var id = el.id ? '#' + el.id : ''
    var text = (el.textContent || '').trim().slice(0, 40)
    return tag + id + cls + (text ? ' — ' + text : '')
  }

  function onMouseOver(e) {
    if (mode === 'off') return
    var target = e.target
    if (target === highlightEl || target === tooltipEl) return
    ensureHighlight()
    var r = target.getBoundingClientRect()
    highlightEl.style.left = r.left + 'px'
    highlightEl.style.top = r.top + 'px'
    highlightEl.style.width = r.width + 'px'
    highlightEl.style.height = r.height + 'px'
    tooltipEl.textContent = describeElement(target)
    tooltipEl.style.left = Math.min(r.left, window.innerWidth - 300) + 'px'
    tooltipEl.style.top = Math.max(r.top - 24, 4) + 'px'
    currentHover = target
  }

  function buildPath(el) {
    var parts = []
    var cur = el
    var depth = 0
    while (cur && cur !== document.body && cur.parentElement && depth < 6) {
      var tag = cur.tagName.toLowerCase()
      var cls = Array.from(cur.classList || []).filter(function(c) {
        return c && !/^(is-|has-|active|hover|focus|ng-|js-)/.test(c)
      }).slice(0, 2)
      var part = cls.length > 0 ? tag + '.' + cls.join('.') : tag
      parts.unshift(part)
      cur = cur.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  function idSelector(el) {
    if (el.id && /^[a-zA-Z][\\w-]*$/.test(el.id)) return '#' + el.id
    return null
  }

  function classesSelector(el) {
    var cls = Array.from(el.classList || []).filter(function(c) {
      return c && !/^(is-|has-|active|hover|focus|ng-|js-)/.test(c)
    })
    if (cls.length === 0) return null
    var tag = el.tagName.toLowerCase()
    // Try each class alone
    for (var i = 0; i < cls.length; i++) {
      var s = tag + '.' + cls[i]
      try { if (document.querySelectorAll(s).length === 1) return s } catch (e) {}
    }
    // Try two classes
    if (cls.length >= 2) {
      var s2 = tag + '.' + cls[0] + '.' + cls[1]
      try { if (document.querySelectorAll(s2).length <= 3) return s2 } catch (e) {}
    }
    return null
  }

  function onClick(e) {
    if (mode === 'off') return
    e.preventDefault()
    e.stopPropagation()
    var el = currentHover || e.target
    if (!el) return
    var candidates = []
    var idSel = idSelector(el)
    if (idSel) candidates.push(idSel)
    var clsSel = classesSelector(el)
    if (clsSel) candidates.push(clsSel)
    candidates.push(buildPath(el))
    // Attribute value if image or link
    var attr = null
    var tag = el.tagName.toLowerCase()
    if (tag === 'img' && el.src) attr = 'src'
    else if (tag === 'a' && el.href) attr = 'href'
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
    window.parent.postMessage({
      type: 'pim-capture',
      selectors: candidates,
      attr: attr,
      tag: tag,
      text: text,
      mode: mode,
    }, '*')
  }

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('click', onClick, true)

  // Intercepter les clics sur les ancres/submits (évite navigation)
  document.addEventListener('submit', function(e) { if (mode !== 'off') e.preventDefault() }, true)

  window.addEventListener('message', function(e) {
    var msg = e.data || {}
    if (msg.type === 'pim-set-mode') {
      mode = msg.mode || 'off'
      if (mode === 'off') removeHighlight()
    }
    if (msg.type === 'pim-preview-selector') {
      // Surbriller en PERSISTANT le selector (reste jusqu'au prochain
      // pim-preview-selector ou pim-clear-preview). Repositionné au scroll
      // et resize pour suivre le contenu.
      clearPersistentOverlays()
      try {
        var matches = document.querySelectorAll(msg.selector)
        window.__pimPersistentNodes = Array.from(matches)
        renderPersistentOverlays()
        window.parent.postMessage({ type: 'pim-preview-result', count: matches.length }, '*')
      } catch (err) {
        window.parent.postMessage({ type: 'pim-preview-result', count: 0, error: err.message }, '*')
      }
    }
    if (msg.type === 'pim-clear-preview') {
      clearPersistentOverlays()
      window.__pimPersistentNodes = null
    }
  }, false)

  window.parent.postMessage({ type: 'pim-ready' }, '*')
})()
`
