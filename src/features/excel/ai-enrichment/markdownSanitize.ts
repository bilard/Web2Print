/**
 * Détection universelle de pages CAPTCHA / bot challenge (DataDome, Akamai
 * Bot Manager, Cloudflare, Imperva, hCaptcha, reCAPTCHA…).
 *
 * Quand un site détecte un scraper, il sert une page de vérification dont le
 * texte ressemble à de la prose et déjoue les heuristiques `extractLongestProseParagraph`.
 * Cette fonction reconnaît les phrases caractéristiques de ces pages pour
 * forcer un fallback (Firecrawl ou abandon propre) avant que le LLM ingère
 * le contenu pollué.
 *
 * Approche : compte les signaux distinctifs (≥ 2 hits = challenge confirmé).
 * Évite le faux positif sur un produit qui parlerait d'authentification ou
 * de captcha en passant.
 */
export function looksLikeBotChallenge(md: string): boolean {
  if (!md || md.length < 30) return false
  const sample = md.slice(0, 4000).toLowerCase()

  // Signaux FORTS : 1 seul match suffit (textes très spécifiques aux pages
  // anti-bot, jamais présents dans une vraie fiche produit).
  const strongSignals = [
    /\bvarious possible explanations for this\b/,         // DataDome boilerplate
    /\bclicking play.{0,30}you will hear/,                // DataDome audio CAPTCHA
    /\bbrowsing and clicking at a speed much faster\b/,   // DataDome
    /\bis preventing javascript from working on your computer\b/, // DataDome
    /\brobot on the same network\b/,                      // DataDome
    /\bcaptcha-delivery\.com\b/,                          // DataDome host
    /\bdatadome\b/,
    /\bcf-browser-verification\b/,                        // Cloudflare
    /\bcdn-cgi\/challenge-platform\b/,                    // Cloudflare
    /\bjs_challenge\b/,                                   // Cloudflare
    /\bsorry,?\s+you have been blocked\b/,                // Generic
    /\byou have been blocked\b/,                          // Generic
    /\bplease enable js and disable any ad blocker\b/,    // DataDome cmsg
    /\bwe want to make sure\b.{0,80}\bnot a robot\b/,
    /\bnous voulons (?:nous )?assurer.{0,80}(?:robot|humain)/,
    /\bcette v[eé]rification est requise\b/,
  ]
  for (const re of strongSignals) {
    if (re.test(sample)) return true
  }

  // Signaux FAIBLES : 2+ matches nécessaires (mots qui peuvent apparaître
  // dans une vraie fiche produit en passant).
  const weakSignals = [
    /\bnot a robot\b/,
    /\baren'?t a robot\b/,
    /\bare you (?:a )?human\b/,
    /\baudio verification\b/,
    /\bvisual verification\b/,
    /\b(?:re)?captcha\b/,
    /\bhuman verification\b/,
    /\bsecurity check\b.{0,80}(?:browser|verify)/,
    /\bcomplete the (?:verification|challenge)\b/,
    /\bunusual (?:traffic|activity)\b/,
    /\bvotre navigateur.{0,30}(?:doit|requiert)\b/,
    /\bsuspicious activity\b/,
    /\baccess (?:denied|forbidden)\b/,
  ]
  let hits = 0
  for (const re of weakSignals) {
    if (re.test(sample)) hits++
    if (hits >= 2) return true
  }
  return false
}

/**
 * Nettoie le markdown brut renvoyé par Jina Reader avant de l'envoyer au LLM
 * d'enrichissement. Cible les patterns parasites communs aux sites e-commerce
 * B2B (RS Components, Conrad, Distrelec, Reichelt, Würth…) :
 *
 *  - Cookies / GDPR / consent banners
 *  - Filtres facettes (`- [x] Marque Makita`)
 *  - Liens de navigation top (`[Nos services](url)[Le blog](url)…`)
 *  - Colonnes checkbox dans les tables specs (`| - [x] | Marque | Makita |`)
 *  - Tables de pricing (`| Unité | Prix par unité | / | 1 + | 449€ |`)
 *  - Boutons UI (Comparer, Ajouter à une liste, Voir la catégorie…)
 *  - Catalogue menu listings (≥4 bullets de liens consécutifs)
 *  - Footer marketing (Nos clients ont également consulté, suggestions…)
 *  - Préambule Jina (`Title:`, `URL Source:`, `Markdown Content:`)
 *
 * Pure function : entrée raw markdown → sortie markdown nettoyé.
 * Aucune classification IA, aucun fetch — testable unitairement.
 */
export function sanitizeJinaMarkdown(raw: string): string {
  let md = raw

  // 1. Sections cookie / GDPR / consent banner
  md = md
    .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences|Nous respectons votre vie priv[eé]e|Param[eè]tres?\s+de\s+confidentialit[eé]|Vos\s+pr[eé]f[eé]rences?\s+(?:de\s+)?cookies?)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
    .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
  // Strip lignes Q/R cookie banner standalones (sans heading parent) :
  // "Est-ce indispensable ?" / "Pourquoi ces cookies ?" + paragraphe explicatif
  md = md.replace(/^[*_]*(?:est[\s-]ce\s+(?:indispensable|n[eé]cessaire)|pourquoi\s+(?:ces|les)\s+cookies?|qu['']?est[\s-]?ce\s+qu['']?un\s+cookie|que\s+sont\s+les\s+cookies?)[\s?*_]*$/gim, '')
  // Strip phrases types cookie banner (avec mots-clés discriminants).
  md = md.replace(/^.{0,40}(?:nous\s+(?:utilisons|stockons)\s+(?:des|les)\s+cookies|n[eé]cessitent?\s+votre\s+accord|limiter\s+certaines\s+fonctionnalit[eé]s?|finalit[eé]s?\s+de\s+(?:traitement|consentement)|d[eé]p[oô]t\s+de\s+cookies?|partenaires?\s+(?:peuvent|utilisent)\s+(?:des|ces)\s+cookies?).{0,200}$/gim, '')

  // 2. Filtres facettes / checkboxes UI : "- [x] Texte" sur une ligne entière
  md = md.replace(/^[-*•]?\s*\[[xX✓✔ ]?\]\s+.*$/gm, '')

  // 3. Navigation top : liens markdown adjacents `[Term](url)[Term](url)…`
  const NAV_LINK_TERMS = '(?:Nos\\s+services?|Le\\s+blog(?:\\s+RS)?|Aide\\s*&\\s*Contact|Secteurs?\\s+industriels?|Mentions?\\s+l[eé]gales?|Politique[\\s\\S]{0,30}cookies?|Centre\\s+d[\'’]aide|Mon\\s+compte|Se\\s+connecter|S[\'’]identifier|S[\'’]enregistrer|Suivi\\s+de\\s+colis|Voir\\s+le\\s+panier|Newsletter|Carri[eè]re|Contactez[\\s-]nous|[ÀA]\\s+propos|Suivez[\\s-]nous|Mon\\s+panier|Liste\\s+de\\s+souhaits)'
  md = md.replace(new RegExp(`(?:\\[${NAV_LINK_TERMS}\\]\\([^)]*\\))+`, 'gi'), '')
  md = md.replace(new RegExp(`^(?:[-*•]\\s*)?${NAV_LINK_TERMS}\\s*$`, 'gim'), '')

  // 3b. Termes NAV concaténés en texte brut sur une ligne. Ce cas vient du
  //     scrape POST `injectPageScript` : le script `innerText` extrait les
  //     libellés sans la structure markdown des liens, ce qui colle plusieurs
  //     items de menu (ex: "Nos servicesLe blog RSSecteurs industrielsAide & Contact").
  //     On supprime toute ligne courte qui contient ≥ 2 termes NAV.
  md = md.replace(new RegExp(`^.{0,200}?${NAV_LINK_TERMS}.{0,80}?${NAV_LINK_TERMS}.{0,200}$`, 'gim'), '')

  // 4. Tables markdown avec colonne checkbox `| - [x] | Attribut | Valeur |`
  //    retirer la première colonne pour ne garder que Attribut | Valeur.
  md = md.replace(/^\|\s*-?\s*\[[xX ]?\]\s*[^|]*\|/gm, '|')

  // 4b. Table mono-colonne dupliquée (RS-style concatène attribut+valeur)
  md = md.replace(/^\|\s*S[eé]lectionner tout\s*\|[\s\S]*?(?=\n\n|\n[*#]|\n\|\s*[A-ZÀ-Ÿ][^|]*\|\s+[A-ZÀ-Ÿ])/gim, '')

  // 4c. Cellule orpheline `| Trouver des produits similaires |`
  md = md.replace(/^\|\s*Trouver des produits similaires\s*\|\s*$/gim, '')

  // 5. Tables de pricing : `| Unité | Prix par unité |` + lignes tier `| 1 + | 449€ |`
  md = md.replace(/^\|\s*Unit[eé]\s*\|\s*Prix[^|]*\|[\s\S]*?(?=\n\n|\n#|$)/gim, '')
  md = md.replace(/^\|\s*\d+\s*\+\s*\|[^\n]*[€$£][^\n]*\|[^\n]*$/gm, '')
  md = md.replace(/^(Sous-total[\s\S]*?Add to Basket|Sous-total[\s\S]*?Commander)/gim, '')

  // 6. Tooltips pricing UI ("Besoin de plus?")
  md = md.replace(/^\*?\*?Besoin de plus\?\*?\*?[^\n]*$/gim, '')

  // 7. Séparateurs breadcrumb orphelins `/`
  md = md.replace(/^\/\s*$/gm, '')

  // 8. Boutons d'action ("Comparer", "Ajouter à une liste"…)
  md = md.replace(/^(?:[-*•]?\s*\[[xX ]?\]\s*)?(?:Comparer|Ajouter\s+à\s+une\s+liste|Voir\s+la\s+cat[eé]gorie|Trouver\s+des\s+produits\s+similaires)\s*$/gim, '')

  // 9. Footer "Nos clients ont également consulté"
  md = md.replace(/##?\s*Nos clients ont [eé]galement consult[eé][\s\S]*?(?=\n#|$)/gi, '')

  // 10. "Menu" lone header
  md = md.replace(/^Menu\s*$/gm, '')

  // 11. Catalogue listings : ≥4 bullets de liens consécutifs (sans texte propre)
  md = md.replace(/(?:^[*-]\s*\[[^\]]+\]\([^)]+\)\s*$\n?){4,}/gm, '')

  // 12. Bullets vides résiduels
  md = md.replace(/^[*-]\s*$/gm, '')
  md = md.replace(/^[*-]\s*\[\]\([^)]*\)\s*$/gm, '')

  // 13. Préambule Jina (`\s*` éviterait `\n` et avalerait la ligne suivante !)
  md = md.replace(/^(Title|URL Source|Markdown Content):[ \t]*[^\n]*\n?/gim, '')

  // 13a. Scripts/tags d'analytics & tracking inline (Tealium, GTM, Facebook Pixel,
  //      Cookielaw, OneTrust, DoubleClick, etc.). Ces URLs ressemblent à de
  //      la prose pour le LLM ; on les retire avant l'envoi pour éviter qu'elles
  //      soient extraites comme description.
  md = md.replace(
    /^.*?(?:\/\/|https?:\/\/)?(?:tags\.tiqcdn\.com|utag\.(?:js|sync|loader)|googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|fbevents\.js|fbcdn\.net|stats\.g\.doubleclick\.net|cdn\.cookielaw\.org|consent\.cookiebot\.com|cdn\.onetrust\.com|tag\.adloox\.com|hotjar\.com|hs-scripts\.com|matomo\.cloud|piwik\.pro|cdn\.matomo\.cloud|pixel\.gocheckable\.com)[^\s]*.*$/gim,
    '',
  )
  // Protocol-relative ou absolu pointant vers un .js/.css/.json — pas de la prose
  md = md.replace(/^\s*(?:\/\/|https?:\/\/)[^\s]+\.(?:js|css|json|map)\s*$/gim, '')

  // 13b. Blocs JSON-LD (schema.org) bruts — utiles pour parsing structuré ailleurs,
  //      mais pollution pure quand renvoyés au LLM en prose.
  md = md.replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
  // JSON Schema.org rendu par Jina sans wrapper script
  md = md.replace(/^\s*\{\s*"@context"\s*:\s*"https?:\/\/schema\.org"[\s\S]*?\}\s*$/gim, '')

  // 13c. Lignes de code/configuration techniques (window.dataLayer, ga(), etc.)
  md = md.replace(/^\s*(?:window\.|var\s+|let\s+|const\s+|function\s+)\w+\s*[=(][\s\S]*?[;)]\s*$/gim, '')
  md = md.replace(/^\s*(?:gtag|ga|fbq|_satellite|_paq)\s*\([^\n]*\)\s*;?\s*$/gim, '')

  // 14. Sections d'avis clients (Bazaarvoice / Yotpo / Trustpilot) :
  //     supprime tout entre `## Avis` (ou variantes) et la prochaine H2 non-avis.
  //     Couvre : `## Avis`, `## Avis alimentés par Bazaarvoice`, `## Reviews`,
  //              `## Customer Reviews`, `## User Reviews`.
  md = stripReviewSections(md)

  // 15. Pattern `[Heading]Text` sans URL (Dyson `data-label-target` inline avec body).
  //     Transformer en `**Heading**\n\nText` pour que les parsers reconnaissent
  //     la hiérarchie. Exclut les liens markdown valides `[text](url)`.
  //     Exemple Dyson :
  //       `[Détection des taches avec IA avancée.¹]Robot intelligent : ...`
  //     devient :
  //       `**Détection des taches avec IA avancée.¹**\n\nRobot intelligent : ...`
  md = md.replace(
    /^([\s*-]*)\[([^\]\n]{2,80})\]\s*([^(\s].+)$/gm,
    (full, prefix: string, label: string, rest: string) => {
      // Si le prefix se termine par `!` → c'est `![alt](url)` ou variante d'image, ne pas toucher.
      if (/!$/.test(prefix)) return full
      // Si label contient `](` → c'est un lien imbriqué, ne pas toucher.
      if (/\]\(/.test(label)) return full
      const cleanedRest = rest.trim()
      if (cleanedRest.length < 5) return full
      const bulletPrefix = prefix.match(/[*-]/) ? prefix : ''
      return `**${label.trim()}**\n\n${bulletPrefix}${cleanedRest}`
    },
  )

  return md.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Supprime toutes les sections d'avis clients du markdown.
 * Un bloc d'avis commence à un H2 qui matche `REVIEW_H2_RE` et se termine
 * au prochain H2 (peu importe son contenu) ou à la fin du document.
 *
 * Robuste aux pages où Bazaarvoice est rendu inline (ex: Dyson) : les sous-headings
 * H3 internes (`### Note générale`, `### Filtrer les avis`, `### Avis régionaux`,
 * `### Description sommaire de la notation`) disparaissent avec le bloc.
 */
function stripReviewSections(md: string): string {
  const REVIEW_H2_RE = /^##\s+(?:avis(?:\s+(?:aliment[eé]s|client|v[eé]rifi[eé]s|r[eé]gionaux))?|reviews?|customer\s+reviews?|user\s+reviews?|t[eé]moignages|testimonials)\b/i
  const ANY_H2_RE = /^##\s+/

  const lines = md.split('\n')
  const out: string[] = []
  let inReview = false
  for (const line of lines) {
    if (inReview) {
      if (ANY_H2_RE.test(line) && !REVIEW_H2_RE.test(line)) {
        inReview = false
        out.push(line)
      }
      // Sinon : skip (ligne dans la zone d'avis)
      continue
    }
    if (REVIEW_H2_RE.test(line)) {
      inReview = true
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}
