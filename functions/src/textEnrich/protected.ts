// functions/src/textEnrich/protected.ts
// ⚠ COPIE de src/features/textEnrich/protected.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// Ce qu'une réécriture n'a PAS le droit de toucher : références, codes-barres, valeurs
// chiffrées, marques. PUR.
//
// ⚠ Pourquoi une vérification et pas seulement une consigne. Demander poliment au modèle
// de recopier une référence ne garantit rien : il « corrige » les codes qui lui semblent
// mal formés, francise les unités, et remplace volontiers une valeur par un arrondi. Or
// un chiffre inventé dans une référence casse l'appariement concurrent et le
// rapprochement fournisseur — silencieusement, des semaines plus tard.
//
// Une révision qui perd ou altère un élément protégé est donc REJETÉE par le moteur, pas
// proposée à la relecture humaine : sur des milliers de fiches, personne ne relit, et une
// file de propositions douteuses finit acceptée en bloc.
//
// ⚠ Les normalisations de référence et de code-barres sont RÉUTILISÉES de la veille
// tarifaire (`priceWatch/catalog/keys.ts`) plutôt que recopiées. Elles encodent des
// années de terrain — padding ERP divergent, GTIN-14 ramené à 13, codes-barres internes
// à l'enseigne — et une copie locale divergerait au premier correctif.
import { normalizeRef, normalizeEan } from '../priceWatch/catalog/keys'

export interface ProtectedOptions {
  /** Références et codes déclarés du produit (SKU, référence fournisseur, MPN…). */
  refs?: (string | null | undefined)[]
  /** Codes-barres déclarés. */
  eans?: (string | null | undefined)[]
  /** Marques à ne jamais traduire ni inventer. */
  brands?: (string | null | undefined)[]
  /**
   * SYNTHÈSE ASSUMÉE : ce champ doit être raccourci, on lève le contrôle de PÉRIMÈTRE.
   *
   * ⚠ Déclaré plan par plan, jamais par défaut. Une consigne comme « fais une synthèse
   * courte pour le nom du produit » demande exactement ce que la garde refuse — et sans
   * cette porte, ce plan-là serait rejeté toutes les nuits, sans rien écrire.
   *
   * ⚠ Ne lève QUE le périmètre. Une synthèse n'a pas plus le droit qu'une autre réécriture
   * de perdre la référence du produit, d'altérer une cote ou d'inventer une marque : ce
   * qu'elle garde doit rester exact.
   */
  allowSummary?: boolean
}

type ViolationKind =
  | 'ref-lost'      // une référence présente dans l'original a disparu ou changé
  | 'ean-lost'      // idem pour un code-barres
  | 'number-lost'   // une valeur chiffrée avec unité a disparu ou changé
  | 'brand-lost'    // une marque présente à l'origine a disparu
  | 'brand-added'   // une marque ABSENTE de l'origine a été ajoutée
  | 'code-lost'     // un code du TEXTE (modèle compatible, réf constructeur) a disparu
  | 'elision'       // la réécriture a abrégé : « … », « etc. », « et autres »

export interface Violation {
  kind: ViolationKind
  /** L'élément en cause, tel qu'il apparaissait dans l'original. */
  token: string
}

/**
 * Cote dimensionnelle avec unité : `510mm`, `12 V`, `1,5 kg`, `3.5L`.
 *
 * ⚠ On ne surveille QUE les nombres porteurs d'une unité. Surveiller tous les nombres
 * ferait rejeter des réécritures parfaitement légitimes — un « 3 » de « 3 lames » qui
 * devient « trois lames » n'altère aucune donnée, alors qu'un « 510 mm » devenu
 * « 51 cm » casse un filtre.
 */
const DIMENSION = /\b\d+(?:[.,]\d+)?\s?(?:mm|cm|m|km|l|ml|cl|kg|g|mg|v|w|kw|a|ah|mah|cc|cv|nm|bar|po|°c)\b/gi

/** Forme canonique d'une cote : sans espace, virgule décimale ramenée au point,
 *  minuscules. « 1,5 KG » et « 1.5kg » sont la même valeur. */
function normalizeDimension(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '').replace(',', '.')
}

/** Cotes présentes dans un texte, sous forme canonique et dédupliquées. */
function dimensionsOf(text: string): Set<string> {
  return new Set([...String(text ?? '').matchAll(DIMENSION)].map((m) => normalizeDimension(m[0])))
}

/**
 * Codes portés par le TEXTE : modèles compatibles (« MB 545.0 VE »), références
 * constructeur citées (« 0000-082-0413 »), codes article d'origine.
 *
 * ⚠⚠ Ce ne sont PAS les références déclarées du produit (`opts.refs`) : celles-là, on les
 * connaît. Ici on protège ce que la fiche ÉNUMÈRE — et c'est exactement ce que le modèle
 * abrège. Observé en prod : une liste de trente tondeuses compatibles rendue « MB 650.0
 * KS… », et le couple de références de fin purement et simplement disparu. Une liste de
 * compatibilité amputée est pire qu'absente : le client vérifie, ne trouve pas son modèle,
 * et n'achète pas.
 *
 * Retenu comme code : au moins 4 caractères et 2 chiffres, en alphanumérique et séparateurs.
 * Sous ce seuil on ne garde rien — « 3 mm », « MB 6.1 » ou une année seraient du bruit, et
 * les cotes sont déjà surveillées par `DIMENSION`.
 */
const CODE_TOKEN = /[A-Za-z0-9][A-Za-z0-9.\-/]*/g

function codesOf(text: string): string[] {
  const out = new Set<string>()
  const isDimension = new RegExp(`^${DIMENSION.source}$`, 'i')
  for (const m of String(text ?? '').matchAll(CODE_TOKEN)) {
    const core = m[0].replace(/^[.\-/]+|[.\-/]+$/g, '')
    if (core.length < 4) continue
    if ((core.match(/\d/g) ?? []).length < 2) continue
    // Une cote est déjà surveillée par `DIMENSION`, et avec une meilleure règle (« 1,5 kg »
    // et « 1.5kg » y sont la même valeur). La signaler deux fois brouillerait le motif.
    if (isDimension.test(core)) continue
    out.add(core)
  }
  return [...out]
}

/**
 * La réécriture a-t-elle ABRÉGÉ ? Les marques d'élision sont les mêmes dans toutes les
 * langues traitées ici, et elles ne sont fautives que si l'original ne les portait pas.
 */
const ELISION = /…|\.\.\.|\betc\b|\bet autres\b|\band others\b|\bu\.\s?a\.\b/i

/** Un texte contient-il cette référence, quelle que soit sa ponctuation ? On compare des
 *  formes normalisées, faute de quoi « 1134-4319-01 » et « 1134431901 » se liraient comme
 *  deux références différentes. */
function containsRef(text: string, ref: string): boolean {
  const target = normalizeRef(ref)
  if (!target) return true
  return normalizeRef(text).includes(target)
}

function containsEan(text: string, ean: string): boolean {
  const target = normalizeEan(ean)
  if (!target) return true
  return String(text ?? '').replace(/\D/g, '').includes(target)
}

/** Comparaison de marque insensible à la casse, aux accents et à la ponctuation :
 *  « Al-ko », « ALKO » et « al ko » désignent le même fabricant. */
function foldBrand(s: string): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/**
 * Ce que la réécriture a cassé. Tableau vide = elle peut être appliquée.
 *
 * Principe : on ne reproche jamais au texte réécrit ce que l'ORIGINAL ne contenait pas.
 * Une référence absente des deux côtés n'est pas une perte, et exiger sa présence
 * ferait rejeter des descriptions parfaitement valides qui n'ont jamais cité de code.
 * L'exception est la marque, où l'AJOUT est aussi grave que la perte : inventer un
 * fabricant absent de la source, c'est fabriquer de la donnée.
 *
 * ⚠⚠ `allowSummary` renverse la moitié de ce contrat, et il faut le dire clairement : un
 * champ déclaré « synthèse assumée » a le droit de TOUT écarter — références, cotes,
 * modèles, marque. Écarter est ce qu'on lui demande, et rien ne permet de distinguer
 * « 510 mm volontairement omis » de « 510 mm devenu 51 cm » sans comprendre le texte. Ne
 * subsiste donc que l'interdit qui ne dépend pas du périmètre : ne rien INVENTER.
 */
export function findViolations(before: string, after: string, opts: ProtectedOptions = {}): Violation[] {
  const out: Violation[] = []
  const src = String(before ?? '')
  const dst = String(after ?? '')
  const dstFolded = foldBrand(dst)
  const srcFolded = foldBrand(src)

  if (!opts.allowSummary) {
    for (const raw of opts.refs ?? []) {
      const ref = String(raw ?? '').trim()
      if (!ref || !containsRef(src, ref)) continue
      if (!containsRef(dst, ref)) out.push({ kind: 'ref-lost', token: ref })
    }

    for (const raw of opts.eans ?? []) {
      const ean = String(raw ?? '').trim()
      if (!ean || !containsEan(src, ean)) continue
      if (!containsEan(dst, ean)) out.push({ kind: 'ean-lost', token: ean })
    }

    // ⚠ Le PÉRIMÈTRE, pas seulement l'exactitude : tout code énuméré par l'original doit se
    // retrouver dans la réécriture. C'est la garde qui manquait — les références du produit
    // étaient protégées, la liste des modèles compatibles ne l'était pas.
    // Les références DÉCLARÉES sont déjà jugées au-dessus, sous leur propre motif : les
    // reprendre ici ferait dire deux fois la même chose à l'écran de refus.
    const declared = new Set(
      [...(opts.refs ?? []), ...(opts.eans ?? [])].map((r) => normalizeRef(String(r ?? ''))).filter(Boolean),
    )
    for (const code of codesOf(src)) {
      if (declared.has(normalizeRef(code))) continue
      if (!containsRef(dst, code)) out.push({ kind: 'code-lost', token: code })
    }

    if (!ELISION.test(src) && ELISION.test(dst)) {
      out.push({ kind: 'elision', token: (dst.match(ELISION) ?? [''])[0] })
    }

    const afterDims = dimensionsOf(dst)
    for (const dim of dimensionsOf(src)) {
      if (!afterDims.has(dim)) out.push({ kind: 'number-lost', token: dim })
    }

    for (const raw of opts.brands ?? []) {
      const brand = foldBrand(raw ?? '')
      if (brand && srcFolded.includes(brand) && !dstFolded.includes(brand)) {
        out.push({ kind: 'brand-lost', token: String(raw) })
      }
    }
  }

  // ⚠ HORS du garde : une synthèse écarte, elle n'invente pas. Fabriquer un fabricant
  // absent de la source reste interdit quel que soit le mode.
  for (const raw of opts.brands ?? []) {
    const brand = foldBrand(raw ?? '')
    if (!brand) continue
    if (!srcFolded.includes(brand) && dstFolded.includes(brand)) {
      out.push({ kind: 'brand-added', token: String(raw) })
    }
  }

  return out
}

/** Raccourci de décision : la révision peut-elle être appliquée telle quelle ? */
export function isSafeRevision(before: string, after: string, opts: ProtectedOptions = {}): boolean {
  return findViolations(before, after, opts).length === 0
}
