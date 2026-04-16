// Content script : injecte l'overlay de capture + un panneau flottant dans
// la page. Le panneau reste visible pendant la capture (contrairement au
// popup Chrome qui se ferme au clic ailleurs) et permet d'assigner chaque
// élément à un champ sans quitter le contexte de la page.

(function() {
  'use strict'
  if (window.__pimCaptureInstalled) return
  window.__pimCaptureInstalled = true

  const STANDARD_FIELDS = [
    { field: 'title', label: 'Titre' },
    { field: 'description', label: 'Description' },
    { field: 'brand', label: 'Marque' },
    { field: 'reference', label: 'Référence' },
    { field: 'price', label: 'Prix' },
    { field: 'ean', label: 'EAN' },
    { field: 'images', label: 'Images', multiple: true },
    { field: 'documents', label: 'Documents', multiple: true },
    { field: 'advantages', label: 'Avantages', multiple: true },
  ]

  let mode = 'off'
  let currentHover = null
  let highlightEl = null
  let tooltipEl = null
  let panel = null
  let assignModal = null
  let pendingCapture = null
  let selectedSelectorIdx = 0

  // ── Highlight + tooltip au survol ────────────────────────────────────────
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

  function onMouseOver(e) {
    if (mode === 'off') return
    const target = e.target
    if (!target || target === highlightEl || target === tooltipEl) return
    if (panel && panel.contains(target)) return
    if (assignModal && assignModal.contains(target)) return
    ensureHighlight()
    const r = target.getBoundingClientRect()
    highlightEl.style.left = r.left + 'px'
    highlightEl.style.top = r.top + 'px'
    highlightEl.style.width = r.width + 'px'
    highlightEl.style.height = r.height + 'px'
    const tag = target.tagName.toLowerCase()
    const cls = Array.from(target.classList || []).slice(0, 2).map((c) => '.' + c).join('')
    const id = target.id ? '#' + target.id : ''
    const text = (target.textContent || '').trim().slice(0, 40)
    tooltipEl.textContent = tag + id + cls + (text ? ' — ' + text : '')
    tooltipEl.style.left = Math.min(r.left, window.innerWidth - 300) + 'px'
    tooltipEl.style.top = Math.max(r.top - 24, 4) + 'px'
    currentHover = target
  }

  // ── Génération de sélecteurs candidats ───────────────────────────────────
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

  function candidatesFor(el) {
    const candidates = []
    const idSel = idSelector(el); if (idSel) candidates.push(idSel)
    const clsSel = classesSelector(el); if (clsSel) candidates.push(clsSel)
    candidates.push(buildPath(el))
    return candidates
  }

  // ── Panneau flottant (état de capture) ───────────────────────────────────
  function ensurePanel() {
    if (panel) return panel
    panel = document.createElement('div')
    panel.id = '__pim-panel'
    panel.style.cssText = `
      position:fixed;top:12px;right:12px;width:320px;max-height:80vh;overflow:auto;
      z-index:2147483645;background:#0f0f0f;color:rgba(255,255,255,0.9);
      font:12px -apple-system,Segoe UI,Roboto,sans-serif;
      border:1px solid rgba(99,102,241,0.3);border-radius:8px;
      box-shadow:0 10px 40px rgba(0,0,0,0.6);
      padding:0;
    `
    document.documentElement.appendChild(panel)
    return panel
  }
  function removePanel() {
    if (panel) panel.remove()
    panel = null
  }

  function renderPanel() {
    if (mode === 'off') { removePanel(); return }
    ensurePanel()
    chrome.runtime.sendMessage({ type: 'pim-get-draft' }, (res) => {
      const draft = (res && res.draft) || { fields: [], name: '', vendorDomain: '' }
      const fieldsHtml = draft.fields.length === 0
        ? '<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.35);font-size:11px">Clique sur un élément de la page pour commencer.</div>'
        : draft.fields.map((f, i) => `
          <div style="display:flex;gap:6px;align-items:center;padding:4px 6px;background:rgba(255,255,255,0.03);border-radius:3px;margin-bottom:3px;font-size:11px">
            <span style="color:#c7d2fe;font-weight:600;min-width:70px">${escapeHtml(f.field)}${f.multiple ? ' <span style="font-size:9px;color:rgba(255,255,255,0.3)">[liste]</span>' : ''}</span>
            <code style="flex:1;color:rgba(255,255,255,0.5);font-family:ui-monospace,monospace;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.strategies[0].expression)}</code>
            <button data-pim-remove="${i}" style="cursor:pointer;background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);border-radius:3px;padding:2px 5px;font-size:10px">✕</button>
          </div>
        `).join('')
      panel.innerHTML = `
        <div style="padding:8px 10px;background:linear-gradient(to right,rgba(99,102,241,0.15),rgba(236,72,153,0.08));border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:12px">PIM Capture</strong>
          <button id="__pim-close" style="cursor:pointer;background:transparent;border:none;color:rgba(255,255,255,0.6);font-size:16px;padding:0">✕</button>
        </div>
        <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <label style="display:block;font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em">Nom du template</label>
          <input id="__pim-name" type="text" value="${escapeAttr(draft.name || 'Template ' + window.location.hostname)}" style="width:100%;padding:5px 7px;font:inherit;font-size:11px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:inherit" />
          <label style="display:block;font-size:10px;color:rgba(255,255,255,0.5);margin:6px 0 3px;text-transform:uppercase;letter-spacing:0.05em">Domaine</label>
          <input id="__pim-domain" type="text" value="${escapeAttr(draft.vendorDomain || window.location.hostname.replace(/^www\./, ''))}" style="width:100%;padding:5px 7px;font:inherit;font-size:11px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:inherit" />
        </div>
        <div style="padding:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em">
            <span>Champs (${draft.fields.length})</span>
            <button id="__pim-clear" style="cursor:pointer;background:transparent;border:none;color:rgba(239,68,68,0.7);font-size:10px;padding:0">Tout effacer</button>
          </div>
          ${fieldsHtml}
        </div>
        <div style="padding:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px">
          <button id="__pim-export" style="flex:1;cursor:pointer;background:rgba(16,185,129,0.2);color:#a7f3d0;border:1px solid rgba(52,211,153,0.3);border-radius:3px;padding:6px 10px;font:inherit;font-size:11px">⬇ Exporter JSON</button>
        </div>
      `
      panel.querySelector('#__pim-close').addEventListener('click', () => {
        setMode('off')
      })
      panel.querySelector('#__pim-clear').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'pim-clear-fields' }, () => renderPanel())
      })
      panel.querySelector('#__pim-name').addEventListener('input', (e) => {
        chrome.runtime.sendMessage({ type: 'pim-set-meta', name: e.target.value })
      })
      panel.querySelector('#__pim-domain').addEventListener('input', (e) => {
        chrome.runtime.sendMessage({ type: 'pim-set-meta', vendorDomain: e.target.value })
      })
      panel.querySelector('#__pim-export').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'pim-export' })
      })
      panel.querySelectorAll('[data-pim-remove]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const i = Number(btn.dataset.pimRemove)
          chrome.runtime.sendMessage({ type: 'pim-remove-field', index: i }, () => renderPanel())
        })
      })
    })
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
  function escapeAttr(s) { return escapeHtml(s) }

  // ── Modale d'assignation (affichée dans la page) ─────────────────────────
  function showAssignModal(capture) {
    pendingCapture = capture
    selectedSelectorIdx = 0
    if (assignModal) assignModal.remove()
    assignModal = document.createElement('div')
    assignModal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
      z-index:2147483646;display:flex;align-items:center;justify-content:center;
      font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:rgba(255,255,255,0.9);
    `
    const box = document.createElement('div')
    box.style.cssText = `
      background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;
      padding:16px;max-width:520px;width:90%;
    `
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:14px;font-weight:600">Élément capturé</h3>
        <button id="__pim-modal-close" style="cursor:pointer;background:transparent;border:none;color:rgba(255,255,255,0.6);font-size:18px;padding:0">✕</button>
      </div>
      <div style="padding:8px;background:rgba(0,0,0,0.4);border-radius:4px;font-size:11px;margin-bottom:12px">
        <div style="color:rgba(255,255,255,0.5)">Tag : <span style="color:rgba(255,255,255,0.9);font-family:monospace">${escapeHtml(capture.tag)}</span></div>
        ${capture.text ? `<div style="color:rgba(255,255,255,0.5);margin-top:4px">Texte : <span style="color:rgba(255,255,255,0.8)">"${escapeHtml(capture.text)}"</span></div>` : ''}
        ${capture.attr ? `<div style="color:rgba(255,255,255,0.5);margin-top:4px">Attribut : <span style="color:rgba(255,255,255,0.9);font-family:monospace">${escapeHtml(capture.attr)}</span></div>` : ''}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">Sélecteur (choisis le plus simple)</div>
      <div id="__pim-selectors" style="display:flex;flex-direction:column;gap:3px;margin-bottom:12px"></div>
      <label style="display:flex;gap:6px;align-items:center;font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:12px">
        <input type="checkbox" id="__pim-multiple" /> Liste (images, specs, variantes…)
      </label>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">Assigner à un champ</div>
      <div id="__pim-fields" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px"></div>
      <div style="display:flex;gap:6px">
        <input id="__pim-custom" type="text" placeholder="Ou nom de champ custom" style="flex:1;padding:5px 8px;font:inherit;font-size:11px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:inherit" />
        <button id="__pim-custom-btn" style="cursor:pointer;background:rgba(16,185,129,0.2);color:#a7f3d0;border:1px solid rgba(52,211,153,0.3);border-radius:3px;padding:5px 10px;font:inherit;font-size:11px">+ Assigner</button>
      </div>
    `
    assignModal.appendChild(box)
    document.documentElement.appendChild(assignModal)

    const selectorsDiv = box.querySelector('#__pim-selectors')
    capture.selectors.forEach((s, i) => {
      const b = document.createElement('button')
      b.textContent = s
      b.style.cssText = `
        text-align:left;padding:5px 8px;border:1px solid ${i === 0 ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'};
        background:${i === 0 ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.4)'};color:${i === 0 ? '#c7d2fe' : 'rgba(255,255,255,0.7)'};
        border-radius:3px;font-family:monospace;font-size:11px;cursor:pointer;
      `
      b.addEventListener('click', () => {
        selectorsDiv.querySelectorAll('button').forEach((x, j) => {
          x.style.border = '1px solid ' + (j === i ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)')
          x.style.background = j === i ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.4)'
          x.style.color = j === i ? '#c7d2fe' : 'rgba(255,255,255,0.7)'
        })
        selectedSelectorIdx = i
      })
      selectorsDiv.appendChild(b)
    })

    const fieldsDiv = box.querySelector('#__pim-fields')
    STANDARD_FIELDS.forEach((f) => {
      const btn = document.createElement('button')
      btn.textContent = f.label
      btn.style.cssText = `
        cursor:pointer;background:rgba(99,102,241,0.15);color:#c7d2fe;
        border:1px solid rgba(129,140,248,0.3);border-radius:3px;padding:5px 6px;
        font:inherit;font-size:11px;
      `
      btn.addEventListener('click', () => assign(f.field, !!f.multiple))
      fieldsDiv.appendChild(btn)
    })

    box.querySelector('#__pim-modal-close').addEventListener('click', closeAssignModal)
    box.querySelector('#__pim-custom-btn').addEventListener('click', () => {
      const name = box.querySelector('#__pim-custom').value.trim()
      if (name) assign(name, false)
    })
    // onClick capture-phase du document vérifie déjà `assignModal.contains(target)`
    // et return early → pas besoin d'un stopPropagation supplémentaire (qui
    // bloquerait au contraire les clicks sur les boutons enfants).
  }

  function closeAssignModal() {
    if (assignModal) assignModal.remove()
    assignModal = null
    pendingCapture = null
  }

  function assign(fieldName, defaultMultiple) {
    if (!pendingCapture) return
    const multiple = document.getElementById('__pim-multiple')?.checked || defaultMultiple
    const expr = pendingCapture.selectors[selectedSelectorIdx] || pendingCapture.selectors[0]
    const attr = pendingCapture.attr || undefined
    const transform = attr === 'src' || attr === 'href' ? 'absolutize-url' : undefined
    chrome.runtime.sendMessage({
      type: 'pim-assign-field',
      field: fieldName,
      strategies: [{ kind: 'css', expression: expr, attr }],
      multiple,
      transform,
    }, () => { renderPanel(); closeAssignModal() })
  }

  // ── Events globaux ───────────────────────────────────────────────────────
  function onClick(e) {
    if (mode === 'off') return
    // Ignorer clics dans nos propres UI
    if (panel && panel.contains(e.target)) return
    if (assignModal && assignModal.contains(e.target)) return
    e.preventDefault(); e.stopPropagation()
    const el = currentHover || e.target
    if (!el) return
    const selectors = candidatesFor(el)
    const tag = el.tagName.toLowerCase()
    let attr = null
    if (tag === 'img' && el.src) attr = 'src'
    else if (tag === 'a' && el.href) attr = 'href'
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    showAssignModal({ selectors, attr, tag, text })
  }

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('submit', (e) => { if (mode !== 'off') e.preventDefault() }, true)

  function setMode(next) {
    mode = next
    if (mode === 'off') {
      removeHighlight(); removePanel(); closeAssignModal()
    } else {
      renderPanel()
    }
    chrome.runtime.sendMessage({ type: 'pim-mode-changed', mode })
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'pim-set-mode') {
      setMode(msg.mode || 'off')
      sendResponse({ ok: true })
    }
    if (msg.type === 'pim-refresh-panel') {
      renderPanel()
      sendResponse({ ok: true })
    }
    if (msg.type === 'pim-preview-selector') {
      try {
        const matches = document.querySelectorAll(msg.selector)
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
      sendResponse({ url: window.location.href, host: window.location.hostname.replace(/^www\./, '') })
    }
    return true
  })
})()
