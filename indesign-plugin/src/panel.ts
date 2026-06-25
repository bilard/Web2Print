// indesign-plugin/src/panel.ts
import { PluginClient, type ColumnInfo, type DatasetSummary } from './lib/client'
import { slugifyTag } from './lib/slug'
import { applyTagToSelection, countTaggedByName, gotoFieldElement, untagField } from './idml/tagging'

const { app } = require('indesign') as { app: any }
const BASE_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/pluginApi'

let client: PluginClient | null = null
let docId = ''
let columns: ColumnInfo[] = []
let rowIndex = 0
let total = 0
let previewOn = false
let rowValues: Record<string, string> = {} // valeurs de la ligne courante, par nom de tag (aperçu panneau)
let liveOn = false
let selectedTag: string | null = null // nom de tag de l'élément sélectionné dans InDesign (mode Live)

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
  if (previewOn) await loadRowValues()
  renderFields()
  renderRowLabel()
}

/** Charge les valeurs de la ligne courante pour l'aperçu PANNEAU (aucune écriture doc). */
async function loadRowValues() {
  if (!client) return
  const r = await client.row(docId, rowIndex)
  rowIndex = r.rowIndex; total = r.total
  rowValues = {}
  for (const v of r.values) rowValues[slugifyTag(v.label)] = v.value
}

function renderFields() {
  const doc = app.activeDocument
  const counts = doc ? countTaggedByName(doc) : {}
  const ul = $('fields'); ul.innerHTML = ''
  let selectedLi: HTMLElement | null = null

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

    const isSel = selectedTag !== null && slugifyTag(c.label) === selectedTag
    const li = document.createElement('li')
    li.className = `field${n > 0 ? ' tagged' : ''}${isSel ? ' selected' : ''}`
    if (isSel) selectedLi = li

    const head = document.createElement('div')
    head.className = 'field-head'

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
    head.appendChild(left)

    const right = document.createElement('span')
    right.className = 'actions'
    if (n > 0) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = `✓${n > 1 ? ` ×${n}` : ''}`
      right.appendChild(badge)

      const goto = document.createElement('button')
      goto.className = 'act'
      goto.textContent = '◎'
      goto.title = "Atteindre l'élément"
      goto.onclick = (ev: Event) => {
        ev.stopPropagation()
        const r = gotoFieldElement(c.label)
        if (!r.ok) showStatus(r.message ?? 'Échec', false)
      }
      right.appendChild(goto)

      const untag = document.createElement('button')
      untag.className = 'act'
      untag.textContent = '⊘'
      untag.title = "Annuler la balise de l'élément"
      untag.onclick = (ev: Event) => {
        ev.stopPropagation()
        const r = untagField(c.label)
        showStatus(r.ok ? `Balise retirée (${r.count})` : (r.message ?? 'Échec'), r.ok)
        renderFields()
      }
      right.appendChild(untag)
    } else {
      const add = document.createElement('span')
      add.className = 'add'
      add.textContent = '+ poser'
      right.appendChild(add)
    }
    head.appendChild(right)
    li.appendChild(head)

    // Aperçu PANNEAU : afficher la valeur de la ligne sous le champ (sans toucher au doc).
    if (previewOn) {
      const val = rowValues[slugifyTag(c.label)]
      const v = document.createElement('div')
      v.className = 'value'
      v.textContent = val !== undefined && val !== '' ? val : '—'
      li.appendChild(v)
    }

    // Clic sur la ligne = poser le tag sur la sélection courante.
    li.onclick = () => {
      const res = applyTagToSelection(c.label)
      showStatus(res.ok ? `« ${c.label} » posé` : (res.message ?? 'Échec'), res.ok)
      renderFields()
    }
    ul.appendChild(li)
  }
  if (selectedLi) { try { (selectedLi as HTMLElement).scrollIntoView() } catch { /* no-op */ } }
}

function renderRowLabel() {
  $('rowLabel').textContent = `${total === 0 ? 0 : rowIndex + 1} / ${total}`
}

async function refreshPreview() {
  if (!client) return
  previewOn = byId<HTMLInputElement>('preview').checked
  if (previewOn) await loadRowValues()
  else rowValues = {}
  renderRowLabel()
  renderFields()
}

async function step(delta: number) {
  if (total === 0) return
  rowIndex = Math.max(0, Math.min(rowIndex + delta, total - 1))
  if (previewOn) await loadRowValues()
  renderRowLabel()
  renderFields()
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

/** Nom de tag de l'élément XML associé à la sélection InDesign courante (mode Live). */
function currentSelectionTag(): string | null {
  try {
    const sel = app.selection
    if (!sel || sel.length === 0) return null
    const obj = sel[0]
    let xe = obj?.associatedXMLElement
    if ((!xe || !xe.isValid) && obj?.parent?.associatedXMLElement) xe = obj.parent.associatedXMLElement
    if (xe && xe.isValid && xe.markupTag) return xe.markupTag.name as string
  } catch { /* sélection non balisée */ }
  return null
}

/** Mode Live : le panneau suit la sélection InDesign (surligne le champ + sa valeur). */
function onSelectionChanged() {
  if (!liveOn) return
  selectedTag = currentSelectionTag()
  if (selectedTag) {
    const col = columns.find((c) => slugifyTag(c.label) === selectedTag)
    if (col) {
      const val = previewOn ? rowValues[selectedTag] : undefined
      showStatus(val !== undefined ? `${col.label} : ${val || '—'}` : `Sélection : ${col.label}`, true)
    }
  }
  renderFields()
}

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('cancelConnect').addEventListener('click', cancelConnect)
byId('live').addEventListener('change', () => {
  liveOn = byId<HTMLInputElement>('live').checked
  if (!liveOn) { selectedTag = null; showStatus('') }
  onSelectionChanged()
  if (!liveOn) renderFields() // re-render pour retirer le surlignage
})
try { app.addEventListener('afterSelectionChanged', onSelectionChanged) } catch { /* event indisponible */ }

/** Menu hamburger (préférences). Affichage inline (UXP gère mal position:absolute). */
function toggleMenu(force?: boolean) {
  const m = $('menu')
  const show = force ?? (m.style.display === 'none')
  m.style.display = show ? 'flex' : 'none'
}
byId('menuBtn').addEventListener('click', () => toggleMenu())
byId('miChangeToken').addEventListener('click', () => { toggleMenu(false); changeToken() })
byId('miRefresh').addEventListener('click', () => { toggleMenu(false); renderFields() })

// À la fermeture/ouverture d'un document : rafraîchir la liste des balises (vidée
// s'il n'y a plus de document actif) SANS se déconnecter (le dataSet reste choisi).
function onDocChanged() {
  previewOn = false
  rowValues = {}
  byId<HTMLInputElement>('preview').checked = false
  renderFields()
  renderRowLabel()
}
try {
  app.addEventListener('afterClose', onDocChanged)
  app.addEventListener('afterOpen', onDocChanged)
} catch { /* events indisponibles : ignorer */ }
