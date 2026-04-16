// Service worker : détient le draft de template et expose des actions
// (assign-field, remove-field, clear, export, set-meta) aux content scripts.

const TEMPLATE_KEY = 'pim_draft_template'

function emptyDraft(host) {
  return {
    id: crypto.randomUUID(),
    name: 'Template ' + host,
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

async function getDraft(fallbackHost) {
  const res = await chrome.storage.local.get([TEMPLATE_KEY])
  if (res[TEMPLATE_KEY]) return res[TEMPLATE_KEY]
  const d = emptyDraft(fallbackHost || 'unknown')
  await chrome.storage.local.set({ [TEMPLATE_KEY]: d })
  return d
}

async function setDraft(d) {
  d.updatedAt = Date.now()
  await chrome.storage.local.set({ [TEMPLATE_KEY]: d })
}

function triggerDownload(draft) {
  const json = JSON.stringify(draft, null, 2)
  const fname = (draft.vendorDomain || 'template') + '.template.json'
  chrome.downloads.download({
    url: 'data:application/json;charset=utf-8,' + encodeURIComponent(json),
    filename: fname,
    saveAs: true,
  }).catch(() => {
    // downloads permission peut manquer — fallback via dataURL dans un onglet
    chrome.tabs.create({ url: 'data:application/json;charset=utf-8,' + encodeURIComponent(json) })
  })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const host = sender.tab ? new URL(sender.tab.url).hostname.replace(/^www\./, '') : 'unknown'

  if (msg.type === 'pim-get-draft') {
    getDraft(host).then((d) => sendResponse({ draft: d }))
    return true
  }
  if (msg.type === 'pim-assign-field') {
    getDraft(host).then(async (d) => {
      // Si domaine change, proposer reset serait plus cool mais on laisse.
      if (!d.vendorDomain || d.vendorDomain === 'unknown') d.vendorDomain = host
      const newField = {
        field: msg.field,
        strategies: msg.strategies,
        multiple: msg.multiple,
        transform: msg.transform,
      }
      const existing = d.fields.findIndex((f) => f.field === msg.field)
      if (existing >= 0) d.fields[existing] = newField
      else d.fields.push(newField)
      await setDraft(d)
      sendResponse({ ok: true, draft: d })
    })
    return true
  }
  if (msg.type === 'pim-remove-field') {
    getDraft(host).then(async (d) => {
      d.fields.splice(msg.index, 1)
      await setDraft(d)
      sendResponse({ ok: true, draft: d })
    })
    return true
  }
  if (msg.type === 'pim-clear-fields') {
    getDraft(host).then(async (d) => {
      d.fields = []; d.specGroups = []
      await setDraft(d)
      sendResponse({ ok: true, draft: d })
    })
    return true
  }
  if (msg.type === 'pim-set-meta') {
    getDraft(host).then(async (d) => {
      if (typeof msg.name === 'string') d.name = msg.name
      if (typeof msg.vendorDomain === 'string') d.vendorDomain = msg.vendorDomain
      if (typeof msg.urlPattern === 'string') d.urlPattern = msg.urlPattern
      await setDraft(d)
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'pim-reset-draft') {
    const d = emptyDraft(host)
    setDraft(d).then(() => sendResponse({ ok: true, draft: d }))
    return true
  }
  if (msg.type === 'pim-export') {
    getDraft(host).then((d) => { triggerDownload(d); sendResponse({ ok: true }) })
    return true
  }
  if (msg.type === 'pim-mode-changed') {
    sendResponse({ ok: true })
  }
})
