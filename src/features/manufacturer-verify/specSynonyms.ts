/**
 * Dictionnaire UNIVERSEL de synonymes de champs (specs techniques).
 *
 * But : aligner un libellé de spec côté SOURCE (revendeur) avec le libellé
 * équivalent côté FABRICANT, pour comparer les valeurs. Ex :
 *   « Puissance » (Rubix) ↔ « Puissance nominale absorbée » (Bosch) → même clé.
 *
 * ⚠ Règle projet (feedback_no_per_vendor_scrapers / feedback_scraping_universal_rules) :
 * ce dictionnaire est **universel** (par nom de champ), JAMAIS par marque. Aucune
 * entrée « bosch » / « makita » ici. Les paires non couvertes sont rapprochées par
 * le LLM (alignUnknownSpecs, sémantique seule — il ne fabrique aucune valeur), et
 * le résultat est mis en cache dans la fiche (colonne ai_mfr_alignment) : aucun
 * appel LLM à la ré-ouverture.
 */

import { useLocaleStore, type Locale } from '@/stores/locale.store'

interface SpecSynonymEntry {
  /** Clé canonique stable (slug) — jamais affichée telle quelle. */
  canonicalKey: string
  /** Libellé d'affichage FR de référence. */
  label: string
  /** Libellé d'affichage EN — le référentiel est BILINGUE EN PLACE (comme
   *  `googleSheetsFunctions`) : traduire par clé i18n imposerait 40 clés pour
   *  une donnée métier, et la recherche doit interroger les DEUX langues. */
  labelEn: string
  /** Libellés acceptés (déjà normalisés : minuscules, sans accent). */
  aliases: string[]
}

/** Amorce ~40 champs outillage / électroportatif (couvre le cas démo Bosch). */
const SPEC_SYNONYMS: SpecSynonymEntry[] = [
  { canonicalKey: 'puissance', label: 'Puissance', labelEn: 'Power', aliases: ['puissance', 'puissance nominale absorbee', 'puissance absorbee', 'puissance nominale', 'puissance moteur', 'power', 'rated power', 'wattage'] },
  { canonicalKey: 'puissance_utile', label: 'Puissance utile', labelEn: 'Output power', aliases: ['puissance utile', 'puissance debitee', 'output power'] },
  { canonicalKey: 'tension', label: 'Tension', labelEn: 'Voltage', aliases: ['tension', 'voltage', 'tension batterie', 'tension nominale', 'tension d alimentation', 'volt'] },
  { canonicalKey: 'capacite_batterie', label: 'Capacité batterie', labelEn: 'Battery capacity', aliases: ['capacite batterie', 'capacite de la batterie', 'capacite', 'ampere heure', 'capacite accu', 'battery capacity', 'ah'] },
  { canonicalKey: 'type_batterie', label: 'Type de batterie', labelEn: 'Battery type', aliases: ['type de batterie', 'type batterie', 'technologie batterie', 'battery type'] },
  // Un seul champ « Couple » (les variantes tendre/dur/maxi restent alignées
  // ensemble : source et fabricant n'ont en général qu'une ligne Couple).
  { canonicalKey: 'couple', label: 'Couple', labelEn: 'Torque', aliases: ['couple', 'couple max', 'couple maxi', 'couple maximal', 'couple de serrage', 'couple tendre', 'couple dur', 'couple vissage tendre', 'couple vissage dur', 'torque', 'max torque', 'hard torque', 'soft torque'] },
  { canonicalKey: 'vitesse_rotation', label: 'Vitesse de rotation', labelEn: 'Rotation speed', aliases: ['vitesse de rotation', 'vitesse a vide', 'vitesse rotation', 'regime a vide', 'nombre de tours', 'no load speed', 'rpm', 'tr min'] },
  { canonicalKey: 'vitesse_rotation_2', label: 'Vitesse de rotation (2e)', labelEn: 'Rotation speed (2nd)', aliases: ['vitesse de rotation 2e vitesse', '2e vitesse', 'vitesse 2'] },
  { canonicalKey: 'frequence_frappe', label: 'Fréquence de frappe', labelEn: 'Impact rate', aliases: ['frequence de frappe', 'cadence de frappe', 'frequence de percussion', 'coups par minute', 'impact rate', 'bpm'] },
  { canonicalKey: 'nombre_chocs', label: 'Nombre de chocs', labelEn: 'Impacts per minute', aliases: ['nombre de chocs', 'chocs par minute', 'impacts par minute'] },
  { canonicalKey: 'energie_choc', label: 'Énergie de choc', labelEn: 'Impact energy', aliases: ['energie de choc', 'energie de frappe', 'force de frappe', 'joule', 'impact energy'] },
  { canonicalKey: 'poids', label: 'Poids', labelEn: 'Weight', aliases: ['poids', 'masse', 'poids avec batterie', 'poids sans batterie', 'weight', 'poids net'] },
  { canonicalKey: 'dimensions', label: 'Dimensions', labelEn: 'Dimensions', aliases: ['dimensions', 'dimension', 'encombrement', 'l x l x h', 'longueur x largeur x hauteur', 'dimensions produit'] },
  { canonicalKey: 'longueur', label: 'Longueur', labelEn: 'Length', aliases: ['longueur', 'length'] },
  { canonicalKey: 'largeur', label: 'Largeur', labelEn: 'Width', aliases: ['largeur', 'width'] },
  { canonicalKey: 'hauteur', label: 'Hauteur', labelEn: 'Height', aliases: ['hauteur', 'height'] },
  { canonicalKey: 'diametre', label: 'Diamètre', labelEn: 'Diameter', aliases: ['diametre', 'diameter', 'diametre max', 'diametre de percage'] },
  { canonicalKey: 'capacite_percage_bois', label: 'Capacité perçage bois', labelEn: 'Drilling capacity in wood', aliases: ['capacite de percage bois', 'percage bois', 'diametre percage bois', 'capacite bois', 'wood drilling capacity'] },
  { canonicalKey: 'capacite_percage_acier', label: 'Capacité perçage acier', labelEn: 'Drilling capacity in steel', aliases: ['capacite de percage acier', 'percage acier', 'diametre percage acier', 'capacite acier', 'steel drilling capacity'] },
  { canonicalKey: 'capacite_percage_beton', label: 'Capacité perçage béton', labelEn: 'Drilling capacity in masonry', aliases: ['capacite de percage beton', 'percage beton', 'diametre percage beton', 'capacite beton', 'masonry drilling capacity'] },
  { canonicalKey: 'capacite_mandrin', label: 'Capacité du mandrin', labelEn: 'Chuck capacity', aliases: ['capacite du mandrin', 'serrage mandrin', 'plage de serrage', 'mandrin', 'chuck capacity'] },
  { canonicalKey: 'type_mandrin', label: 'Type de mandrin', labelEn: 'Chuck type', aliases: ['type de mandrin', 'porte outil', 'fixation outil', 'chuck type', 'emmanchement'] },
  { canonicalKey: 'niveau_pression_acoustique', label: 'Pression acoustique', labelEn: 'Sound pressure level', aliases: ['niveau de pression acoustique', 'pression acoustique', 'niveau sonore', 'sound pressure level'] },
  { canonicalKey: 'niveau_puissance_acoustique', label: 'Puissance acoustique', labelEn: 'Sound power level', aliases: ['niveau de puissance acoustique', 'puissance acoustique', 'sound power level'] },
  { canonicalKey: 'niveau_vibration', label: 'Niveau de vibration', labelEn: 'Vibration level', aliases: ['niveau de vibration', 'vibration', 'valeur de vibration', 'vibrations', 'vibration level'] },
  { canonicalKey: 'longueur_cable', label: 'Longueur du câble', labelEn: 'Cable length', aliases: ['longueur du cable', 'longueur cable', 'cable', 'cordon', 'cable length'] },
  { canonicalKey: 'debit_air', label: "Débit d'air", labelEn: 'Air flow', aliases: ['debit d air', 'debit air', 'debit', 'air flow'] },
  { canonicalKey: 'debit_eau', label: "Débit d'eau", labelEn: 'Water flow', aliases: ['debit d eau', 'debit eau', 'water flow'] },
  { canonicalKey: 'pression', label: 'Pression', labelEn: 'Pressure', aliases: ['pression', 'pression max', 'pression maxi', 'pressure', 'bar'] },
  { canonicalKey: 'temperature_max', label: 'Température max', labelEn: 'Maximum temperature', aliases: ['temperature max', 'temperature maximale', 'temperature', 'max temperature'] },
  { canonicalKey: 'capacite_reservoir', label: 'Capacité du réservoir', labelEn: 'Tank capacity', aliases: ['capacite du reservoir', 'reservoir', 'volume reservoir', 'tank capacity'] },
  { canonicalKey: 'garantie', label: 'Garantie', labelEn: 'Warranty', aliases: ['garantie', 'duree de garantie', 'warranty'] },
  { canonicalKey: 'indice_protection', label: 'Indice de protection', labelEn: 'IP rating', aliases: ['indice de protection', 'ip', 'protection ip', 'ingress protection'] },
  { canonicalKey: 'classe_protection', label: 'Classe de protection', labelEn: 'Protection class', aliases: ['classe de protection', 'classe electrique', 'protection class'] },
  { canonicalKey: 'materiau', label: 'Matériau', labelEn: 'Material', aliases: ['materiau', 'matiere', 'material'] },
  { canonicalKey: 'couleur', label: 'Couleur', labelEn: 'Colour', aliases: ['couleur', 'coloris', 'color'] },
  { canonicalKey: 'contenu_livraison', label: 'Contenu de la livraison', labelEn: 'Scope of delivery', aliases: ['contenu de la livraison', 'livraison', 'fourni avec', 'contenu du carton', 'contenu', 'scope of delivery', 'inclus'] },
  { canonicalKey: 'reference_fabricant', label: 'Référence fabricant', labelEn: 'Manufacturer reference', aliases: ['reference fabricant', 'ref fabricant', 'reference constructeur', 'mpn', 'code article fabricant', 'manufacturer part number'] },
  { canonicalKey: 'ean', label: 'EAN / Code-barres', labelEn: 'EAN / Barcode', aliases: ['ean', 'code barres', 'gtin', 'code ean', 'ean13', 'barcode'] },
]

/** Normalise un libellé : minuscules, sans accent, ponctuation → espace, espaces compactés. */
export function normalizeSpecLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Index alias → canonicalKey (construit une seule fois).
const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const entry of SPEC_SYNONYMS) {
    m.set(normalizeSpecLabel(entry.canonicalKey), entry.canonicalKey)
    m.set(normalizeSpecLabel(entry.label), entry.canonicalKey)
    // Le libellé EN sert AUSSI d'alias : une fiche fabricant anglaise (« Sound
    // power level ») s'aligne alors sans passer par le LLM.
    m.set(normalizeSpecLabel(entry.labelEn), entry.canonicalKey)
    for (const a of entry.aliases) m.set(normalizeSpecLabel(a), entry.canonicalKey)
  }
  return m
})()

const LABEL_BY_KEY: Map<string, { fr: string; en: string }> = new Map(
  SPEC_SYNONYMS.map((e) => [e.canonicalKey, { fr: e.label, en: e.labelEn }]),
)

/**
 * Libellé d'affichage d'une clé canonique dans la langue COURANTE (ou la clé
 * telle quelle si inconnue — un libellé brut de la source vaut mieux que rien).
 *
 * ⚠️ Rendu au moment de l'appel, comme `t()` : la comparaison est reconstruite
 * à chaque rendu, donc le changement de langue est bien répercuté.
 */
export function canonicalLabel(canonicalKey: string, locale?: Locale): string {
  const entry = LABEL_BY_KEY.get(canonicalKey)
  if (!entry) return canonicalKey
  return (locale ?? useLocaleStore.getState().locale) === 'en' ? entry.en : entry.fr
}

/**
 * Rapproche un nom de spec vers sa clé canonique.
 * Match exact d'alias, puis inclusion (« puissance nominale absorbée en watts »
 * contient « puissance nominale absorbee »). Retourne null si rien de fiable.
 */
export function canonicalizeSpecName(name: string): string | null {
  if (!name) return null
  const norm = normalizeSpecLabel(name)
  if (!norm) return null
  const exact = ALIAS_INDEX.get(norm)
  if (exact) return exact
  // Rapprochement ancré au DÉBUT du libellé, pas au milieu : « couple (tendre/dur) »
  // → couple, mais « présélections de couple » NE matche PAS couple (sinon on
  // comparerait la mauvaise valeur). On accepte aussi l'inverse quand le libellé
  // est plus court que l'alias (« puissance » ⊂ « puissance nominale absorbée »).
  let best: { key: string; len: number } | null = null
  for (const [alias, key] of ALIAS_INDEX) {
    if (alias.length < 4) continue
    const startsWithAlias = norm === alias || norm.startsWith(alias + ' ')
    const aliasStartsWithNorm = alias === norm || alias.startsWith(norm + ' ')
    if (startsWithAlias || aliasStartsWithNorm) {
      if (!best || alias.length > best.len) best = { key, len: alias.length }
    }
  }
  return best?.key ?? null
}

// ── Normalisation de VALEURS pour la comparaison (unités) ────────────────────

/** Familles d'unités : facteur vers une unité de base pour rendre 1500 W ≡ 1,5 kW. */
const UNIT_FACTORS: Record<string, { base: string; factor: number }> = {
  // Puissance → W
  w: { base: 'w', factor: 1 }, watt: { base: 'w', factor: 1 }, watts: { base: 'w', factor: 1 },
  kw: { base: 'w', factor: 1000 }, kwatt: { base: 'w', factor: 1000 },
  // Longueur → mm
  mm: { base: 'mm', factor: 1 }, cm: { base: 'mm', factor: 10 }, m: { base: 'mm', factor: 1000 },
  // Masse → g
  g: { base: 'g', factor: 1 }, kg: { base: 'g', factor: 1000 },
  // Couple → nm
  nm: { base: 'nm', factor: 1 },
  // Tension → v
  v: { base: 'v', factor: 1 }, volt: { base: 'v', factor: 1 }, volts: { base: 'v', factor: 1 },
  // Capacité → ah / mah
  ah: { base: 'ah', factor: 1 }, mah: { base: 'ah', factor: 0.001 },
  // Vitesse → tr/min
  'tr min': { base: 'tpm', factor: 1 }, 'tours min': { base: 'tpm', factor: 1 },
  'tr mn': { base: 'tpm', factor: 1 }, rpm: { base: 'tpm', factor: 1 }, 'min 1': { base: 'tpm', factor: 1 },
  // Pression → bar
  bar: { base: 'bar', factor: 1 },
}

/**
 * Normalise une valeur pour comparaison robuste.
 * - Nombre + unité connue → « <valeur en base> <base> » (1500 W ≡ 1,5 kW → "1500 w").
 * - Plage / dimensions multiples → normalise chaque nombre, garde l'ordre.
 * - Sinon : texte normalisé (minuscules, sans accent, espaces compactés).
 * Ne convertit jamais entre familles différentes (mm vs W).
 */
export function normalizeValueForCompare(value: string): string {
  if (value == null) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Un seul nombre + unité (ex "1,5 kW", "1500 W", "13 mm", "2.0 Ah")
  const single = lower.match(/^([<>~\u2248]?\s*[\d]+(?:[.,]\d+)?)\s*([a-z][a-z /.-]*?)\.?$/)
  if (single) {
    const num = parseFloat(single[1].replace(/[<>~\u2248\s]/g, '').replace(',', '.'))
    const unitKey = single[2].trim().replace(/[./-]/g, ' ').replace(/\s+/g, ' ').trim()
    // Tolère l'unité avec/ sans séparateur interne : « N.m », « N m » ≡ « Nm ».
    const conv = UNIT_FACTORS[unitKey] ?? UNIT_FACTORS[unitKey.replace(/\s+/g, '')]
    if (conv && Number.isFinite(num)) {
      const inBase = num * conv.factor
      return `${trimNumber(inBase)} ${conv.base}`
    }
  }

  // Nombre nu (ex "13", "2.0")
  const bareNum = lower.match(/^([\d]+(?:[.,]\d+)?)$/)
  if (bareNum) return trimNumber(parseFloat(bareNum[1].replace(',', '.')))

  // Texte : compacter et enlever la ponctuation faible.
  return lower.replace(/[^a-z0-9]+/g, ' ').trim()
}

function trimNumber(n: number): string {
  // Évite "1500.0000000001" et "13.0" → "13".
  return String(Math.round(n * 1000) / 1000)
}
