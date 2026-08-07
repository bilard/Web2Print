import type { EnrichedProduct, EnrichedSpec, EnrichedAdvantage, EnrichedDocument } from './types'
import { cleanDocumentName } from './documentUtils'
import { MEGA_SPEC_NAME_RE, splitMegaSpecValue } from './liftIdentity'
import { isGarbageContent, isMainlyGarbage } from '@/features/scraping/core/parsers/garbageFilter'
import { debugLog } from '@/lib/debugLog'
import { isJunkImageUrl } from './imageFilter'
import { sanitizeSpecPair } from '@/features/scraping/core/parsers/normalizeSpecPairs'

/**
 * Sanitization minimaliste appliquée à TOUTE EnrichedProduct au chargement
 * (fresh enrichissement OU rehydration depuis Firestore). Idempotent.
 *
 * Cible les patterns parasites issus du LLM qui passent à travers le filtrage
 * markdown :
 *  - description = navigation/footer du site (Nos services, Le blog, Aide & Contact)
 *  - description = métadonnées concaténées (Code commande RS:… Référence:…)
 *  - specs avec name = checkbox marker `- [x]` ou prose
 *  - specs avec value = pricing / UI button
 *  - specs avec group = nom de section H2 récupéré par erreur
 *  - advantages avec group = fragment ("ET avantages", "OU caractéristiques")
 *
 * Garantie : ne modifie jamais une donnée propre. Fonction pure et testable.
 */

const NAV_TERMS_RE = /(nos\s+services?|le\s+blog(?:\s*RS)?|aide\s*&\s*contact|mentions?\s+l[eé]gales?|politique\s+de\s+(?:confidentialit[eé]|cookies?|protection)|centre\s+d['’]aide|mon\s+compte|se\s+connecter|s['’]identifier|s['’]enregistrer|newsletter|carri[eè]re|contactez[\s-]nous|[àa]\s+propos|secteurs?\s+industriels?|suivez[\s-]nous|mon\s+panier|liste\s+de\s+souhaits|suivi\s+de\s+colis|voir\s+le\s+panier)/gi

const METADATA_LINE_RE = /^[^.]*?\b(code\s+commande|r[eé]f[eé]rence\s+fabricant|num[eé]ro\s+(de\s+)?(?:s[eé]rie|article)|sku|ean|gtin|code[\s-]?barres?)\s*:/i

const CHECKBOX_MARKER_RE = /^\s*[-*•]?\s*\[[xX✓✔ ]?\]\s*$/

const FRAGMENT_GROUP_RE = /^\s*(et|ou|and|or|&|\+)\s+\S/i

/** Sections de description H2 que le LLM utilise par erreur comme spec.group. */
const SECTION_AS_GROUP_RE = /^(caract[eé]ristiques?\s+et\s+avantages?|applications?|points?\s+forts?|features?|advantages?|d[eé]tail\s+produit|description|faq|questions?(\s+fr[eé]quentes?)?)$/i

export function isNavLikeDescription(text: string): boolean {
  if (!text || text.length < 20) return false
  const matches = text.match(NAV_TERMS_RE)
  if (matches && matches.length >= 2) return true
  if (matches && matches.length >= 1) {
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < 30) return true
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (lines.length > 0 && lines.every(l => METADATA_LINE_RE.test(l))) return true
  return false
}

function isJunkSpec(s: EnrichedSpec): boolean {
  const name = s.name?.trim() ?? ''
  const value = s.value?.trim() ?? ''
  if (!name) return true
  if (CHECKBOX_MARKER_RE.test(name)) return true
  // Quantity tier indicator (RS pricing : "1 +", "10 +", "100 +")
  if (/^\d+\s*\+\s*$/.test(name)) return true
  // Real spec names are 1-5 words, < 60 chars. Au-delà c'est de la prose.
  if (name.length > 60) return true
  if (/[.!?]$/.test(name) && name.length > 25) return true
  if (/^[•▪►▶]\s/.test(name) || /^[•▪►▶]\s/.test(value)) return true
  // Pricing leak (value contient seulement chiffres/séparateurs + devise)
  if (/^\s*[\d\s.,]+\s*[€$£]\s*$/.test(value)) return true
  // UI button leak
  if (/(cliquez\s+sur|v[eé]rifier\s+les|ajouter\s+au\s+panier)/i.test(value) && value.length > 30) return true
  // Group = nom de section description
  const groupClean = s.group?.replace(/^\*+|\*+$/g, '').trim()
  if (groupClean && SECTION_AS_GROUP_RE.test(groupClean)) return true
  return false
}

function cleanAdvantage(a: EnrichedAdvantage): EnrichedAdvantage {
  if (a.group && FRAGMENT_GROUP_RE.test(a.group)) {
    const { group: _g, ...rest } = a
    return rest
  }
  return a
}

/**
 * Applique l'ensemble des règles défensives sur un EnrichedProduct.
 * Idempotent — peut être appelé sur des données fraîchement enrichies ou
 * sur des données rechargées depuis Firestore (cas legacy avec données
 * polluées extraites avant le strip pré-LLM).
 */
export function sanitizeEnrichedProduct(product: EnrichedProduct): EnrichedProduct {
  let description = product.description ?? ''
  if (description && isNavLikeDescription(description)) description = ''

  // Nettoyage universel (crochet orphelin, libellé auto-répété dans la valeur)
  // AVANT le filtre junk — même sanitizer que la comparaison → fiche homogène.
  const specifications = (product.specifications ?? []).map(sanitizeSpecPair).filter(s => !isJunkSpec(s))
  const advantages = (product.advantages ?? []).map(cleanAdvantage)

  // Filtre les images junk au reload Firestore — couvre les données enregistrées
  // avant l'extension du filtre `isJunkImageUrl` (mégamenu Drupal Nicoll, etc.).
  const images = (product.images ?? []).filter(u => typeof u === 'string' && u.startsWith('http') && !isJunkImageUrl(u))

  return { ...product, description, specifications, advantages, images }
}

/**
 * Extrait le paragraphe en prose le plus long d'un markdown — utilisé en
 * fallback quand le LLM rend une description vide ou trop courte.
 *
 * Logique : on parcourt les paragraphes (séparés par lignes vides), on rejette
 * ceux qui contiennent des liens markdown, des bullets, des tables, des
 * métadonnées ou de la nav. On retourne le plus long ≥ 80 chars qui ressemble
 * à de la prose descriptive (commence par majuscule, contient au moins 2
 * phrases ou ≥ 100 chars).
 */
export function extractLongestProseParagraph(md: string): string {
  if (!md) return ''
  const paragraphs = md.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)

  const isProse = (p: string): boolean => {
    if (p.length < 80) return false
    if (p.startsWith('#') || p.startsWith('|') || p.startsWith('-') || p.startsWith('*')) return false
    if (/^[•▪►▶]/.test(p)) return false
    if (p.startsWith('!')) return false
    // URLs (tout protocole : http(s), protocol-relative `//`, file://, data:)
    if (/^(?:https?:\/\/|\/\/|file:|data:|javascript:|mailto:)/.test(p)) return false
    // Pas de markdown link au début (souvent des titles cliquables)
    if (/^\[/.test(p)) return false
    // Code/config technique (window.dataLayer, gtag, JSON, etc.)
    if (/^\s*(?:window\.|var\s+|let\s+|const\s+|function\s+|gtag|ga\s*\(|fbq\s*\(|\{\s*["@])/.test(p)) return false
    // Métadonnées concentrées (Code commande, Référence:, etc.)
    if (/^(code\s+commande|r[eé]f[eé]rence|sku|ean|gtin|brand|marque)\s*[:=]/i.test(p)) return false
    // Cookie / GDPR / privacy banner — souvent des paragraphes longs en
    // français qui ressemblent à de la prose mais sont du juridique.
    if (/\b(cookies?|privacy|recaptcha|consent|fonctionnalit[eé]s?\s+(?:du\s+)?site|exp[eé]rience\s+client|paramétrer|accepter|refuser|technologies\s+essentielles)\b/i.test(p)) return false
    // Heuristique anti-URL-soup : si plus de 30% du paragraphe est composé de
    // tokens URL/chemin (slashes, points, slugs hyphenés), ce n'est pas de la prose.
    const urlTokens = (p.match(/[a-z0-9-]+(?:[./][a-z0-9-]+){2,}/gi) ?? []).join('').length
    if (urlTokens / p.length > 0.3) return false
    // Doit ressembler à de la prose : commence par majuscule, contient un verbe
    // (heuristique : la 1re ligne contient un mot ≥ 5 chars).
    const firstLine = p.split('\n')[0]
    if (!/^[A-ZÀ-Ÿ]/.test(firstLine)) return false
    if (firstLine.length < 30 && !p.includes('\n')) return false
    // Ratio de mots français/alphabétiques sur le total. La prose contient
    // beaucoup de mots ; les blocs de code/URLs en contiennent peu.
    const words = p.match(/\b[a-zà-ÿ]{3,}\b/gi) ?? []
    if (words.length < 8) return false
    if (isNavLikeDescription(p)) return false
    return true
  }

  const candidates = paragraphs.filter(isProse)
  if (candidates.length === 0) return ''
  // Plus long en premier
  candidates.sort((a, b) => b.length - a.length)
  // Limite raisonnable (évite les blocs FAQ entiers)
  const longest = candidates[0]
  return longest.length > 2000 ? longest.slice(0, 2000) + '…' : longest
}

// ── Nettoyage de la fiche ENRICHIE (venu du moteur d'enrichissement) ─────────
//
// ⚠ Distinct de `sanitizeEnrichedProduct` plus haut, qui ne connaît que la fiche :
// celui-ci reçoit AUSSI les références du produit, ce qui lui permet d'écarter les
// documents qui portent le code d'un autre SKU de la gamme. Il s'appuie sur les mêmes
// filtres de contenu parasite (`garbageFilter`), d'où son déménagement ici.

/** Métiers/personae courants affichés sur les sites fabricants (menus "Mon profil"
 *  style Nicoll) — si une spec mappe deux items de cette liste, c'est un form
 *  de sélection de profil, pas une vraie caractéristique produit. */
const UI_PROFILE_TERMS_RE = /^(installateur|prescripteur|particulier|distributeur|retour|plombier|ma[çc]on|couvreur|charpentier|carreleur|paysagiste|bureau\s+d['’]?\s*[eé]tudes?|architecte|constructeur|promoteur|ma[îi]tre\s+d['’]?\s*ouvrage|responsable\s+de\s+maintenance|nicoll\s+pour|votre\s+profil|ouvrir\s+la\s+recherche|fermer\s+la\s+recherche|affinez|mon\s+compte|se\s+connecter|s['’]?\s*inscrire|menu|recherche|retour\s+(en\s+)?haut)/i

/** Labels financiers / commerciaux / génériques qui ne sont pas des fiches
 *  produit : rejetés quand ils apparaissent comme labels de PDF. */
const GENERIC_DOC_LABEL_RE = /\b(cgv|cgu|mentions\s+l[eé]gales|politique|privacy|tarif|tarifs|price\s*list|catalogue\s*(g[eé]n[eé]ral|complet)?|newsletter|guide\s+(d['’]utilisation|utilisateur|installation)?|faq|mode\s+d['’]emploi\s+g[eé]n[eé]ral|declaration\s+(marque|produit)|fiche\s+s[eé]curit[eé]|msds|sds|plan\s+de\s+masse|garantie\s+g[eé]n[eé]rale|formation|pr[eé]sentation\s+(?:entreprise|soci[eé]t[eé])|rapport\s+(?:annuel|rse)|communiqu[eé])/i

/** Filtre documents par référence produit — approche prudente :
 *  - TOUJOURS garder les docs sans code-produit identifiable (déclarations CE,
 *    fact-tags, manuels génériques API-générés — ils décrivent le produit courant).
 *  - REJETER UNIQUEMENT les docs qui contiennent un code-produit différent du
 *    produit cible (ex: "FT dr101ch" quand la référence est "DR100CH" — l'URL/
 *    label pointe vers un autre SKU de la gamme).
 *  - Rejeter les labels clairement génériques (CGV, tarif, newsletter…).
 */
function filterDocumentsByProductRef(
  documents: EnrichedDocument[],
  productIds: string[],
): EnrichedDocument[] {
  const targetTokens = Array.from(new Set(
    productIds
      .flatMap((id) => id.toLowerCase().split(/[\s\-_/.,]+/))
      .filter((t) => t.length >= 4 && /[a-z0-9]/i.test(t))
  ))
  // Pattern d'un code-produit dans un label/URL : alphanum 4-12 chars avec
  // chiffre (ex: "dr100ch", "fpd3502x", "duh752z"). Ignore les timestamps purs.
  const PRODUCT_CODE_RE = /\b([a-z]{1,5}\d[a-z0-9]{2,10}|\d[a-z]{1,5}\d{1,6}[a-z]{0,4})\b/gi
  const rejected: EnrichedDocument[] = []
  const kept: EnrichedDocument[] = []
  for (const doc of documents) {
    const label = doc.name.toLowerCase()
    const url = doc.url.toLowerCase()
    const filename = (doc.filename || '').toLowerCase()

    // GENERIC_DOC_LABEL_RE est un filtre "anti-doc-marketing" (cgv, tarif,
    // catalogue, mentions légales…). On le teste sur le filename URL plutôt
    // que sur le label : depuis qu'on injecte le titre Jina (ex: "Tarif 2026")
    // dans `doc.name`, beaucoup de fiches techniques légitimes hébergées sous
    // un nom URL spécifique se faisaient rejeter à tort sur le titre marketing
    // de la page. Le filename URL est l'identifiant stable.
    const genericProbe = filename || label
    if (GENERIC_DOC_LABEL_RE.test(genericProbe)) { rejected.push(doc); continue }

    // Chercher les codes produit dans le label + URL (pas les queries longues).
    // Se limiter au label + fragment final de l'URL (basename) pour éviter
    // qu'un id interne (v=1725889503000) déclenche le rejet.
    const urlTail = url.split(/[?#]/)[0].split('/').pop() ?? ''
    const codePool = `${label} ${urlTail}`
    const codes = Array.from(codePool.matchAll(PRODUCT_CODE_RE)).map((m) => m[0].toLowerCase())

    if (codes.length === 0) {
      // Pas de code-produit détecté → document générique (déclaration, fact-tag
      // API, manuel) → on garde.
      kept.push(doc); continue
    }
    // Si le doc exhibe un code produit, il doit correspondre à notre cible.
    if (targetTokens.length > 0 && codes.every((c) => !targetTokens.some((t) => c === t || c.includes(t) || t.includes(c)))) {
      // Tous les codes pointent vers d'autres produits → rejet.
      rejected.push(doc); continue
    }
    // Au moins un code matche (ou pas de token cible → on est indulgent).
    kept.push(doc)
  }
  if (rejected.length > 0) {
    debugLog('[sanitize] filterDocumentsByProductRef: kept', kept.length, '/ rejected', rejected.length, '(other-SKU or generic)')
  }
  return kept
}


// ── Lift identité depuis specs / structuredData / markdown ──────────────────
// Les identifiants (nom, marque, modèle, refs distributeur/fabricant, EAN)
// arrivent par 3 canaux selon le site/scraping :
//   1. JSON-LD Schema.org (parseStructuredDataAny) → name/brand/sku/mpn/gtin
//   2. Specs parsées depuis le markdown (KEY/VALUE)
//      → chips Rubix-style "BOSCH : GBH 5-40 DCE", "RUBIX : 0136-5035407",
//        "FABRICANT : 0611264000", "EAN : 3165140461214"
//   3. Markdown H1 (fallback quand JSON-LD absent)
// Cette fonction promeut ces signaux en champs distincts d'EnrichedProduct
// pour qu'ils apparaissent comme colonnes Excel séparées (ai_name, ai_brand,
// ai_model, ai_distributor_ref, ai_manufacturer_ref, ai_ean) plutôt que

export function sanitizeEnriched(enriched: EnrichedProduct, productIds: string[] = []): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long) ou du nav/footer
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    debugLog('[sanitize] garbage description detected, clearing')
    description = ''
  }
  if (description && isNavLikeDescription(description)) {
    debugLog('[sanitize] nav/footer description detected, clearing')
    description = ''
  }
  // Description : retirer les lignes qui sont des listes de téléchargements
  // (format "Label | https://..." ou "Label ## https://..." — PDF, fact-tag,
  // partlist…). Ce sont des documents mal injectés, pas du marketing.
  if (description) {
    const cleaned = description
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim()
        if (!t) return true
        // Rejet : ligne contenant une URL + séparateur ou juste une URL
        if (/\s[|#]{1,2}\s*https?:\/\//.test(t)) return false
        if (/https?:\/\/\S+/.test(t)) return false
        // Ligne-image markdown résiduelle (« !Farelek Télécommande… ») et
        // boilerplate ligne à ligne (galerie, réassurance enseigne, CGV) :
        // la synthèse LLM recopie parfois ces lignes autour du vrai paragraphe.
        if (t.startsWith('!')) return false
        if (isGarbageContent(t)) return false
        return true
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (cleaned !== description) {
      debugLog('[sanitize] stripped document/URL lines from description')
      description = cleaned
    }
  }

  // Documents : nettoyer les noms + filtrer par référence produit (retire
  // CGV, tarifs, fiches d'autres produits de la gamme).
  const cleanedDocs = enriched.documents.map(doc => cleanDocumentName(doc))
  const documents = filterDocumentsByProductRef(cleanedDocs, productIds)

  // Groupes entiers à rejeter : sections cookies-banner, widgets UI.
  const JUNK_GROUP_RE = /^(strictement\s+n[eé]cessaire|fonctionnel|statistique|analytique|performance|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing|technologie|articles?\s*:\s*\d+|fournisseur|general\s+power\s+tool\s+safety\s+warnings?|s[eé]curit[eé]\s+de\s+la\s+zone\s+de\s+travail|electrical\s+safety|personal\s+safety|work\s+area\s+safety|produits?\s*à\s*comparer|trouver\s+(vos\s+)?(pi[eè]ces?|parts?)|find\s+parts?\s+for)$/i
  // Specs : rejeter les paires qui mappent deux items de profil/navigation
  // UI (Nicoll "Installateur | Prescripteur", "Plombier | Maçon", etc.),
  // les cookies banner (name="Expiration", value="un an"), et les safety
  // warnings (textes multi-lignes du type "Do not operate power tools…").
  const SAFETY_TEXT_RE = /\b(power\s+tool|ne\s+pas\s+utiliser|earthed|grounded|unmodified\s+plug|electric\s+shock|lose\s+control|flammable|incendie|explosive\s+atmosphere|keep\s+work\s+area|stay\s+alert|personal\s+protective|dust\s+mask|hearing\s+protection|punho\s+adicional|ferramenta\s+el[eé]trica|sendo\s+cancer[íi]genos|preservadores\s+de\s+madeira)/i
  const COOKIE_LABEL_RE = /^(expiration|dur[eé]e|finalit[eé]|nom|prestataire|fournisseur)$/i
  /** Lignes d'en-tête de table dupliquées entre sections : "Valeur",
   *  "*Valeur*", "Caractéristique", "_Description_"… — souvent recopiées
   *  par le scraping quand la même table d'en-tête est répétée pour chaque
   *  sous-section. Une spec dont le name OU la value matche ce pattern est
   *  un parasite, peu importe la décoration markdown autour. */
  const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé])[\s*_]*$/i
  /** Nom entièrement entre crochets `[...]` sans contenu informatif (titre de
   *  section dupliqué dans les paires de table). */
  const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/
  /** Names résiduels de checkboxes facettes après le strip markdown :
   *  "- [x]", "[x]", "* [ ]", "[]". Si le LLM avale quand-même une de ces
   *  paires, le `name` ressemble à un marqueur de checkbox sans contenu. */
  const CHECKBOX_MARKER_RE = /^\s*[-*•]?\s*\[[xX✓✔ ]?\]\s*$/
  // Pré-passe : re-découper les méga-specs « Caractéristiques = toute la table
  // inline » (sortie LLM dégradée) en paires individuelles — les paires issues
  // du découpage repassent ensuite par TOUS les filtres ci-dessous.
  const preSpecs: EnrichedProduct['specifications'] = []
  for (const s of enriched.specifications) {
    if (MEGA_SPEC_NAME_RE.test(s.name.trim())) {
      const split = splitMegaSpecValue(s.value)
      if (split.length >= 3) {
        debugLog('[sanitize] mega-spec «', s.name, '» re-découpée en', split.length, 'paires')
        preSpecs.push(...split.map((p) => ({ ...p, group: s.group })))
        continue
      }
    }
    preSpecs.push(s)
  }

  const keptSpecs: EnrichedProduct['specifications'] = []
  const rejectedSpecs: EnrichedProduct['specifications'] = []
  for (const s of preSpecs) {
    // Sentinelles internes recrachées par le LLM : jamais une spec.
    if (/JINA_EXTRACTED_/.test(s.name) || /JINA_EXTRACTED_/.test(s.value)) { rejectedSpecs.push(s); continue }
    if (isGarbageContent(s.name) || isGarbageContent(s.value)) { rejectedSpecs.push(s); continue }
    if (s.group && JUNK_GROUP_RE.test(s.group.trim())) { rejectedSpecs.push(s); continue }
    // Lignes d'en-tête de table parasites : "Valeur", "*Valeur*",
    // "Caractéristique"… — une spec dont la value ou le name est un placeholder
    // n'apporte aucune info produit.
    if (PLACEHOLDER_HEADER_RE.test(s.value) || PLACEHOLDER_HEADER_RE.test(s.name)) {
      rejectedSpecs.push(s); continue
    }
    if (BRACKETED_HEADER_RE.test(s.name)) {
      rejectedSpecs.push(s); continue
    }
    // Checkboxes facettes ("- [x]", "[x]") — name vide de sens, value = chip UI
    if (CHECKBOX_MARKER_RE.test(s.name) || !s.name.trim()) {
      rejectedSpecs.push(s); continue
    }
    // Liens markdown splittés : `[Texte](https` côté name + `//www....html)` côté value.
    // Vient des menus de navigation aspirés par Jina avec URLs splittées sur 2 lignes.
    // S'applique APRÈS toutes les autres extractions (LLM, manufacturer build,
    // markdown parser) — dernière ligne de défense indépendante du chemin.
    if (s.name.includes('](') || s.value.includes('](')) {
      rejectedSpecs.push(s); continue
    }
    if (/^\/\/[a-z0-9]/i.test(s.value.trim())) {
      rejectedSpecs.push(s); continue
    }
    if (/\.(html?|php|asp|aspx|jsp)\)?\s*$/i.test(s.value.trim())) {
      rejectedSpecs.push(s); continue
    }
    // Specs prose : name est une phrase complète ou trop longue → ce sont
    // des bullets de "Caractéristiques et avantages" / "Applications" / FAQ
    // que le LLM a paire en faux specs.
    const nameTrimmed = s.name.trim()
    const valueTrimmed = s.value.trim()
    // Quantity tier (pricing) : "1 +", "10 +", "100 +"
    if (/^\d+\s*\+\s*$/.test(nameTrimmed)) { rejectedSpecs.push(s); continue }
    if (nameTrimmed.length > 60) { rejectedSpecs.push(s); continue }
    if (/[.!?]$/.test(nameTrimmed) && nameTrimmed.length > 25) {
      rejectedSpecs.push(s); continue
    }
    // Bullet leak : valeur préfixée par puce typographique
    if (/^[•▪►▶]\s/.test(valueTrimmed) || /^[•▪►▶]\s/.test(nameTrimmed)) {
      rejectedSpecs.push(s); continue
    }
    // Pricing leak : valeur ne contient que chiffres/séparateurs + devise
    if (/^\s*[\d\s.,]+\s*[€$£]\s*$/.test(valueTrimmed)) {
      rejectedSpecs.push(s); continue
    }
    // UI button leak : "Cliquez sur …" / "Vérifier les …"
    if (/(cliquez\s+sur|v[eé]rifier\s+les|ajouter\s+au\s+panier)/i.test(valueTrimmed) && valueTrimmed.length > 30) {
      rejectedSpecs.push(s); continue
    }
    // Group avec markdown bold leakage (`**...**`) + section avantages : c'est
    // pas un spec group, c'est un H2 du markdown que le LLM a recyclé.
    const groupClean = s.group?.replace(/^\*+|\*+$/g, '').trim()
    if (groupClean && /^(caract[eé]ristiques?\s+et\s+avantages?|applications?|points?\s+forts?|features?|advantages?|d[eé]tail\s+produit|description|faq|questions?(\s+fr[eé]quentes?)?)$/i.test(groupClean)) {
      rejectedSpecs.push(s); continue
    }
    const bothProfile = UI_PROFILE_TERMS_RE.test(s.name) && UI_PROFILE_TERMS_RE.test(s.value)
    const nameIsProfile = UI_PROFILE_TERMS_RE.test(s.name) && s.value.length < 60
    if (bothProfile || nameIsProfile) { rejectedSpecs.push(s); continue }
    // Paires cookies-banner : clé = "Expiration/Finalité/Nom/Prestataire", valeur courte.
    if (COOKIE_LABEL_RE.test(s.name.replace(/^\*\s*/, '').trim()) && s.value.length < 80) {
      rejectedSpecs.push(s); continue
    }
    // Safety warnings : valeur > 60 chars ET le texte ressemble à un extrait de
    // manuel (anglais / portugais avec vocabulaire sécurité).
    if (s.value.length > 60 && SAFETY_TEXT_RE.test(`${s.name} ${s.value}`)) {
      rejectedSpecs.push(s); continue
    }
    keptSpecs.push(s)
  }
  // Safety net : si ≥50% des specs contiennent du vocabulaire safety/manuel,
  // l'extraction a récupéré un manuel PDF, pas les vraies specs → tout jeter.
  const safetyHits = keptSpecs.filter((s) => SAFETY_TEXT_RE.test(`${s.name} ${s.value}`)).length
  let finalKept = keptSpecs
  if (keptSpecs.length >= 10 && safetyHits / keptSpecs.length >= 0.5) {
    debugLog('[sanitize] ⚠ dropping ALL', keptSpecs.length, 'specs — manual/safety content (', safetyHits, 'hits)')
    finalKept = []
  }
  if (rejectedSpecs.length > 0 || finalKept.length < keptSpecs.length) {
    debugLog('[sanitize] filtered', rejectedSpecs.length + (keptSpecs.length - finalKept.length), 'junk specs; kept', finalKept.length)
    debugLog('[sanitize] REJECTED specs (sample 20):', rejectedSpecs.slice(0, 20).map(s => ({ name: s.name.slice(0, 40), value: s.value.slice(0, 40), group: s.group })))
    debugLog('[sanitize] KEPT specs:', finalKept.map(s => ({ name: s.name, value: s.value.slice(0, 60), group: s.group })))
  }

  // Avantages : nettoyer les noms de groupes fragments ("ET avantages",
  // "OU caractéristiques") qui sont des coupures de titre du genre
  // "Points forts ET avantages" — le LLM coupe à "ET" et le reste devient un
  // group label inutile. On les drop pour repasser ungrouped.
  const FRAGMENT_GROUP_RE = /^\s*(et|ou|and|or|&|\+)\s+\S/i
  const cleanedAdvantages = enriched.advantages
    .filter(a => !isGarbageContent(a.text) && !SAFETY_TEXT_RE.test(a.text))
    .map(a => {
      if (a.group && FRAGMENT_GROUP_RE.test(a.group)) {
        const { group: _g, ...rest } = a
        return rest
      }
      return a
    })

  return {
    ...enriched,
    description,
    documents,
    advantages: cleanedAdvantages,
    specifications: finalKept,
  }
}
