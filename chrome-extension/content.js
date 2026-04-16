// Content script : injecte l'overlay de capture dans la page.
// Communication avec popup.js via chrome.runtime.sendMessage.
//
// Mirror fonctionnel de src/features/scraping-templates/overlayScript.ts
// mais adapté pour chrome.runtime (pas window.postMessage).

(function() {
  'use strict'
  if (window.__pimCaptureInstalled) return
  window.__pimCaptureInstalled = true

  let mode = 'off' // 'off' | 'single' | 'multiple'
  let currentHover = null
  let highlightEl = null
  let tooltipEl = null

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
    const tag = el.tagName.toLowerCase()
    const cls = Array.from(el.classList || []).slice(0, 2).map((c) => '.' + c).join('')
    const id = el.id ? '#' + el.id : ''
    const text = (el.textContent || '').trim().slice(0, 40)
    return tag + id + cls + (text ? ' — ' + text : '')
  }

  function onMouseOver(e) {
    if (mode === 'off') return
    const target = e.target
    if (target === highlightEl || target === tooltipEl) return
    ensureHighlight()
    const r = target.getBoundingClientRect()
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
    const parts = []
    let cur = el
    let depth = 0
    while (cur && cur !== document.body && cur.parentElement && depth < 6) {
      const tag = cur.tagName.toLowerCase()
      const cls = Array.from(cur.classList || []).filter((c) =>
        c && !/^(is-|has-|active|hover|focus|ng-|js-)/.test(c)
      ).slice(0, 2)
      parts.unshift(cls.length > 0 ? tag + '.' + cls.join('.') : tag)
      cur = cur.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  function idSelector(el) {
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return '#' + el.id
    return null
  }

  function classesSelector(el) {
    const cls = Array.from(el.classList || []).filter((c) =>
      c && !/^(is-|has-|active|hover|focus|ng-|js-)/.test(c)
    )
    if (cls.length === 0) return null
    const tag = el.tagName.toLowerCase()
    for (const c of cls) {
      const s = tag + '.' + c
      try { if (document.querySelectorAll(s).length === 1) return s } catch {}
    }
    if (cls.length >= 2) {
      const s2 = tag + '.' + cls[0] + '.' + cls[1]
      try { if (document.querySelectorAll(s2).length <= 3) return s2 } catch {}
    }
    return null
  }

  function onClick(e) {
    if (mode === 'off') return
    e.preventDefault()
    e.stopPropagation()
    const el = currentHover || e.target
    if (!el) return
    const candidates = []
    const idSel = idSelector(el)
    if (idSel) candidates.push(idSel)
    const clsSel = classesSelector(el)
    if (clsSel) candidates.push(clsSel)
    candidates.push(buildPath(el))
    let attr = null
    const tag = el.tagName.toLowerCase()
    if (tag === 'img' && el.src) attr = 'src'
    else if (tag === 'a' && el.href) attr = 'href'
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    chrome.runtime.sendMessage({
      type: 'pim-capture',
      url: window.location.href,
      selectors: candidates,
      attr,
      tag,
      text,
      mode,
    })
  }

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('submit', (e) => { if (mode !== 'off') e.preventDefault() }, true)

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'pim-set-mode') {
      mode = msg.mode || 'off'
      if (mode === 'off') removeHighlight()
      sendResponse({ ok: true })
    }
    if (msg.type === 'pim-preview-selector') {
      try {
        const matches = document.querySelectorAll(msg.selector)
        removeHighlight()
        const overlays = []
        matches.forEach((m) => {
          const r = m.getBoundingClientRect()
          const o = document.createElement('div')
          o.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #10b981;background:rgba(16,185,129,0.12);border-radius:3px;'
          o.style.left = r.left + 'px'; o.style.top = r.top + 'px'
          o.style.width = r.width + 'px'; o.style.height = r.height + 'px'
          document.documentElement.appendChild(o)
          overlays.push(o)
        })
        setTimeout(() => overlays.forEach((o) => o.remove()), 3000)
        sendResponse({ count: matches.length })
      } catch (err) {
        sendResponse({ count: 0, error: err.message })
      }
    }
    if (msg.type === 'pim-get-url') {
      sendResponse({ url: window.location.href, host: window.location.hostname })
    }
    return true
  })
})()
