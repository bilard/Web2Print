// Traduit les CORPS markdown de l'aide intégrée vers une langue cible.
//
//   node scripts/help-bodies-translate.mjs es
//
// Pendant de `i18n-translate.mjs`, mais pour l'aide : les libellés d'aide
// (titres, intros) viennent de `scripts/docs-i18n/strings.<locale>.json`, déjà
// produit pour la doc publique ; seuls les CORPS markdown manquent, parce que
// la doc les transforme avant publication (cf. `helpI18n.ts`).
//
// Le périmètre est celui de `helpBodies.en.ts` : ses CLÉS sont les corps
// FRANÇAIS exacts, sa valeur sert d'appui au modèle. On reste donc aligné sur
// l'anglais — un bloc absent là-bas l'est ici, et s'affiche en français.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'i18n-translate')

const argv = process.argv.slice(2)
const locale = argv.find((a) => !a.startsWith('--'))
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(argv[i + 1])
}
/** Taille d'un lot, en CARACTÈRES de markdown source (les blocs vont de 80 à 3 000). */
const BUDGET = flag('budget', 3000)
const CONCURRENCY = flag('concurrency', 5)
const LIMIT = flag('limit', Infinity)

const TARGETS = {
  es: { name: 'espagnol (Espagne, es-ES)', constant: 'HELP_BODIES_ES' },
  de: { name: 'allemand (Allemagne, de-DE)', constant: 'HELP_BODIES_DE' },
  it: { name: 'italien (Italie, it-IT)', constant: 'HELP_BODIES_IT' },
}
if (!locale || !TARGETS[locale]) {
  console.error(`Usage : node scripts/help-bodies-translate.mjs <${Object.keys(TARGETS).join('|')}>`)
  process.exit(1)
}
const target = TARGETS[locale]

function readEnvKey() {
  if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY
  const path = join(ROOT, '.env.local')
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('VITE_GEMINI_API_KEY='))
  return line ? line.slice('VITE_GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '') : null
}
const API_KEY = readEnvKey()
if (!API_KEY) {
  console.error('VITE_GEMINI_API_KEY introuvable (.env.local).')
  process.exit(1)
}

const MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const { HELP_BODIES_EN } = await import(
  pathToFileURL(join(ROOT, 'src/features/help/helpBodies.en.ts')).href
)
const BLOCKS = Object.entries(HELP_BODIES_EN) // [markdown FR, markdown EN]

mkdirSync(CACHE_DIR, { recursive: true })
const CACHE_FILE = join(CACHE_DIR, `help-bodies.${locale}.json`)
let done = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {}
const persist = () => writeFileSync(CACHE_FILE, JSON.stringify(done, null, 0))

const SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, markdown: { type: 'string' } },
        required: ['id', 'markdown'],
      },
    },
  },
  required: ['blocks'],
}

/**
 * Empreinte de MISE EN FORME d'un bloc : nombre de lignes, de puces, de
 * fragments de code et de segments en gras. Un modèle qui « améliore » la
 * structure d'un texte d'aide casse le rendu markdown du panneau — la vérifier
 * coûte moins cher que de relire 463 blocs à l'œil.
 */
function shape(md) {
  return [
    md.split('\n').length,
    (md.match(/^\s*[-*] /gm) ?? []).length,
    (md.match(/`/g) ?? []).length,
    (md.match(/\*\*/g) ?? []).length,
    (md.match(/\{\{\w+\}\}/g) ?? []).length,
  ].join('/')
}

function buildPrompt(batch) {
  return [
    "Tu traduis la DOCUMENTATION intégrée d'un logiciel professionnel de production",
    'graphique (éditeur en ligne, base produit PIM, imports/exports print, workflows IA).',
    '',
    `Langue cible : ${target.name}.`,
    '',
    'Chaque bloc est donné en français (source) puis en anglais (appui). Rends le',
    "markdown traduit, avec l'identifiant numérique correspondant.",
    '',
    'Règles impératives :',
    '1. Le format markdown est du CODE : conserve à l\'identique les titres (##), les',
    '   puces, les **gras**, les `fragments de code`, les sauts de ligne et les lignes',
    '   vides. Même nombre de lignes, même nombre de puces.',
    '2. Ne traduis JAMAIS ce qui est entre backticks (noms de champs, raccourcis,',
    '   extensions), ni les jetons {{champ}}, ni les noms de produits et de marques',
    '   (InDesign, Illustrator, Google Drive, Telegram, Firecrawl, Jina, EasyCatalog…).',
    '3. Les noms de MODULES et de BOUTONS de l\'application se traduisent : ils le sont',
    "   aussi dans l'interface (Bibliothèque, Réglages, Workflows → traduis-les).",
    '4. Registre : documentation professionnelle, adresse de politesse implicite,',
    '   pas de tutoiement. Vocabulaire de la PAO et de l\'impression.',
    "5. N'ajoute ni introduction, ni conclusion, ni commentaire : uniquement la",
    '   traduction du bloc.',
    '',
    ...batch.flatMap(({ id, fr, en }) => [
      `--- BLOC ${id} ---`,
      'FR:',
      fr,
      'EN:',
      en,
      '',
    ]),
  ].join('\n')
}

async function callGemini(batch, attempt = 1) {
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(batch) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 32768,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return callGemini(batch, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  if (!text.trim()) throw new Error('réponse vide')
  return JSON.parse(text).blocks ?? []
}

async function translateBatch(batch, depth = 0) {
  const rejected = []
  let out = []
  try {
    const list = await callGemini(batch)
    const byId = new Map(list.map((b) => [b.id, b.markdown]))
    for (const item of batch) {
      const value = (byId.get(item.id) ?? '').trim()
      if (value === '' || shape(value) !== shape(item.fr)) {
        rejected.push(item)
        continue
      }
      out.push([item.fr, value])
    }
  } catch (err) {
    console.warn(`  lot de ${batch.length} en échec : ${err.message}`)
    rejected.push(...batch)
    out = []
  }
  if (rejected.length > 0 && batch.length > 1 && depth < 4) {
    const half = Math.ceil(rejected.length / 2)
    return [
      ...out,
      ...(await translateBatch(rejected.slice(0, half), depth + 1)),
      ...(await translateBatch(rejected.slice(half), depth + 1)),
    ]
  }
  if (rejected.length > 0) {
    for (const item of rejected) {
      console.warn(`  ✗ abandon du bloc ${item.id} : « ${item.fr.slice(0, 50)}… »`)
    }
  }
  return out
}

// — Run ————————————————————————————————————————————————————————————————
const todo = BLOCKS.filter(([frMd]) => done[frMd] === undefined)
  .slice(0, LIMIT)
  .map(([frMd, enMd], i) => ({ id: i, fr: frMd, en: enMd }))

const cached = BLOCKS.filter(([frMd]) => done[frMd] !== undefined).length
console.info(`${locale} : ${BLOCKS.length} blocs, ${cached} en cache, ${todo.length} à traduire.`)

const batches = []
let current = []
let size = 0
for (const item of todo) {
  if (current.length > 0 && size + item.fr.length > BUDGET) {
    batches.push(current)
    current = []
    size = 0
  }
  current.push(item)
  size += item.fr.length
}
if (current.length > 0) batches.push(current)

let finished = 0
let cursor = 0
async function worker() {
  while (cursor < batches.length) {
    const batch = batches[cursor++]
    for (const [k, v] of await translateBatch(batch)) done[k] = v
    persist()
    finished += 1
    console.info(`  ${Math.round((finished / batches.length) * 100)} % — ${finished}/${batches.length} lots`)
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))

// — Écriture ————————————————————————————————————————————————————————————
/** Littéral gabarit TS — les corps contiennent des retours à la ligne et des backticks. */
const tsTemplate = (value) =>
  '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'

const missing = BLOCKS.filter(([frMd]) => done[frMd] === undefined)
const entries = BLOCKS.filter(([frMd]) => done[frMd] !== undefined)
  .map(([frMd]) => `  [${tsTemplate(frMd)}]:\n${tsTemplate(done[frMd])},`)
  .join('\n\n')

const header = `// Traduction ${target.name.toUpperCase()} des CORPS markdown de l'aide.
//
// Généré par \`node scripts/help-bodies-translate.mjs ${locale}\`, sur le périmètre de
// \`helpBodies.en.ts\` (mêmes blocs, l'anglais servant d'appui au modèle).
//
// Clefé par le markdown FRANÇAIS EXACT, comme \`strings.${locale}.json\` : aucun
// changement dans les 36 fichiers de \`content/\`, et un bloc non traduit
// s'affiche en français au lieu de disparaître.
//
// ⚠️ Un bloc retouché côté FR sort de ce mapping. C'est voulu : mieux vaut du
// français à jour qu'une traduction périmée.
export const ${target.constant}: Record<string, string> = {
`

writeFileSync(join(ROOT, `src/features/help/helpBodies.${locale}.ts`), `${header}${entries}\n}\n`)
console.info(`\n→ src/features/help/helpBodies.${locale}.ts écrit (${BLOCKS.length - missing.length}/${BLOCKS.length} blocs).`)
if (missing.length > 0) console.warn(`⚠ ${missing.length} blocs non traduits — relancer pour les reprendre.`)
