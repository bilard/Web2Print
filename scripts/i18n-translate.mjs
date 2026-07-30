// Génère un CATALOGUE COMPILÉ de traductions (`src/lib/i18n/<locale>.ts`) à
// partir du catalogue FR, via Gemini.
//
//   node scripts/i18n-translate.mjs es
//   node scripts/i18n-translate.mjs de --batch 25 --concurrency 4
//
// Principes :
//   - Le FR est la source, l'EN sert d'APPUI : deux formulations lèvent les
//     ambiguïtés d'un libellé de deux mots (« Support » = assistance ou socle ?).
//   - Les clés partent dans l'ORDRE du catalogue : les clés voisines
//     appartiennent au même écran, le lot porte donc son propre contexte.
//   - Les jetons `{param}` sont vérifiés après coup (cf. `translateLabels.ts`).
//     Un lot qui en perd un est redécoupé pour isoler la clé fautive, et la clé
//     irrécupérable est LISTÉE en fin de run — jamais remplacée en silence par
//     du français, sinon on livre un catalogue à moitié traduit sans signal.
//   - Le cache disque rend le run reprenable : une interruption ne repaie pas
//     les lots déjà traduits.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'i18n-translate')

// — Arguments ————————————————————————————————————————————————————————
const argv = process.argv.slice(2)
const locale = argv.find((a) => !a.startsWith('--'))
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(argv[i + 1])
}
const BATCH = flag('batch', 30)
const CONCURRENCY = flag('concurrency', 5)
const LIMIT = flag('limit', Infinity)
const FRESH = argv.includes('--fresh')

/** Consignes propres à chaque langue cible — registre, orthographe, faux amis. */
const TARGETS = {
  es: {
    name: 'espagnol (Espagne, es-ES)',
    rules: [
      "Registre : espagnol d'ESPAGNE, professionnel et neutre. Vouvoiement implicite —",
      "on ne s'adresse jamais à l'utilisateur en « tú ».",
      "Boutons et actions à l'INFINITIF (« Guardar », « Exportar », « Añadir »),",
      'jamais à l\'impératif (« Guarda »), comme dans les logiciels Adobe espagnols.',
      'Vocabulaire métier de l\'édition et de l\'impression : « maquetación » (mise en page),',
      '« sangrado » (fond perdu), « marcas de corte » (traits de coupe), « tipografía »,',
      '« plantilla » (gabarit), « fusión de datos » (publipostage), « capa » (calque),',
      '« lienzo » (canevas), « cuadro de texto » (bloc de texte), « ficha de producto ».',
      'Accents et « ñ » obligatoires. Ouvrir les questions et exclamations par « ¿ » / « ¡ ».',
    ],
  },
  de: {
    name: 'allemand (Allemagne, de-DE)',
    rules: [
      'Registre : allemand professionnel, adresse à la 2e personne de politesse (« Sie »).',
      'Boutons à l\'INFINITIF (« Speichern », « Exportieren »).',
      'Substantifs toujours capitalisés. « ß » et trémas obligatoires.',
      'Vocabulaire de la PAO : « Anschnitt » (fond perdu), « Schnittmarken », « Ebene » (calque),',
      '« Vorlage » (gabarit), « Textrahmen », « Serienbrief » (publipostage).',
    ],
  },
  it: {
    name: 'italien (Italie, it-IT)',
    rules: [
      "Registre : italien professionnel, adresse de politesse implicite (jamais « tu »).",
      'Boutons à l\'INFINITIF (« Salva » est toléré mais préférer « Salvare » seulement si',
      "le catalogue le fait déjà ; sinon suivre l'usage Adobe italien : « Salva », « Esporta »).",
      'Vocabulaire della stampa : « abbondanza » (fond perdu), « segni di taglio »,',
      '« livello » (calque), « modello » (gabarit), « casella di testo », « stampa unione ».',
    ],
  },
}

if (!locale || !TARGETS[locale]) {
  console.error(`Usage : node scripts/i18n-translate.mjs <${Object.keys(TARGETS).join('|')}> [--batch N] [--concurrency N] [--limit N] [--fresh]`)
  process.exit(1)
}

// — Clé d'API ————————————————————————————————————————————————————————
function readEnvKey() {
  if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY
  for (const file of ['.env.local', '.env']) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue
    const line = readFileSync(path, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('VITE_GEMINI_API_KEY='))
    if (line) return line.slice('VITE_GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const API_KEY = readEnvKey()
if (!API_KEY) {
  console.error('VITE_GEMINI_API_KEY introuvable (.env.local).')
  process.exit(1)
}

// `gemini-3.1-pro-preview` et NON 3.5-flash : le JSON structuré de 3.5 échoue une
// fois sur deux (cf. commentaires de `llmRouter.ts`). `thinkingLevel: LOW` parce
// que le raisonnement dynamique de Gemini 3.x consomme `maxOutputTokens` et
// tronque la réponse au milieu d'un lot.
const MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// — Catalogues source ————————————————————————————————————————————————
const { fr } = await import(pathToFileURL(join(ROOT, 'src/lib/i18n/fr.ts')).href)
const { en } = await import(pathToFileURL(join(ROOT, 'src/lib/i18n/en.ts')).href)
const KEYS = Object.keys(fr)

/** Jetons `{param}` d'un gabarit, triés — doivent survivre à la traduction. */
const placeholders = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',')

/**
 * Nombre de sauts de ligne — significatif dans 10 libellés du catalogue
 * (placeholders de zone de saisie). Un modèle qui aplatit la mise en forme
 * produit un texte juste mais un champ illisible.
 */
const newlines = (s) => (s.match(/\n/g) ?? []).length

// — Cache de reprise ——————————————————————————————————————————————————
mkdirSync(CACHE_DIR, { recursive: true })
const CACHE_FILE = join(CACHE_DIR, `${locale}.json`)
/** @type {Record<string, string>} */
let done = !FRESH && existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {}
const persist = () => writeFileSync(CACHE_FILE, JSON.stringify(done, null, 0))

// — Appel modèle ——————————————————————————————————————————————————————
const SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, text: { type: 'string' } },
        required: ['key', 'text'],
      },
    },
  },
  required: ['translations'],
}

const target = TARGETS[locale]

function buildPrompt(keys) {
  const entries = keys
    .map((k) => `${k}\n  FR: ${fr[k]}\n  EN: ${en[k]}`)
    .join('\n')
  return [
    `Tu traduis les libellés d'INTERFACE d'un logiciel professionnel de production graphique (éditeur type Canva/InDesign en ligne, base produit, imports/exports print, workflows IA).`,
    '',
    `Langue cible : ${target.name}.`,
    '',
    'Chaque entrée donne son IDENTIFIANT technique, puis la version française (source)',
    "et la version anglaise (appui pour lever les ambiguïtés). L'identifiant indique",
    "l'écran : `pim.column.volume` parle d'une colonne de base produit, pas de volume sonore.",
    '',
    'Règles impératives :',
    ...target.rules.map((r, i) => (i === 0 ? `1. ${r}` : `   ${r}`)),
    "2. Garde la LONGUEUR d'un libellé d'interface : pas de phrase explicative ajoutée,",
    "   pas de ponctuation finale si la source n'en a pas.",
    '3. Respecte la casse et le registre grammatical de la source (nom, infinitif, question).',
    '4. Les jetons entre accolades — {count}, {name}, {n}… — sont des VARIABLES :',
    '   recopie-les EXACTEMENT, sans les traduire ni les renommer. Ils peuvent changer',
    "   de place dans la phrase. N'en invente aucun qui ne soit pas dans la source.",
    '5. Ne traduis PAS les noms propres ni les formats : PDF, IDML, SVG, PPTX, XLSX, CSV,',
    '   InDesign, Illustrator, Excel, Google Drive, Gmail, Telegram, Firestore, EasyCatalog,',
    '   PIM, DAM, API, URL, EAN, SKU, RGB, CMJN → « CMYK », DPI, IA → traduis en langue cible.',
    "6. Le glyphe « · », les flèches et les émojis de la source se recopient à l'identique.",
    '7. Les SAUTS DE LIGNE de la source sont significatifs (placeholders sur plusieurs',
    "   lignes, infobulles à puces) : garde-en le même nombre, au même endroit.",
    '',
    'Rends une entrée par identifiant demandé, avec son identifiant EXACT.',
    '',
    'Libellés à traduire :',
    entries,
  ].join('\n')
}

async function callGemini(keys, attempt = 1) {
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(keys) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    // 429/5xx : la fenêtre de quota se libère, on retente en reculant.
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return callGemini(keys, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  if (!text.trim()) throw new Error('réponse vide')
  return JSON.parse(text).translations ?? []
}

/**
 * Traduit un lot et ne retient que les entrées SAINES.
 * Un lot incomplet ou dont une variable a bougé est redécoupé en deux : le
 * problème est isolé sur une clé au lieu de condamner trente libellés.
 */
async function translateBatch(keys, depth = 0) {
  const rejected = []
  let out = []
  try {
    const list = await callGemini(keys)
    const byKey = new Map(list.map((e) => [e.key, e.text]))
    for (const key of keys) {
      const value = (byKey.get(key) ?? '').trim()
      if (
        value === '' ||
        placeholders(value) !== placeholders(fr[key]) ||
        newlines(value) !== newlines(fr[key])
      ) {
        rejected.push(key)
        continue
      }
      out.push([key, value])
    }
  } catch (err) {
    console.warn(`  lot de ${keys.length} en échec : ${err.message}`)
    rejected.push(...keys)
    out = []
  }
  if (rejected.length > 0 && keys.length > 1 && depth < 4) {
    const half = Math.ceil(rejected.length / 2)
    const retried = [
      ...(await translateBatch(rejected.slice(0, half), depth + 1)),
      ...(await translateBatch(rejected.slice(half), depth + 1)),
    ]
    return [...out, ...retried]
  }
  if (rejected.length > 0 && depth >= 4) {
    for (const key of rejected) console.warn(`  ✗ abandon : ${key}`)
  }
  return out
}

// — Run ————————————————————————————————————————————————————————————————
const todo = KEYS.filter((k) => done[k] === undefined).slice(0, LIMIT)
console.info(
  `${locale} : ${KEYS.length} clés, ${KEYS.length - todo.length} déjà en cache, ${todo.length} à traduire.`,
)

const batches = []
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))

let finished = 0
let cursor = 0
async function worker() {
  while (cursor < batches.length) {
    const batch = batches[cursor++]
    const pairs = await translateBatch(batch)
    for (const [k, v] of pairs) done[k] = v
    persist()
    finished += 1
    const pct = Math.round((finished / batches.length) * 100)
    console.info(`  ${String(pct).padStart(3)} % — ${finished}/${batches.length} lots`)
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))

// — Écriture du catalogue ————————————————————————————————————————————
/**
 * Commentaires de section de `fr.ts`, rattachés à la clé qu'ils précèdent.
 * Ils repèrent les écrans dans un fichier de 4 500 lignes ; les perdre rendrait
 * le catalogue cible illisible et le diff FR↔cible impossible à suivre.
 */
function sectionComments() {
  const map = new Map()
  let pending = []
  for (const line of readFileSync(join(ROOT, 'src/lib/i18n/fr.ts'), 'utf8').split('\n')) {
    const comment = line.match(/^\s*\/\/(.*)$/)
    if (comment) {
      pending.push(`  //${comment[1]}`)
      continue
    }
    const key = line.match(/^\s*'([^']+)':/)
    if (key) {
      if (pending.length > 0) map.set(key[1], pending)
      pending = []
      continue
    }
    if (line.trim() === '') pending = []
  }
  return map
}

/**
 * Littéral TS d'une chaîne, en suivant le style de `fr.ts` (quotes simples).
 *
 * ⚠️ Les sauts de ligne DOIVENT être échappés : plusieurs libellés du catalogue
 * en contiennent (placeholders de zone de saisie sur deux lignes). Écrits tels
 * quels, ils coupent le littéral en deux et le fichier ne compile plus.
 */
function tsString(value) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  if (!escaped.includes("'")) return `'${escaped}'`
  if (!escaped.includes('"')) return `"${escaped}"`
  return `'${escaped.replace(/'/g, "\\'")}'`
}

const comments = sectionComments()
const missing = KEYS.filter((k) => done[k] === undefined)

const header = `import type { TranslationKey } from './fr'

/**
 * Catalogue ${target.name.toUpperCase()}.
 *
 * Généré par \`node scripts/i18n-translate.mjs ${locale}\` depuis le catalogue FR
 * (l'EN sert d'appui au modèle), puis relu à l'écran. Les corrections se font
 * DIRECTEMENT ici : le script ne réécrit que les clés absentes de son cache.
 *
 * Le type \`Record<TranslationKey, string>\` garantit qu'aucune clé FR ne peut
 * rester sans traduction : un oubli casse \`tsc -b\` au lieu de vider l'écran.
 * Les commentaires de section sont ceux de \`fr.ts\` — ils repèrent les écrans.
 */
export const ${locale}: Record<TranslationKey, string> = {
`

const body = KEYS.map((key) => {
  const lines = comments.get(key) ?? []
  const value = done[key] ?? fr[key]
  return [...lines, `  '${key}': ${tsString(value)},`].join('\n')
}).join('\n')

writeFileSync(join(ROOT, `src/lib/i18n/${locale}.ts`), `${header}${body}\n}\n`)

console.info(`\n→ src/lib/i18n/${locale}.ts écrit (${KEYS.length} clés).`)
if (missing.length > 0) {
  console.warn(`⚠ ${missing.length} clés NON traduites, laissées en français :`)
  for (const key of missing) console.warn(`   ${key}`)
  console.warn('Relancer le script pour les reprendre (le cache garde le reste).')
}
