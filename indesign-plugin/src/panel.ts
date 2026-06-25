// indesign-plugin/src/panel.ts
import { PluginClient, type ColumnInfo, type DatasetSummary } from './lib/client'
import { slugifyTag } from './lib/slug'
import { applyTagToSelection, countTaggedByName, gotoFieldElement, untagField } from './idml/tagging'
import { fillPageWithRow, restoreAllPlaceholders } from './idml/preview'

const { app } = require('indesign') as { app: any }
const BASE_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/pluginApi'

let client: PluginClient | null = null
let docId = ''
let columns: ColumnInfo[] = []
let rowIndex = 0
let total = 0
let previewOn = false
let rowValues: Record<string, string> = {} // valeurs de la ligne courante, par nom de tag (écriture page)
let rowEntries: { label: string; value: string }[] = [] // toutes les colonnes (tableau d'aperçu)
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
  rowEntries = r.values.map((v) => ({ label: v.label, value: v.value }))
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
  // En mode Aperçu : tableau propre de l'enregistrement (au lieu de la liste de balisage).
  if (previewOn) { renderTable(); return }
  // app.activeDocument lève s'il n'y a aucun document → catch → doc null → « Champs posés » se vide.
  let doc: any = null
  try { doc = app.activeDocument } catch { /* aucun document ouvert */ }
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
  if (previewOn) await loadRowValues() // Aperçu = tableau panneau uniquement (ne touche PAS le document)
  else rowEntries = []
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

/** Nom de tag de l'élément balisé le PLUS PROFOND à l'endroit de la sélection (le vrai
 *  champ, pas le conteneur). À TOUTE ÉPREUVE : ne lève jamais, renvoie null si rien. */
function selectionTag(): string | null {
  try {
    const a = require('indesign')?.app
    const sel = a?.selection
    if (!sel || sel.length === 0) return null
    const obj = sel[0]

    // 1) Sélection texte → élément balisé le plus profond contenant le point d'insertion.
    const ip = obj?.insertionPoints?.item?.(0)
    const idx: number | undefined = ip?.index
    const storyId = ip?.parentStory?.id
    if (typeof idx === 'number' && storyId != null) {
      const doc = a?.activeDocument
      let best: any = null
      let bestLen = Infinity
      const consider = (el: any) => {
        try {
          const t = el.xmlContent
          const ps = t?.parentStory
          if (ps && ps.id === storyId && typeof t.index === 'number' && el.markupTag) {
            const start = t.index
            const len = t.characters?.length ?? 0
            if (idx >= start && idx <= start + len && len <= bestLen) { best = el; bestLen = len }
          }
        } catch { /* élément non textuel */ }
      }
      const walk = (el: any) => {
        consider(el)
        const n = el.xmlElements?.length ?? 0
        for (let i = 0; i < n; i++) walk(el.xmlElements.item(i))
      }
      const root = doc?.xmlElements?.item(0)
      if (root) walk(root)
      if (best?.markupTag) return String(best.markupTag.name)
    }

    // 2) Repli : cadre/objet balisé directement.
    const xe = obj?.associatedXMLElement
    if (xe && xe.isValid && xe.markupTag) return String(xe.markupTag.name)
  } catch { /* silencieux : Live ne doit jamais spammer d'erreur */ }
  return null
}

/** Mode Live : le panneau suit la sélection InDesign (surligne le champ + sa valeur).
 *  InDesign n'émet PAS d'event de changement de sélection → on poll (setInterval). */
function onSelectionChanged() {
  if (!liveOn) return
  const tag = selectionTag()
  if (tag === selectedTag) return // pas de changement → pas de re-render
  selectedTag = tag
  if (tag) {
    const col = columns.find((c) => slugifyTag(c.label) === tag)
    if (col) {
      const val = rowValues[tag]
      showStatus(previewOn && val !== undefined ? `${col.label} : ${val || '—'}` : `Sélection : ${col.label}`, true)
    } else {
      showStatus(`balise « ${tag} »`, true)
    }
  } else {
    showStatus('')
  }
  renderFields()
}

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('cancelConnect').addEventListener('click', cancelConnect)
let liveTimer: ReturnType<typeof setInterval> | null = null
byId('live').addEventListener('change', () => {
  liveOn = byId<HTMLInputElement>('live').checked
  if (liveOn) {
    selectedTag = null
    onSelectionChanged() // reflet immédiat de la sélection courante
    if (liveTimer === null) liveTimer = setInterval(onSelectionChanged, 400)
  } else {
    if (liveTimer !== null) { clearInterval(liveTimer); liveTimer = null }
    selectedTag = null
    showStatus('')
    renderFields() // retirer le surlignage
  }
})

/** Menu hamburger (préférences). Affichage inline (UXP gère mal position:absolute). */
function toggleMenu(force?: boolean) {
  const m = $('menu')
  const show = force ?? (m.style.display === 'none')
  m.style.display = show ? 'flex' : 'none'
}
byId('menuBtn').addEventListener('click', () => toggleMenu())
byId('miChangeToken').addEventListener('click', () => { toggleMenu(false); changeToken() })
byId('miRefresh').addEventListener('click', () => { toggleMenu(false); renderFields() })
byId('miFill').addEventListener('click', async () => {
  toggleMenu(false)
  if (!client) return
  let doc: any = null
  try { doc = app.activeDocument } catch { /* aucun document */ }
  if (!doc) { showStatus('Aucun document ouvert'); return }
  await loadRowValues()
  const r = fillPageWithRow(doc, rowValues)
  showStatus(`Rempli ${r.filled} champ(s) [${r.types}] — ligne ${rowIndex + 1}`, true)
})
byId('miRestore').addEventListener('click', () => {
  toggleMenu(false)
  let doc: any = null
  try { doc = app.activeDocument } catch { /* aucun document */ }
  if (!doc) { showStatus('Aucun document ouvert'); return }
  const n = restoreAllPlaceholders(doc)
  showStatus(`Restauré ${n} {{champ(s)}}`, true)
})

// À la fermeture/ouverture d'un document : rafraîchir la liste des balises (vidée
// s'il n'y a plus de document actif) SANS se déconnecter (le dataSet reste choisi).
function onDocChanged() {
  previewOn = false
  liveOn = false
  selectedTag = null
  rowValues = {}
  rowEntries = []
  byId<HTMLInputElement>('preview').checked = false
  byId<HTMLInputElement>('live').checked = false
  renderFields()
  renderRowLabel()
}

// InDesign n'émet pas d'event fiable de fermeture/changement de doc sous UXP → on
// surveille une signature (nb de docs + id de l'actif) et on vide à tout changement.
let lastDocSig = ''
function docSignature(): string {
  // app.activeDocument lève s'il n'y a aucun document → '0' (= fermé).
  try { return String(app.activeDocument?.id ?? '0') } catch { return '0' }
}
function watchDoc() {
  if (!client) return
  const sig = docSignature()
  if (sig === lastDocSig) return
  lastDocSig = sig
  onDocChanged()
}
setInterval(watchDoc, 700)
try {
  app.addEventListener('afterClose', onDocChanged)
  app.addEventListener('afterOpen', onDocChanged)
} catch { /* events indisponibles : le poll prend le relais */ }
