// Traduit les textes des RÉFÉRENTIELS — ceux qui vivent hors du catalogue d'UI.
//
//   node scripts/i18n-ref-strings.mjs es
//
// Trois modules portent des descriptions déjà bilingues, sous forme de paires
// adjacentes `champ` / `champEn` : le catalogue des fonctions Google Sheets, la
// référence des fonctions de formule et le schéma Firestore de l'onglet
// « Données ». Ce sont des référentiels, pas du vocabulaire d'application —
// c'est pourquoi ils ne sont PAS dans `lib/i18n` (cf. le commentaire de
// `googleSheetsFunctions.ts`).
//
// Les traductions produites ici sont clefées par le texte FRANÇAIS, comme
// l'aide : aucun champ à ajouter dans les trois fichiers, et un texte retouché
// côté FR sort du mapping et s'affiche en français au lieu de disparaître.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'i18n-translate')

const argv = process.argv.slice(2)
const locale = argv.find((a) => !a.startsWith('--'))
const TARGETS = {
  es: { name: 'espagnol (Espagne, es-ES)', constant: 'ES_REF_STRINGS' },
  de: { name: 'allemand (Allemagne, de-DE)', constant: 'DE_REF_STRINGS' },
  it: { name: 'italien (Italie, it-IT)', constant: 'IT_REF_STRINGS' },
}
if (!locale || !TARGETS[locale]) {
  console.error(`Usage : node scripts/i18n-ref-strings.mjs <${Object.keys(TARGETS).join('|')}>`)
  process.exit(1)
}
const target = TARGETS[locale]

const API_KEY =
  process.env.VITE_GEMINI_API_KEY ??
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('VITE_GEMINI_API_KEY='))
    ?.slice('VITE_GEMINI_API_KEY='.length)
    .trim()
    .replace(/^["']|["']$/g, '')
if (!API_KEY) {
  console.error('VITE_GEMINI_API_KEY introuvable (.env.local).')
  process.exit(1)
}

const MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/**
 * Fichiers sources. On les PARSE au lieu de les importer : deux d'entre eux
 * lisent `useLocaleStore` par l'alias `@/`, que Node ne résout pas.
 */
const FILES = [
  'src/features/gdrive/googleSheetsFunctions.ts',
  'src/features/excel/formulaEngine.ts',
  'src/features/data-graph/firestoreSchema.ts',
]

/**
 * Paires `champ: '…', champEn: '…'` ADJACENTES — la forme employée par les
 * trois fichiers. Une paire séparée par d'autres champs serait manquée : le
 * compte extrait est donc affiché, et doit rester stable dans le temps.
 */
const PAIR =
  /(\w+):\s*(['"])((?:\\.|(?!\2).)*)\2,?\s*\w+En:\s*(['"])((?:\\.|(?!\4).)*)\4/g

const pairs = new Map() // texte FR → texte EN
for (const file of FILES) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  let m
  let count = 0
  while ((m = PAIR.exec(src)) !== null) {
    const [, , , frText, , enText] = m
    if (frText.trim() === '' || pairs.has(frText)) continue
    pairs.set(frText, enText)
    count += 1
  }
  console.info(`  ${file} → ${count} paires`)
}
const ENTRIES = [...pairs.entries()]

mkdirSync(CACHE_DIR, { recursive: true })
const CACHE_FILE = join(CACHE_DIR, `ref-strings.${locale}.json`)
let done = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, text: { type: 'string' } },
        required: ['id', 'text'],
      },
    },
  },
  required: ['items'],
}

function buildPrompt(batch) {
  return [
    "Tu traduis des descriptions COURTES affichées dans l'aide contextuelle d'un",
    'logiciel de production graphique : fonctions de tableur (type Google Sheets),',
    'fonctions de formule maison, et tables d\'une base de données produit.',
    '',
    `Langue cible : ${target.name}.`,
    '',
    'Règles impératives :',
    "1. Ce sont des infobulles : une ligne, pas de phrase explicative ajoutée,",
    "   pas de ponctuation finale si la source n'en a pas.",
    '2. Les NOMS DE FONCTIONS et la syntaxe entre parenthèses ne se traduisent pas',
    '   (SUM, RECHERCHEV, SI(condition, valeur_vrai, valeur_faux)).',
    '3. Les noms de champs entre crochets — [Prix] — se recopient à l\'identique.',
    '4. Vocabulaire du tableur dans la langue cible (« rango » pour une plage en',
    '   espagnol, « celda » pour une cellule).',
    '',
    'Rends une entrée par identifiant, avec son identifiant EXACT.',
    '',
    ...batch.map(({ id, fr, en }) => `[${id}] FR: ${fr}\n     EN: ${en}`),
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
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
      },
    }),
  })
  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return callGemini(batch, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  return JSON.parse(text).items ?? []
}

const todo = ENTRIES.map(([fr, en], id) => ({ id, fr, en })).filter((e) => done[e.fr] === undefined)
console.info(`${locale} : ${ENTRIES.length} textes, ${ENTRIES.length - todo.length} en cache, ${todo.length} à traduire.`)

const BATCH = 25
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  try {
    const list = await callGemini(batch)
    const byId = new Map(list.map((e) => [e.id, e.text]))
    for (const item of batch) {
      const value = (byId.get(item.id) ?? '').trim()
      if (value !== '') done[item.fr] = value
    }
  } catch (err) {
    console.warn(`  lot ${i / BATCH + 1} en échec : ${err.message}`)
  }
  writeFileSync(CACHE_FILE, JSON.stringify(done))
  console.info(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
}

const tsString = (v) => (v.includes("'") ? JSON.stringify(v) : `'${v}'`)
const missing = ENTRIES.filter(([fr]) => done[fr] === undefined)
const body = ENTRIES.filter(([fr]) => done[fr] !== undefined)
  .map(([fr]) => `  ${tsString(fr)}: ${tsString(done[fr])},`)
  .join('\n')

writeFileSync(
  join(ROOT, `src/lib/i18n/refStrings.${locale}.ts`),
  `// Traduction ${target.name.toUpperCase()} des textes de RÉFÉRENTIEL — fonctions de tableur,
// fonctions de formule et tables du schéma de données.
//
// Généré par \`node scripts/i18n-ref-strings.mjs ${locale}\`. Clefé par le texte
// FRANÇAIS exact : rien à ajouter dans les trois fichiers de référence, et un
// texte retouché côté FR retombe sur le français au lieu de disparaître.
//
// ⚠️ Ces textes ne sont PAS dans le catalogue d'UI : ce sont des référentiels
// (157 fonctions Google Sheets…), qui y diluerait le vocabulaire d'application.
export const ${target.constant}: Record<string, string> = {
${body}
}
`,
)
console.info(`\n→ src/lib/i18n/refStrings.${locale}.ts écrit (${ENTRIES.length - missing.length}/${ENTRIES.length}).`)
if (missing.length > 0) console.warn(`⚠ ${missing.length} textes non traduits.`)
