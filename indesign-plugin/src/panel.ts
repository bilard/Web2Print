// indesign-plugin/src/panel.ts
import { PluginClient, type ColumnInfo, type DatasetSummary } from './lib/client'
import { slugifyTag } from './lib/slug'
import { applyTagToSelection, countTaggedByName } from './idml/tagging'
import { applyRowPreview, restorePreview, restoreAllPlaceholders } from './idml/preview'

const { app } = require('indesign') as { app: any }
const BASE_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/pluginApi'

let client: PluginClient | null = null
let docId = ''
let columns: ColumnInfo[] = []
let rowIndex = 0
let total = 0

const $ = (id: string) => document.getElementById(id) as HTMLElement
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function connect() {
  const token = byId<HTMLInputElement>('token').value.trim()
  if (!token) return
  client = new PluginClient(BASE_URL, token)
  try {
    const datasets = await client.listDatasets()
    fillDatasets(datasets)
    $('connect').style.display = 'none'
    $('main').style.display = 'block'
  } catch (e) {
    alert(`Connexion échouée : ${e instanceof Error ? e.message : e}`)
  }
}

function fillDatasets(datasets: DatasetSummary[]) {
  const sel = byId<HTMLSelectElement>('dataset')
  sel.innerHTML = ''
  for (const d of datasets) {
    const opt = document.createElement('option')
    opt.value = d.docId; opt.textContent = `${d.fileName} (${d.rowCount})`
    sel.appendChild(opt)
  }
  if (datasets[0]) { sel.value = datasets[0].docId; onDatasetChange() }
}

async function onDatasetChange() {
  if (!client) return
  docId = byId<HTMLSelectElement>('dataset').value
  columns = await client.columns(docId)
  rowIndex = 0
  const r = await client.row(docId, 0)
  total = r.total
  renderFields()
  renderRowLabel()
}

function renderFields() {
  const doc = app.activeDocument
  const counts = doc ? countTaggedByName(doc) : {}
  const ul = $('fields'); ul.innerHTML = ''
  for (const c of columns) {
    const tagName = slugifyTag(c.label)
    const li = document.createElement('li')
    const n = counts[tagName] ?? 0
    const badge = n > 0 ? ` ✓${n > 1 ? `×${n}` : ''}` : ''
    const btn = document.createElement('button')
    btn.textContent = `${c.label}${badge}`
    btn.onclick = () => {
      const res = applyTagToSelection(c.label)
      if (!res.ok) alert(res.message)
      renderFields()
    }
    li.appendChild(btn)
    ul.appendChild(li)
  }
}

function renderRowLabel() {
  $('rowLabel').textContent = `${total === 0 ? 0 : rowIndex + 1}/${total}`
}

async function refreshPreview() {
  if (!client) return
  const doc = app.activeDocument
  if (!doc) return
  if (!byId<HTMLInputElement>('preview').checked) { restorePreview(doc); return }
  const r = await client.row(docId, rowIndex)
  rowIndex = r.rowIndex; total = r.total
  const valuesByTag: Record<string, string> = {}
  for (const v of r.values) valuesByTag[slugifyTag(v.label)] = v.value
  applyRowPreview(doc, valuesByTag)
  renderRowLabel()
}

function step(delta: number) {
  if (total === 0) return
  rowIndex = Math.max(0, Math.min(rowIndex + delta, total - 1))
  refreshPreview()
}

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('restoreAll').addEventListener('click', () => {
  const doc = app.activeDocument
  if (doc) restoreAllPlaceholders(doc)
})
