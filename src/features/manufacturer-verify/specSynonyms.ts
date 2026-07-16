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

interface SpecSynonymEntry {
  /** Clé canonique stable (slug) — jamais affichée telle quelle. */
  canonicalKey: string
  /** Libellé d'affichage FR de référence. */
  label: string
  /** Libellés acceptés (déjà normalisés : minuscules, sans accent). */
  aliases: string[]
}

/** Amorce ~40 champs outillage / électroportatif (couvre le cas démo Bosch). */
const SPEC_SYNONYMS: SpecSynonymEntry[] = [
  { canonicalKey: 'puissance', label: 'Puissance', aliases: ['puissance', 'puissance nominale absorbee', 'puissance absorbee', 'puissance nominale', 'puissance moteur', 'power', 'rated power', 'wattage'] },
  { canonicalKey: 'puissance_utile', label: 'Puissance utile', aliases: ['puissance utile', 'puissance debitee', 'output power'] },
  { canonicalKey: 'tension', label: 'Tension', aliases: ['tension', 'voltage', 'tension batterie', 'tension nominale', 'tension d alimentation', 'volt'] },
  { canonicalKey: 'capacite_batterie', label: 'Capacité batterie', aliases: ['capacite batterie', 'capacite de la batterie', 'capacite', 'ampere heure', 'capacite accu', 'battery capacity', 'ah'] },
  { canonicalKey: 'type_batterie', label: 'Type de batterie', aliases: ['type de batterie', 'type batterie', 'technologie batterie', 'battery type'] },
  // Un seul champ « Couple » (les variantes tendre/dur/maxi restent alignées
  // ensemble : source et fabricant n'ont en général qu'une ligne Couple).
  { canonicalKey: 'couple', label: 'Couple', aliases: ['couple', 'couple max', 'couple maxi', 'couple maximal', 'couple de serrage', 'couple tendre', 'couple dur', 'couple vissage tendre', 'couple vissage dur', 'torque', 'max torque', 'hard torque', 'soft torque'] },
  { canonicalKey: 'vitesse_rotation', label: 'Vitesse de rotation', aliases: ['vitesse de rotation', 'vitesse a vide', 'vitesse rotation', 'regime a vide', 'nombre de tours', 'no load speed', 'rpm', 'tr min'] },
  { canonicalKey: 'vitesse_rotation_2', label: 'Vitesse de rotation (2e)', aliases: ['vitesse de rotation 2e vitesse', '2e vitesse', 'vitesse 2'] },
  { canonicalKey: 'frequence_frappe', label: 'Fréquence de frappe', aliases: ['frequence de frappe', 'cadence de frappe', 'frequence de percussion', 'coups par minute', 'impact rate', 'bpm'] },
  { canonicalKey: 'nombre_chocs', label: 'Nombre de chocs', aliases: ['nombre de chocs', 'chocs par minute', 'impacts par minute'] },
  { canonicalKey: 'energie_choc', label: 'Énergie de choc', aliases: ['energie de choc', 'energie de frappe', 'force de frappe', 'joule', 'impact energy'] },
  { canonicalKey: 'poids', label: 'Poids', aliases: ['poids', 'masse', 'poids avec batterie', 'poids sans batterie', 'weight', 'poids net'] },
  { canonicalKey: 'dimensions', label: 'Dimensions', aliases: ['dimensions', 'dimension', 'encombrement', 'l x l x h', 'longueur x largeur x hauteur', 'dimensions produit'] },
  { canonicalKey: 'longueur', label: 'Longueur', aliases: ['longueur', 'length'] },
  { canonicalKey: 'largeur', label: 'Largeur', aliases: ['largeur', 'width'] },
  { canonicalKey: 'hauteur', label: 'Hauteur', aliases: ['hauteur', 'height'] },
  { canonicalKey: 'diametre', label: 'Diamètre', aliases: ['diametre', 'diameter', 'diametre max', 'diametre de percage'] },
  { canonicalKey: 'capacite_percage_bois', label: 'Capacité perçage bois', aliases: ['capacite de percage bois', 'percage bois', 'diametre percage bois', 'capacite bois', 'wood drilling capacity'] },
  { canonicalKey: 'capacite_percage_acier', label: 'Capacité perçage acier', aliases: ['capacite de percage acier', 'percage acier', 'diametre percage acier', 'capacite acier', 'steel drilling capacity'] },
  { canonicalKey: 'capacite_percage_beton', label: 'Capacité perçage béton', aliases: ['capacite de percage beton', 'percage beton', 'diametre percage beton', 'capacite beton', 'masonry drilling capacity'] },
  { canonicalKey: 'capacite_mandrin', label: 'Capacité du mandrin', aliases: ['capacite du mandrin', 'serrage mandrin', 'plage de serrage', 'mandrin', 'chuck capacity'] },
  { canonicalKey: 'type_mandrin', label: 'Type de mandrin', aliases: ['type de mandrin', 'porte outil', 'fixation outil', 'chuck type', 'emmanchement'] },
  { canonicalKey: 'niveau_pression_acoustique', label: 'Pression acoustique', aliases: ['niveau de pression acoustique', 'pression acoustique', 'niveau sonore', 'sound pressure level'] },
  { canonicalKey: 'niveau_puissance_acoustique', label: 'Puissance acoustique', aliases: ['niveau de puissance acoustique', 'puissance acoustique', 'sound power level'] },
  { canonicalKey: 'niveau_vibration', label: 'Niveau de vibration', aliases: ['niveau de vibration', 'vibration', 'valeur de vibration', 'vibrations', 'vibration level'] },
  { canonicalKey: 'longueur_cable', label: 'Longueur du câble', aliases: ['longueur du cable', 'longueur cable', 'cable', 'cordon', 'cable length'] },
  { canonicalKey: 'debit_air', label: "Débit d'air", aliases: ['debit d air', 'debit air', 'debit', 'air flow'] },
  { canonicalKey: 'debit_eau', label: "Débit d'eau", aliases: ['debit d eau', 'debit eau', 'water flow'] },
  { canonicalKey: 'pression', label: 'Pression', aliases: ['pression', 'pression max', 'pression maxi', 'pressure', 'bar'] },
  { canonicalKey: 'temperature_max', label: 'Température max', aliases: ['temperature max', 'temperature maximale', 'temperature', 'max temperature'] },
  { canonicalKey: 'capacite_reservoir', label: 'Capacité du réservoir', aliases: ['capacite du reservoir', 'reservoir', 'volume reservoir', 'tank capacity'] },
  { canonicalKey: 'garantie', label: 'Garantie', aliases: ['garantie', 'duree de garantie', 'warranty'] },
  { canonicalKey: 'indice_protection', label: 'Indice de protection', aliases: ['indice de protection', 'ip', 'protection ip', 'ingress protection'] },
  { canonicalKey: 'classe_protection', label: 'Classe de protection', aliases: ['classe de protection', 'classe electrique', 'protection class'] },
  { canonicalKey: 'materiau', label: 'Matériau', aliases: ['materiau', 'matiere', 'material'] },
  { canonicalKey: 'couleur', label: 'Couleur', aliases: ['couleur', 'coloris', 'color'] },
  { canonicalKey: 'contenu_livraison', label: 'Contenu de la livraison', aliases: ['contenu de la livraison', 'livraison', 'fourni avec', 'contenu du carton', 'contenu', 'scope of delivery', 'inclus'] },
  { canonicalKey: 'reference_fabricant', label: 'Référence fabricant', aliases: ['reference fabricant', 'ref fabricant', 'reference constructeur', 'mpn', 'code article fabricant', 'manufacturer part number'] },
  { canonicalKey: 'ean', label: 'EAN / Code-barres', aliases: ['ean', 'code barres', 'gtin', 'code ean', 'ean13', 'barcode'] },
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
    for (const a of entry.aliases) m.set(normalizeSpecLabel(a), entry.canonicalKey)
  }
  return m
})()

const LABEL_BY_KEY: Map<string, string> = new Map(SPEC_SYNONYMS.map((e) => [e.canonicalKey, e.label]))

/** Retourne le libellé d'affichage FR d'une clé canonique (ou la clé si inconnue). */
export function canonicalLabel(canonicalKey: string): string {
  return LABEL_BY_KEY.get(canonicalKey) ?? canonicalKey
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
    const conv = UNIT_FACTORS[unitKey]
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
