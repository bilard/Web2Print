/** Regex couvrant cookies, GDPR, reCAPTCHA, consent managers (FR + EN),
 *  et les éléments d'UI de sections avis (filtres, tri, pagination Bazaarvoice). */
const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|strictement\s+n[eé]cessaire|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all|aspsessionid[a-z]*|asp\.net|prestataire\s+de\s+traitement|dur[eé]e\s+de\s+conservation|finalit[eé]\s+du\s+traitement|statistique|analytique|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing)\b|s[eé]lectionnez\s+une?\s+ligne\s+ci-dessous\s+pour\s+filtrer|filtrer\s+les\s+avis|trier\s+les\s+avis|afficher\s+plus\s+de\s+filtres|\d+\s+à\s+\d+\s+sur\s+\d+\s+avis|avis\s+r[eé]gionaux|r[eé]gional\s+avis|lire\s+tous\s+les\s+avis|voir\s+tous\s+les\s+avis/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA) */
export function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text)
}

/** Renvoie true si > 30 % des lignes non-vides du texte sont du garbage. */
export function isMainlyGarbage(text: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 10)
  if (lines.length === 0) return false
  const garbageLines = lines.filter(l => GARBAGE_RE.test(l))
  // Si plus de 30% des lignes sont garbage → considérer comme parasite
  return garbageLines.length / lines.length > 0.3
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
