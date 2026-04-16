// Popup logic : gère la capture, le draft de template, l'export JSON.
const BUFFER_KEY = 'pim_capture_buffer'
const TEMPLATE_KEY = 'pim_draft_template'

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

let currentTab = null
let draft = null
let pendingCapture = null
let selectedSelectorIdx = 0

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function emptyDraft(host) {
  return {
    id: crypto.randomUUID(),
    name: `Template ${host}`,
    vendorDomain: host,
    urlPattern: '.*',
    preActions: [],
    fields: [],
    specGroups: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    stats: { appliedCount: 0, successCount: 0 },
  }
}

function saveDraft() {
  draft.updatedAt = Date.now()
  chrome.storage.local.set({ [TEMPLATE_KEY]: draft })
}

function loadDraft() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TEMPLATE_KEY], (res) => resolve(res[TEMPLATE_KEY] || null))
  })
}

function render() {
  document.getElementById('tpl-name').value = draft.name
  document.getElementById('tpl-domain').value = draft.vendorDomain

  const list = document.getElementById('fields-list')
  const count = document.getElementById('field-count')
  count.textContent = String(draft.fields.length)

  if (draft.fields.length === 0) {
    list.innerHTML = '<div class="empty">Active la capture et clique sur les éléments de la page.</div>'
  } else {
    list.innerHTML = ''
    draft.fields.forEach((f, i) => {
      const row = document.createElement('div')
      row.className = 'field-row'
      const ind = f.multiple ? ' <span style="font-size:9px;color:rgba(255,255,255,0.3)">[liste]</span>' : ''
      row.innerHTML = `
        <span class="name">${f.field}${ind}</span>
        <code>${f.strategies[0]?.expression || ''}</code>
        <button data-preview="${i}" title="Prévisualiser" style="padding: 2px 6px;">👁</button>
        <button data-remove="${i}" class="danger" title="Supprimer" style="padding: 2px 6px;">✕</button>
      `
      list.appendChild(row)
    })
    list.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.preview)
        previewSelector(draft.fields[i].strategies[0]?.expression)
      })
    })
    list.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.remove)
        draft.fields.splice(i, 1)
        saveDraft(); render()
      })
    })
  }
}

async function previewSelector(selector) {
  if (!currentTab || !selector) return
  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, { type: 'pim-preview-selector', selector })
    const n = res?.count ?? 0
    if (res?.error) console.warn('[pim] preview error', res.error)
    console.log('[pim] preview matches:', n)
  } catch (err) {
    console.warn('[pim] preview failed', err)
  }
}

async function toggleCapture() {
  const btn = document.getElementById('toggle-capture')
  const status = document.getElementById('status')
  const isOn = btn.dataset.on === '1'
  const nextMode = isOn ? 'off' : 'single'
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'pim-set-mode', mode: nextMode })
    if (nextMode === 'off') {
      btn.dataset.on = '0'
      btn.textContent = '▶ Activer la capture'
      btn.classList.remove('danger'); btn.classList.add('primary')
      status.className = 'status-pill status-off'; status.textContent = '● Inactif'
    } else {
      btn.dataset.on = '1'
      btn.textContent = '■ Arrêter la capture'
      btn.classList.remove('primary'); btn.classList.add('danger')
      status.className = 'status-pill status-on'; status.textContent = '● Capture active'
    }
  } catch (err) {
    alert('Impossible d\'activer sur cet onglet — recharge la page et réessaie.')
    console.error(err)
  }
}

function showCaptureModal(capture) {
  pendingCapture = capture
  selectedSelectorIdx = 0
  const modal = document.getElementById('capture-modal')
  const info = document.getElementById('capture-info')
  const selectors = document.getElementById('selectors-list')
  const fieldButtons = document.getElementById('field-buttons')
  info.textContent = `${capture.tag}${capture.text ? ' — "' + capture.text + '"' : ''}${capture.attr ? ' · attr=' + capture.attr : ''}`
  selectors.innerHTML = ''
  capture.selectors.forEach((s, i) => {
    const el = document.createElement('div')
    el.className = 'selector-option' + (i === 0 ? ' selected' : '')
    el.textContent = s
    el.dataset.idx = i
    el.addEventListener('click', () => {
      selectors.querySelectorAll('.selector-option').forEach((o) => o.classList.remove('selected'))
      el.classList.add('selected')
      selectedSelectorIdx = i
      previewSelector(s)
    })
    selectors.appendChild(el)
  })
  fieldButtons.innerHTML = ''
  STANDARD_FIELDS.forEach((f) => {
    const btn = document.createElement('button')
    btn.className = 'primary'
    btn.textContent = f.label
    btn.addEventListener('click', () => assignField(f.field, !!f.multiple))
    fieldButtons.appendChild(btn)
  })
  modal.style.display = 'block'
  document.getElementById('multiple-check').checked = false
}

function hideCaptureModal() {
  document.getElementById('capture-modal').style.display = 'none'
  pendingCapture = null
}

function assignField(fieldName, defaultMultiple) {
  if (!pendingCapture) return
  const multiple = document.getElementById('multiple-check').checked || defaultMultiple
  const expr = pendingCapture.selectors[selectedSelectorIdx] || pendingCapture.selectors[0]
  const attr = pendingCapture.attr || undefined
  const transform = attr === 'src' || attr === 'href' ? 'absolutize-url' : undefined
  const existing = draft.fields.find((f) => f.field === fieldName)
  const newField = {
    field: fieldName,
    strategies: [{ kind: 'css', expression: expr, attr }],
    multiple,
    transform,
  }
  if (existing) {
    Object.assign(existing, newField)
  } else {
    draft.fields.push(newField)
  }
  saveDraft(); render()
  hideCaptureModal()
}

async function exportJson() {
  if (draft.fields.length === 0) {
    alert('Capture d\'abord au moins un champ.')
    return
  }
  draft.name = document.getElementById('tpl-name').value || draft.name
  draft.vendorDomain = document.getElementById('tpl-domain').value || draft.vendorDomain
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${draft.vendorDomain || 'template'}.template.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function importJson(file) {
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    draft = { ...parsed, id: draft.id, updatedAt: Date.now() }
    saveDraft(); render()
  } catch {
    alert('JSON invalide.')
  }
}

async function init() {
  currentTab = await getActiveTab()
  // Récupérer le host courant
  let host = ''
  try { host = new URL(currentTab.url).hostname.replace(/^www\./, '') } catch {}
  document.getElementById('host').textContent = host || 'onglet indisponible'

  // Draft : restore ou créer
  draft = (await loadDraft()) || emptyDraft(host)
  // Si on change de domaine → proposer de repartir à neuf
  if (draft.vendorDomain !== host && host) {
    if (draft.fields.length > 0) {
      if (confirm(`Domaine différent (draft=${draft.vendorDomain}, page=${host}). Repartir de zéro ?`)) {
        draft = emptyDraft(host)
      }
    } else {
      draft.vendorDomain = host
      draft.name = `Template ${host}`
    }
  }
  saveDraft(); render()

  // Lire le buffer de captures (arrivées avant ouverture du popup)
  chrome.storage.session.get([BUFFER_KEY], (res) => {
    const buffer = res[BUFFER_KEY] || []
    if (buffer.length > 0) {
      showCaptureModal(buffer[buffer.length - 1])
      chrome.storage.session.remove(BUFFER_KEY)
    }
  })

  // Bindings
  document.getElementById('toggle-capture').addEventListener('click', toggleCapture)
  document.getElementById('clear-fields').addEventListener('click', () => {
    if (!confirm('Effacer tous les champs capturés ?')) return
    draft.fields = []; draft.specGroups = []; saveDraft(); render()
  })
  document.getElementById('cancel-capture').addEventListener('click', hideCaptureModal)
  document.getElementById('assign-custom').addEventListener('click', () => {
    const name = document.getElementById('custom-field').value.trim()
    if (name) assignField(name, false)
  })
  document.getElementById('export-json').addEventListener('click', exportJson)
  document.getElementById('import-json').addEventListener('click', () => document.getElementById('file-input').click())
  document.getElementById('file-input').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (f) importJson(f)
  })
  document.getElementById('tpl-name').addEventListener('input', (e) => { draft.name = e.target.value; saveDraft() })
  document.getElementById('tpl-domain').addEventListener('input', (e) => { draft.vendorDomain = e.target.value; saveDraft() })
}

// Nouvelle capture arrivée pendant que le popup est ouvert
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'pim-capture-buffered') {
    chrome.storage.session.get([BUFFER_KEY], (res) => {
      const buffer = res[BUFFER_KEY] || []
      if (buffer.length > 0) {
        showCaptureModal(buffer[buffer.length - 1])
        chrome.storage.session.remove(BUFFER_KEY)
      }
    })
  }
})

init()
