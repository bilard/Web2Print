// @ts-nocheck
/**
 * Overlay injecté en MAIN world via chrome.scripting.executeScript.
 *
 * Équivalent de OVERLAY_SCRIPT (côté iframe) mais en fichier JS séparé pour
 * contourner la CSP des pages fournisseur qui interdisent les inline scripts.
 */
;(function() {
  'use strict'
  if (window.__pimCaptureInstalled) return
  window.__pimCaptureInstalled = true

  // Mode capture : 'off' | 'single' | 'multiple' | 'group'
  var mode = 'off'
  var currentHover = null
  var highlightEl = null
  var tooltipEl = null
  window.__pimPersistentTags = window.__pimPersistentTags || []
  window.__pimActiveSelector = window.__pimActiveSelector || null
  window.__pimPersistentOverlays = window.__pimPersistentOverlays || []

  var PALETTE = [
    '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#14b8a6', '#f97316', '#06b6d4', '#a855f7', '#22c55e',
  ]

  function colorFor(index) { return PALETTE[index % PALETTE.length] }

  function clearPersistentOverlays() {
    (window.__pimPersistentOverlays || []).forEach(function(o) { o.remove() })
    window.__pimPersistentOverlays = []
  }

  function renderPersistentOverlays() {
    clearPersistentOverlays()
    var tags = window.__pimPersistentTags || []
    if (tags.length === 0) return
    tags.forEach(function(tag) {
      var isActive = tag.selector === window.__pimActiveSelector
      var alpha = isActive ? 0.28 : 0.12
      var borderAlpha = isActive ? 1.0 : 0.65
      var nodes = tag.nodes || []
      nodes.forEach(function(n) {
        if (!n || !n.getBoundingClientRect) return
        var r = n.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        var box = document.createElement('div')
        box.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483645;' +
          'border:2px solid ' + tag.color + ';' +
          'background:' + hexToRgba(tag.color, alpha) + ';' +
          'border-radius:3px;' +
          'opacity:' + borderAlpha + ';'
        box.style.left = r.left + 'px'
        box.style.top = r.top + 'px'
        box.style.width = r.width + 'px'
        box.style.height = r.height + 'px'
        document.documentElement.appendChild(box)
        window.__pimPersistentOverlays.push(box)
        var label = document.createElement('div')
        label.textContent = tag.label
        label.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483644;' +
          'background:' + tag.color + ';color:#fff;' +
          'font:11px -apple-system,Segoe UI,sans-serif;font-weight:600;' +
          'padding:1px 5px;border-radius:3px 3px 3px 0;' +
          'white-space:nowrap;'
        label.style.left = r.left + 'px'
        label.style.top = Math.max(r.top - 16, 2) + 'px'
        document.documentElement.appendChild(label)
        window.__pimPersistentOverlays.push(label)
      })
    })
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '')
    var bigint = parseInt(h, 16)
    var r = (bigint >> 16) & 255
    var g = (bigint >> 8) & 255
    var b = bigint & 255
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
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
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return '#' + el.id
    return null
  }

  function classesSelector(el) {
    var cls = Array.from(el.classList || []).filter(function(c) {
      return c && !/^(is-|has-|active|hover|focus|ng-|js-)/.test(c)
    })
    if (cls.length === 0) return null
    var tag = el.tagName.toLowerCase()
    for (var i = 0; i < cls.length; i++) {
      var s = tag + '.' + cls[i]
      try { if (document.querySelectorAll(s).length === 1) return s } catch (e) {}
    }
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
    var attr = null
    var tag = el.tagName.toLowerCase()
    if (tag === 'img' && el.src) attr = 'src'
    else if (tag === 'a' && el.href) attr = 'href'
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    window.postMessage({
      type: 'pim-capture',
      selectors: candidates,
      attr: attr,
      tag: tag,
      text: text,
      mode: mode,
    }, '*')
  }

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('dblclick', onClick, true)

  document.addEventListener('click', function(e) {
    if (mode === 'off') return
    var tgt = e.target
    while (tgt && tgt !== document.body && tgt.tagName !== 'A') tgt = tgt.parentElement
    if (!tgt || tgt.tagName !== 'A') return
    var href = tgt.getAttribute('href') || ''
    if (/^https?:/.test(href) || tgt.target === '_blank' || tgt.target === '_top') {
      e.preventDefault()
      e.stopPropagation()
    }
  }, true)

  document.addEventListener('submit', function(e) { if (mode !== 'off') e.preventDefault() }, true)

  window.addEventListener('message', function(e) {
    var msg = e.data || {}
    if (msg.type === 'pim-set-mode') {
      mode = msg.mode || 'off'
      if (mode === 'off') removeHighlight()
    }
    if (msg.type === 'pim-set-persistent-tags') {
      var tags = Array.isArray(msg.tags) ? msg.tags : []
      window.__pimPersistentTags = tags.map(function(t, i) {
        var nodes = []
        try {
          nodes = Array.from(document.querySelectorAll(t.selector))
        } catch (err) { /* selector invalide */ }
        return { selector: t.selector, label: t.label, color: colorFor(i), nodes: nodes }
      })
      renderPersistentOverlays()
    }
    if (msg.type === 'pim-set-active-selector') {
      window.__pimActiveSelector = msg.selector || null
      if (window.__pimActiveSelector) {
        var active = (window.__pimPersistentTags || []).find(function(t) { return t.selector === window.__pimActiveSelector })
        if (active && active.nodes[0] && active.nodes[0].scrollIntoView) {
          active.nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
          setTimeout(renderPersistentOverlays, 350)
        }
      }
      renderPersistentOverlays()
    }
    if (msg.type === 'pim-clear-persistent-tags') {
      window.__pimPersistentTags = []
      window.__pimActiveSelector = null
      clearPersistentOverlays()
    }
  }, false)

  window.postMessage({ type: 'pim-ready' }, '*')
})()
