/**
 * Normaliseur UNIVERSEL de paires (nom, valeur) de specs.
 *
 * Signal générique, jamais par-site : une SPEC a un nom-libellé et une valeur.
 * Quand un parser (markdown transposé, tableau configurateur d'accessoires…)
 * produit une paire dont le NOM est en réalité une VALEUR (« 15/30/- Nm »,
 * « 1 / 10 mm », « 215 x 95 x », « 52,24 € »), la paire est corrompue → on la
 * rejette (la re-permuter créerait un faux appariement nom↔valeur croisé).
 * Dédup par nom normalisé (supprime les doublons type « Poids » ×2).
 */

/** Unités techniques reconnues (bornes de mot). */
const UNIT_RE = /\b(nm|mm|cm|mm²|m²|kg|g|mg|kv|kw|w|va|v|ah|mah|wh|rpm|tr\/?min|min-1|bar|mbar|pa|kpa|°c|°|db|db\(a\)|hz|khz|j|l\/min|l\/h|m\/s|m\/s²|mpa|psi)\b/i

/** Vrai si la chaîne est en réalité une VALEUR (pas un libellé de spec). */
export function looksLikeSpecValue(s: string): boolean {
  const t = (s ?? '').trim()
  if (!t) return true
  // Prix / devise / suffixe monétaire nu.
  if (/^[€$£]|[€$£]\s*$|^(ht|ttc|ttc\.?|ht\.?)$/i.test(t)) return true
  // Ne commence pas par un chiffre/comparateur → c'est un libellé.
  if (!/^[<>~≈±]?\s*[\d]/.test(t)) return false
  const hasUnit = UNIT_RE.test(t)
  // Reste-t-il un vrai mot (≥ 4 lettres) une fois les unités retirées ?
  const words = t.replace(UNIT_RE, ' ')
  const hasWord = /[a-zà-ÿ]{4,}/i.test(words)
  // Commence par un chiffre ET (porte une unité OU n'a aucun mot substantiel) → valeur.
  return hasUnit || !hasWord
}

/** UUID / identifiant technique nu (ex: « 29aae2cf-97c1-cb53-… ») en valeur. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-?/i

/** Bruit anti-bot / erreur de connectivité / prompt de formulaire (challenge
 *  DataDome, captcha, avis) — poison RÉCURRENT des scrapes, universel. */
const BOT_FORM_RE = /\b(no\s+internet\s+access|access\s+denied|are\s+you\s+(?:a\s+)?(?:human|robot)|verify\s+you\s+are|captcha|please\s+(?:enable|verify|choose|select|complete|try)|choose\s+a\s+(?:subject|reason|topic)|i['’]?ve\s+tried|try\s+again\s+later|enable\s+javascript|checking\s+your\s+browser|acc[eè]s\s+refus[eé]|v[eé]rifi(?:cation|ez)\s+que\s+vous)/i

/** Vrai si la paire est du bruit technique/anti-bot/formulaire (à rejeter). */
function isNoisePair(name: string, value: string): boolean {
  if (UUID_RE.test(value)) return true
  if (BOT_FORM_RE.test(name) || BOT_FORM_RE.test(value)) return true
  return false
}

export interface RawSpecPair { name: string; value: string; group?: string }

/**
 * Nettoie une liste de paires : rejette les paires corrompues (nom = valeur,
 * valeur vide) et déduplique par nom normalisé (NFD, minuscules).
 */
export function normalizeSpecPairs<T extends RawSpecPair>(specs: T[]): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  for (const s of specs) {
    const name = (s.name ?? '').trim()
    const value = (s.value ?? '').trim()
    if (!name || !value) continue
    if (looksLikeSpecValue(name)) continue
    if (isNoisePair(name, value)) continue
    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}
