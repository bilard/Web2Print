/** Regex couvrant cookies, GDPR, reCAPTCHA, consent managers (FR + EN). */
const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|strictement\s+n[eé]cessaire|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all|aspsessionid[a-z]*|asp\.net|prestataire\s+de\s+traitement|dur[eé]e\s+de\s+conservation|finalit[eé]\s+du\s+traitement|statistique|analytique|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing)\b/i

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
