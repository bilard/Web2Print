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
let previewOn = false
let rowEntries: { label: string; value: string }[] = [] // toutes les colonnes (tableau d'aperçu)
let selectedTag: string | null = null // tag de l'élément sélectionné dans InDesign

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
  client = new PluginClient(BASE_URL, token)
  console.log('[W2P] connect: début, token len', token.length)
  showStatus('Connexion… (1/4 requête)')
  try {
    const datasets = await client.listDatasets()
    console.log('[W2P] connect: datasets reçus', datasets.length)
    showStatus(`Connexion… (2/4 ${datasets.length} dataset(s))`)
    fillDatasets(datasets)
    console.log('[W2P] connect: fillDatasets OK')
    showStatus('Connexion… (3/4 affichage)')
    $('connect').style.display = 'none'
    $('main').style.display = 'flex'
    showStatus('Connecté ✓ (4/4)', true)
  } catch (e) {
    console.log('[W2P] connect ERREUR', String(e))
    showStatus(`Échec : ${e instanceof Error ? e.message : e}`)
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

/** Tableau d'aperçu : toutes les colonnes de l'enregistrement courant (libellé | valeur). */
function renderTable() {
  const ul = $('fields'); ul.innerHTML = ''
  if (rowEntries.length === 0) {
    const empty = document.createElement('li'); empty.className = 'section-label'; empty.textContent = 'Aucune donnée'
    ul.appendChild(empty); return
  }
  rowEntries.forEach((e, i) => {
    const row = document.createElement('li')
    row.className = `rec-row ${i % 2 ? 'odd' : 'even'}`
    const lbl = document.createElement('span'); lbl.className = 'rec-label'; lbl.textContent = e.label
    const val = document.createElement('span'); val.className = 'rec-value'; val.textContent = e.value !== '' ? e.value : '—'
    row.appendChild(lbl); row.appendChild(val)
    ul.appendChild(row)
  })
}

function renderFields() {
  if (previewOn) { renderTable(); return } // mode Aperçu = tableau de l'enregistrement
  let doc: any = null
  try { doc = app.activeDocument } catch { /* aucun document ouvert */ }
  const counts = doc ? countTaggedByName(doc) : {}
  const ul = $('fields'); ul.innerHTML = ''
  let selectedLi: HTMLElement | null = null

  // Décorer chaque champ de son nombre d'occurrences, puis remonter les posés.
  const decorated = columns.map((c, i) => ({ c, i, n: counts[slugifyTag(c.label)] ?? 0 }))
  decorated.sort((a, b) => {
    const ta = a.n > 0 ? 0 : 1
    const tb = b.n > 0 ? 0 : 1
    return ta - tb || a.i - b.i // posés d'abord, sinon ordre d'origine
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

    const isSel = selectedTag !== null && slugifyTag(c.label) === selectedTag
    const li = document.createElement('li')
    li.className = `field${n > 0 ? ' tagged' : ''}${isSel ? ' selected' : ''}`
    if (isSel) selectedLi = li

    const leftBox = document.createElement('span')
    leftBox.className = 'left'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = c.label
    leftBox.appendChild(name)
    const type = document.createElement('span')
    type.className = 'type'
    type.textContent = c.fieldType
    leftBox.appendChild(type)
    li.appendChild(leftBox)

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
  if (selectedLi) { try { (selectedLi as HTMLElement).scrollIntoView() } catch { /* */ } }
}

function renderRowLabel() {
  $('rowLabel').textContent = `${total === 0 ? 0 : rowIndex + 1} / ${total}`
}

async function refreshPreview() {
  if (!client) return
  previewOn = byId<HTMLInputElement>('preview').checked
  // Aperçu = TABLEAU dans le panneau uniquement. On NE TOUCHE PLUS au document
  // (l'écriture in-page abîmait la mise en page).
  if (previewOn) {
    const r = await client.row(docId, rowIndex)
    rowIndex = r.rowIndex; total = r.total
    rowEntries = r.values.map((v) => ({ label: v.label, value: v.value }))
  } else {
    rowEntries = []
  }
  renderRowLabel()
  renderFields()
}

function step(delta: number) {
  if (total === 0) return
  rowIndex = Math.max(0, Math.min(rowIndex + delta, total - 1))
  renderRowLabel()
  refreshPreview()
}

/** Tag de l'élément balisé le plus profond sous la sélection InDesign (ne lève jamais). */
function selectionTag(): string | null {
  try {
    const a = require('indesign')?.app
    const sel = a?.selection
    if (!sel || sel.length === 0) return null
    const obj = sel[0]
    const ip = obj?.insertionPoints?.item?.(0)
    const idx: number | undefined = ip?.index
    const storyId = ip?.parentStory?.id
    if (typeof idx === 'number' && storyId != null) {
      let best: any = null
      let bestLen = Infinity
      const consider = (el: any) => {
        try {
          const t = el.xmlContent
          if (t?.parentStory?.id === storyId && typeof t.index === 'number' && el.markupTag) {
            const len = t.characters?.length ?? 0
            if (idx >= t.index && idx <= t.index + len && len <= bestLen) { best = el; bestLen = len }
          }
        } catch { /* */ }
      }
      const walk = (el: any) => { consider(el); const n = el.xmlElements?.length ?? 0; for (let i = 0; i < n; i++) walk(el.xmlElements.item(i)) }
      const root = a?.activeDocument?.xmlElements?.item(0)
      if (root) walk(root)
      if (best?.markupTag) return String(best.markupTag.name)
    }
    const xe = obj?.associatedXMLElement
    if (xe && xe.isValid && xe.markupTag) return String(xe.markupTag.name)
  } catch { /* silencieux */ }
  return null
}

// InDesign n'émet pas d'event de sélection ni de modif de balises → on poll, et on ne
// re-rend QUE si la sélection OU l'ensemble des balises a changé (détecte aussi les
// suppressions/ajouts de balises faits hors du plugin, ex. dans le panneau Structure).
let lastCountsSig = ''
function checkSelection() {
  if (!client || previewOn) return
  let needRender = false
  const tag = selectionTag()
  if (tag !== selectedTag) { selectedTag = tag; needRender = true }
  let doc: any = null
  try { doc = app.activeDocument } catch { /* aucun document */ }
  const sig = doc ? JSON.stringify(countTaggedByName(doc)) : ''
  if (sig !== lastCountsSig) { lastCountsSig = sig; needRender = true }
  if (needRender) renderFields()
}
setInterval(checkSelection, 500)

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('restoreAll').addEventListener('click', () => {
  const doc = app.activeDocument
  if (doc) { restoreAllPlaceholders(doc); showStatus('Placeholders {{…}} restaurés', true) }
})
