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

/** Affiche un message dans la ligne de statut (UXP ne supporte pas alert()). */
function showStatus(msg: string, ok = false) {
  const el = $('status')
  el.textContent = msg
  el.className = ok ? 'ok' : ''
}

async function connect() {
  const token = byId<HTMLInputElement>('token').value.trim()
  if (!token) { showStatus('Colle un token w2p_…'); return }
  const c = new PluginClient(BASE_URL, token)
  showStatus('Connexion…')
  try {
    const datasets = await c.listDatasets()
    client = c // on ne remplace la session qu'en cas de succès
    fillDatasets(datasets)
    $('connect').style.display = 'none'
    $('main').style.display = 'flex'
    showStatus('')
  } catch (e) {
    showStatus(`Connexion échouée : ${e instanceof Error ? e.message : e}`)
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

  // Décorer chaque champ de son nombre d'occurrences, posés en haut puis tri alphabétique.
  const decorated = columns.map((c) => ({ c, n: counts[slugifyTag(c.label)] ?? 0 }))
  decorated.sort((a, b) => {
    const ta = a.n > 0 ? 0 : 1
    const tb = b.n > 0 ? 0 : 1
    return ta - tb || a.c.label.localeCompare(b.c.label, 'fr', { sensitivity: 'base' })
  })

  const addSectionLabel = (text: string) => {
    const li = document.createElement('li')
    li.className = 'section-label'
    li.textContent = text
    ul.appendChild(li)
  }

  let taggedHeaderDone = false
  let availHeaderDone = false
  for (const { c, n } of decorated) {
    if (n > 0 && !taggedHeaderDone) { addSectionLabel('Champs posés'); taggedHeaderDone = true }
    if (n === 0 && !availHeaderDone) { addSectionLabel('Disponibles'); availHeaderDone = true }

    const li = document.createElement('li')
    li.className = n > 0 ? 'field tagged' : 'field'

    const left = document.createElement('span')
    left.className = 'left'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = c.label
    left.appendChild(name)
    const type = document.createElement('span')
    type.className = 'type'
    type.textContent = c.fieldType
    left.appendChild(type)
    li.appendChild(left)

    const right = document.createElement('span')
    if (n > 0) {
      right.className = 'badge'
      right.textContent = `✓${n > 1 ? ` ×${n}` : ''}`
    } else {
      right.className = 'add'
      right.textContent = '+ poser'
    }
    li.appendChild(right)

    li.onclick = () => {
      const res = applyTagToSelection(c.label)
      showStatus(res.ok ? `« ${c.label} » posé` : (res.message ?? 'Échec'), res.ok)
      renderFields()
    }
    ul.appendChild(li)
  }
}

function renderRowLabel() {
  $('rowLabel').textContent = `${total === 0 ? 0 : rowIndex + 1} / ${total}`
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
  renderRowLabel()
  refreshPreview()
}

/** Paramètres : revenir à la saisie pour changer de token. La session courante est
 *  conservée tant qu'on n'a pas reconnecté → « Annuler » permet d'y revenir. */
function changeToken() {
  byId<HTMLInputElement>('token').value = ''
  $('main').style.display = 'none'
  $('connect').style.display = 'flex'
  byId('cancelConnect').style.display = client ? 'block' : 'none'
  showStatus('Colle un nouveau token, puis Connecter.')
}

/** Annuler le changement de token : revenir à la session active. */
function cancelConnect() {
  if (!client) return
  $('connect').style.display = 'none'
  $('main').style.display = 'flex'
  showStatus('')
}

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('cancelConnect').addEventListener('click', cancelConnect)

/** Menu hamburger (préférences). Affichage inline (UXP gère mal position:absolute). */
function toggleMenu(force?: boolean) {
  const m = $('menu')
  const show = force ?? (m.style.display === 'none')
  m.style.display = show ? 'flex' : 'none'
}
byId('menuBtn').addEventListener('click', () => toggleMenu())
byId('miChangeToken').addEventListener('click', () => { toggleMenu(false); changeToken() })
byId('miRefresh').addEventListener('click', () => { toggleMenu(false); renderFields() })
byId('miRestore').addEventListener('click', () => {
  toggleMenu(false)
  const doc = app.activeDocument
  if (doc) { restoreAllPlaceholders(doc); showStatus('Placeholders {{…}} restaurés', true) }
})
byId('restoreAll').addEventListener('click', () => {
  const doc = app.activeDocument
  if (doc) { restoreAllPlaceholders(doc); showStatus('Placeholders {{…}} restaurés', true) }
})
