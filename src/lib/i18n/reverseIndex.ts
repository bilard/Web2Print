import type { Locale } from '@/stores/locale.store'
import { compiledCatalog } from './index'
import type { TranslationKey } from './fr'

/**
 * Index INVERSE du catalogue : « quel libellé ai-je sous le curseur ? ».
 *
 * L'édition live doit retrouver la `TranslationKey` derrière un texte affiché.
 * Marquer chaque texte dans le DOM aurait supposé de toucher les ~380 fichiers
 * qui appellent `t()` — et `t()` rend une chaîne, pas un élément : il n'y a nulle
 * part où accrocher un `data-i18n-key`. On fait donc le chemin inverse, depuis
 * le texte rendu vers la clé.
 *
 * ⚠️ La correspondance n'est pas toujours unique : « Enregistrer » sert dans
 * plusieurs modules. L'index rend donc TOUTES les clés candidates et c'est
 * l'utilisateur qui tranche dans le popover — un renommage à l'aveugle
 * changerait le mot dans des écrans qu'il n'a pas sous les yeux.
 */

/**
 * Normalise un texte pour la comparaison DOM ↔ catalogue.
 *
 * Le DOM introduit des retours à la ligne et des indentations que le catalogue
 * n'a pas, et le français y sème des espaces INSÉCABLES (avant « : », dans les
 * guillemets) qui ne sont pas l'espace ASCII du fichier source.
 */
export function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Littéral minimum pour qu'un gabarit IDENTIFIE quelque chose.
 *
 * ⚠️ Trouvé par le test : `ac.quota.scopeSuffix` vaut « {scope} » — une variable
 * et rien d'autre. Sa regex devient `^(.+?)$`, qui reconnaît TOUT texte. Le
 * moindre Alt+clic sur un nom de produit scrapé aurait donc proposé de renommer
 * cette clé, en violation directe de la règle « seule l'interface est
 * surchargeable ». Un gabarit sans texte propre n'identifie rien : on l'écarte.
 */
const MIN_LITERAL_CHARS = 3

/** Gabarit interpolable (`{count} produits`) → regex d'égalité souple. */
function templateToRegex(template: string): RegExp | null {
  if (!template.includes('{')) return null
  const literal = normalizeLabel(template).replace(/\{\w+\}/g, '').trim()
  if (literal.length < MIN_LITERAL_CHARS) return null
  const escaped = normalizeLabel(template).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // `\{(\w+)\}` a été échappé juste avant : on le retrouve sous la forme `\{nom\}`.
  const pattern = escaped.replace(/\\\{(\w+)\\\}/g, '(.+?)')
  return pattern === escaped ? null : new RegExp(`^${pattern}$`)
}

interface CatalogueIndex {
  /** Texte normalisé → clés qui le rendent. */
  exact: Map<string, TranslationKey[]>
  /** Gabarits à trous, testés seulement si l'exact ne donne rien (plus coûteux). */
  templates: Array<{ key: TranslationKey; rx: RegExp }>
}

const CACHE = new Map<string, CatalogueIndex>()

function buildIndex(
  catalogue: Record<string, string>,
  overrides: Record<string, string>,
): CatalogueIndex {
  const exact = new Map<string, TranslationKey[]>()
  const templates: Array<{ key: TranslationKey; rx: RegExp }> = []
  // Les surcharges ÉCRASENT le catalogue : c'est le texte réellement à l'écran
  // qu'on indexe, pas celui d'origine. Sans ça, un libellé déjà renommé une fois
  // ne serait plus jamais retrouvable pour être re-renommé.
  const merged: Record<string, string> = { ...catalogue, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    const k = key as TranslationKey
    const norm = normalizeLabel(value)
    if (norm === '') continue
    const bucket = exact.get(norm)
    if (bucket) bucket.push(k)
    else exact.set(norm, [k])
    const rx = templateToRegex(value)
    if (rx) templates.push({ key: k, rx })
  }
  return { exact, templates }
}

/**
 * Clés dont le rendu correspond à ce texte, dans la langue donnée.
 *
 * `version` sert d'empreinte de cache : c'est le compteur du store de
 * surcharges. L'index se reconstruit donc exactement quand le vocabulaire
 * change, et pas à chaque clic (4 257 entrées à parcourir).
 */
export function findKeysByText(
  text: string,
  locale: Locale,
  overrides: Record<string, string>,
  version: number,
): TranslationKey[] {
  const cacheKey = `${locale}:${version}`
  let index = CACHE.get(cacheKey)
  if (!index) {
    // Les langues sans catalogue compilé s'affichent en français : c'est donc le
    // catalogue FR qu'on indexe pour elles, sinon rien ne serait cliquable.
    const catalogue = compiledCatalog(locale)
    index = buildIndex(catalogue, overrides)
    CACHE.clear() // une seule version vivante à la fois — l'index pèse ~4 000 entrées
    CACHE.set(cacheKey, index)
  }

  const norm = normalizeLabel(text)
  if (norm === '') return []
  const direct = index.exact.get(norm)
  if (direct) return direct

  return index.templates.filter(({ rx }) => rx.test(norm)).map(({ key }) => key)
}
