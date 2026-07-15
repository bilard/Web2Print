/** Regex couvrant cookies, GDPR, reCAPTCHA, consent managers (FR + EN),
 *  et les éléments d'UI de sections avis (filtres, tri, pagination Bazaarvoice). */
const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|strictement\s+n[eé]cessaire|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all|aspsessionid[a-z]*|asp\.net|prestataire\s+de\s+traitement|dur[eé]e\s+de\s+conservation|finalit[eé]\s+du\s+traitement|statistique|analytique|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing)\b|s[eé]lectionnez\s+une?\s+ligne\s+ci-dessous\s+pour\s+filtrer|filtrer\s+les\s+avis|trier\s+les\s+avis|afficher\s+plus\s+de\s+filtres|\d+\s+à\s+\d+\s+sur\s+\d+\s+avis|avis\s+r[eé]gionaux|r[eé]gional\s+avis|lire\s+tous\s+les\s+avis|voir\s+tous\s+les\s+avis/i

/** Prose JURIDIQUE (CGV/garantie légale), UI compte/checkout (Magento),
 *  newsletter et placeholders de template non résolus
 *  (« country_language__other », « country_name_ ») — jamais du contenu
 *  produit. Fixture réelle Trafic : l'onglet Garantie déplié devenait LA
 *  description, l'UI de login polluait avantages/description. Signal par
 *  vocabulaire/motif générique, jamais par site. */
const LEGAL_ACCOUNT_RE = /d[eé]faut\s+de\s+conformit[eé]|lettre\s+recommand[eé]e|sous\s+peine\s+d|r[eé]serve\s+de\s+propri[eé]t[eé]|droit\s+de\s+r[eé]tractation|conditions\s+g[eé]n[eé]rales\s+de\s+(?:vente|location)|identifiant\s+unique\s+\(idu\)|cr[eé]ation\s+d.{0,3}un\s+compte|commander\s+en\s+(?:tant\s+que|utilisant)|mot\s+de\s+passe|inscrivez[- ]vous|d[eé]sinscri|newsletter|\b[a-z]+__[a-z]+\b|\b[a-z]+_[a-z]+_(?![a-z0-9])/i

/** Réassurance ENSEIGNE (« Nos 4 promesses », « Laissez-vous séduire »…) et
 *  boilerplate de galerie Magento (« Skip to the beginning of the images
 *  gallery ») : vocabulaire marketing du MAGASIN — jamais du produit. Fixture
 *  réelle Trafic : la synthèse LLM les recrachait en avantages/description. */
const STORE_REASSURANCE_RE = /laissez-vous\s+s[eé]duire|choix\s+impressionnant|collections\s+exclusives|meilleurs\s+prix\s+garantis|exp[eé]rience\s+chaleureuse|qualit[eé]\s+test[eé]e\s+et\s+valid[eé]e|nos\s+\d+\s+promesses|skip\s+to\s+the\s+(?:beginning|end)\s+of\s+the\s+images\s+gallery|indice\s+de\s+r[eé]parabilit[eé]|cet\s+indice\s+permet|capacit[eé]\s+[àa]\s+r[eé]parer\s+un\s+produit|reprise\s+des\s+produits|paiement\s+100\s*%?\s*s[eé]curis|satisfait\s+ou\s+rembours|\d+x\s*,?\s*\d*x?\s*sans\s+frais|offres?\s+partenaires?/i

/** PIED DE PAGE / mentions légales / newsletter / infos société (Trafic/Magento) :
 *  « M'abonner », « TVA / n° FR08383139458 / BE 0866517727 », raison sociale
 *  (S.A., SARL, SAS…), adresses postales, nav (« Accès rapide », « Plus
 *  d'information »), réassurance (« Faites confiance »). GÉNÉRIQUE — signaux de
 *  footer société, jamais de description produit. Sans lui, le parseur PIM
 *  choisissait le footer comme description sur la démo. */
const FOOTER_COMPANY_RE = /m['’]abonner|s['’]abonner|abonnez[- ]vous|\bTVA\b|num[eé]ro\s+de\s+tva|\b(?:FR|BE|LU|NL|DE|IT|ES|CH)\s?\d{9,12}\b|\bRCS\b|\bSIRE[NT]\b|\bS\.A\.(?:S\.?)?\b|\bSARL\b|\bSASU?\b|\bEURL\b|acc[eè]s\s+rapide|plus\s+d['’]informations?|faites\s+confiance|\b\d{4,5}\s+[A-ZÀ-Ÿ][a-zà-ÿ]{2,}[^\n]{0,40}\b(?:France|Belgique|Belgium|Luxembourg|Suisse|Nederland|Deutschland|España|Italia)\b/i

/** UI LIVRAISON / STOCK / DISPONIBILITÉ (widgets e-commerce, GÉNÉRIQUE) :
 *  « En rupture en ligne », « Livré à domicile en 2 à 5 jours ouvrés »,
 *  « Vérifier le stock du magasin », « Me tenir informé(e) », « Retrait gratuit
 *  en magasin », « Livraison à domicile (19.99€) ». Interleavé après la vraie
 *  description sur les fiches retail (Trafic/Magento). Jamais de la description. */
const DELIVERY_STOCK_RE = /en\s+rupture|rupture\s+en\s+ligne|\ben\s+stock\b|livr[eé]e?\s+(?:à\s+)?(?:domicile|en\s+magasin)|livraison\s+(?:à\s+domicile|en\s+magasin|gratuite?|standard|express|estim[eé]e)|v[eé]rifier\s+le\s+stock|stock\s+(?:du|en|au|magasin)|rest[eé]z\s+inform|me\s+tenir\s+inform|tenez[- ]moi\s+inform|inform[eé]\(e\)|retrait[^\n]{0,18}magasin|jours\s+ouvr[eé]s|click\s*(?:&|and|et)?\s*collect|disponibilit[eé]\b|ajouter\s+au\s+panier/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA,
 *  prose CGV, UI compte client, footer société, UI livraison/stock, placeholder). */
export function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text) || LEGAL_ACCOUNT_RE.test(text) || STORE_REASSURANCE_RE.test(text)
    || FOOTER_COMPANY_RE.test(text) || DELIVERY_STOCK_RE.test(text)
}

/** Renvoie true si > 30 % des lignes non-vides du texte sont du garbage. */
export function isMainlyGarbage(text: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 10)
  if (lines.length === 0) return false
  const garbageLines = lines.filter(l => GARBAGE_RE.test(l))
  // Si plus de 30% des lignes sont garbage → considérer comme parasite
  return garbageLines.length / lines.length > 0.3
}

/**
 * Paire nom/valeur de SPEC issue de l'UI d'un bandeau cookies/CMP (OneTrust :
 * « Filter Button = ConsentLeg.Interest », « Confirm My Choices = Allow All »,
 * « checkbox labellabel »…) ou d'un CTA de navigation (« Voir toute la
 * gamme ») — poison des fiches quand une page non-produit passe dans le
 * moteur. Signal par VOCABULAIRE CMP/structure, jamais par site.
 */
const CMP_PAIR_RE = /\b(leg\.?\s?interest|allow all|confirm my choices|filter button|checkbox ?label|manage (my )?choices|do not sell|iab tcf|vendors? list)\b/i
export function isCmpUiPair(name: string, value: string): boolean {
  const n = name.trim()
  const v = value.trim()
  if (n && v && n.toLowerCase() === v.toLowerCase()) return true // libellé UI dupliqué de part et d'autre
  if (CMP_PAIR_RE.test(n) || CMP_PAIR_RE.test(v)) return true
  if (isGarbageContent(n) || isGarbageContent(v)) return true
  if (/^voir (toute?s?|la|les|nos)\b/i.test(n)) return true // CTA de navigation pris pour un nom de spec
  return false
}

/** Ligne de note d'avis client : « 5/5 », « 4,5/5 », « 5/5 5/5 »… seule sur sa ligne. */
const RATING_LINE_RE = /^\s*(?:\d(?:[.,]\d)?\s*\/\s*5\s*)+$/

/** Ligne de signature d'avis : « Steffan M. », « Marie-Claude D. » (prénom + initiale). */
const REVIEWER_LINE_RE = /^[A-ZÀ-Ÿ][\p{L}’'-]+(?:\s+[A-ZÀ-Ÿ][\p{L}’'-]+)?\s+[A-ZÀ-Ÿ]\.?$/u

/**
 * Retire les BLOCS d'avis client d'un markdown : la ligne de note (« 5/5 »),
 * la signature courte qui la précède (« Steffan M. ») et le paragraphe de
 * témoignage qui la suit — poison récurrent des parsers (le témoignage passe
 * tous les filtres prose et devient description ou avantage). Signal par
 * STRUCTURE (marqueur de note), jamais par site ; un markdown sans note
 * ressort strictement inchangé.
 */
export function stripReviewBlocks(md: string): string {
  const lines = md.split('\n')
  const drop = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (!RATING_LINE_RE.test(lines[i])) continue
    drop.add(i)
    // Signature au-dessus — uniquement si elle a la FORME d'un nom d'avis.
    let j = i - 1
    while (j >= 0 && !lines[j].trim()) j--
    if (j >= 0 && REVIEWER_LINE_RE.test(lines[j].trim())) drop.add(j)
    // Témoignage : le paragraphe qui suit la note (jusqu'à la ligne vide).
    let k = i + 1
    while (k < lines.length && !lines[k].trim()) k++
    while (k < lines.length && lines[k].trim() && !/^#/.test(lines[k].trim())) { drop.add(k); k++ }
  }
  if (drop.size === 0) return md
  return lines.filter((_, idx) => !drop.has(idx)).join('\n')
}
