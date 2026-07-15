// src/lib/richText.ts
// Représentation minimale du gras inline issu du scraping (source verbatim).
//
// Le scraping produit conserve le **gras** de la source sous forme de markdown
// (`**texte**`). Ce module est le PONT unique entre cette représentation stockée
// et les différents médias de rendu :
//   - HTML (cartes retail/catalogue)  → boldMarkdownToHtml()
//   - Fabric per-char styles / PptxGen runs / pdf-lib → parseBoldRuns()
//   - stockage canonique / IDML / aperçu brut → stripBoldMarkers()
//
// Règle d'or : un texte SANS gras ressort byte-pour-byte inchangé (aucun `**`
// ajouté, `stripBoldMarkers` est un no-op sur du texte propre).

/** Segment de texte homogène : `bold` vaut true si la source le mettait en gras. */
export interface TextRun {
  text: string
  bold: boolean
}

/** Convertit les balises HTML de gras (`<strong>`, `<b>`) en marqueurs markdown
 *  `**`. Les autres balises ne sont PAS touchées (le nettoyage HTML reste à la
 *  charge des appelants). Casse et espaces internes tolérés (`< b >`, `</B>`). */
export function htmlBoldToMarkers(s: string): string {
  return s.replace(/<\s*\/?\s*(?:strong|b)\s*>/gi, '**')
}

/** Retire tous les marqueurs `**` → texte brut. No-op si aucun marqueur. */
export function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*/g, '')
}

/** Le texte contient-il au moins une paire de gras exploitable ? */
export function hasBoldMarkers(s: string): boolean {
  return (s.match(/\*\*/g)?.length ?? 0) >= 2
}

/** Normalise les marqueurs de gras avant tout rendu :
 *   - convertit `<strong>`/`<b>` → `**`
 *   - garantit un nombre PAIR de `**` (supprime un marqueur orphelin final)
 *   - neutralise les paires vides `** **`
 *  Idempotent et sûr : appelé en tête de chaque adaptateur de rendu. */
export function normalizeBoldMarkers(s: string): string {
  let out = htmlBoldToMarkers(s)
  // Paires vides (souvent des `<strong></strong>` résiduels) → espace.
  out = out.replace(/\*\*\s*\*\*/g, ' ')
  const count = out.match(/\*\*/g)?.length ?? 0
  if (count % 2 !== 0) {
    const idx = out.lastIndexOf('**')
    if (idx >= 0) out = out.slice(0, idx) + out.slice(idx + 2)
  }
  return out
}

/** Découpe une chaîne (mono-ligne ou multi-ligne) en runs `{text, bold}`.
 *  Les `\n` restent dans le `text` des runs — à charge du média de les gérer.
 *  Robuste aux marqueurs déséquilibrés (normalisés en amont). */
export function parseBoldRuns(text: string): TextRun[] {
  const norm = normalizeBoldMarkers(text)
  const runs: TextRun[] = []
  let buf = ''
  let bold = false
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] === '*' && norm[i + 1] === '*') {
      if (buf) runs.push({ text: buf, bold })
      buf = ''
      bold = !bold
      i++ // consomme le 2e '*'
      continue
    }
    buf += norm[i]
  }
  if (buf) runs.push({ text: buf, bold })
  return runs.length > 0 ? runs : [{ text: '', bold: false }]
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Rend le gras en HTML sûr : échappe le texte PUIS enveloppe les runs gras dans
 *  `<strong>`. Aucune autre balise n'est produite. Pour les cartes retail/catalogue
 *  qui posent la description via innerHTML. */
export function boldMarkdownToHtml(s: string): string {
  return parseBoldRuns(s)
    .map((r) => (r.bold && r.text ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text)))
    .join('')
}

/** Convertit une description PLATE issue d'une source structurée (JSON-LD
 *  `Product.description` : paragraphes séparés par des sauts de ligne, liste de
 *  caractéristiques indentée par tabulation, sous-titre finissant par `:`) en
 *  markdown STRUCTURÉ (titres `##`, puces `- `). Source fiable et déterministe :
 *  aucune pollution possible (pas de footer/cookies/livraison). */
export function structuredPlainToRichMarkdown(desc: string): string {
  const out: string[] = []
  let firstBlock = true // le 1er bloc de prose = tagline/intro (rendu `<h2>` par la source) → titre
  for (const raw of (desc || '').split('\n')) {
    const t = raw.trim()
    if (!t) { if (out.length && out[out.length - 1] !== '') out.push(''); continue }
    // Item de liste : ligne indentée par tabulation OU déjà préfixée d'une puce.
    if (/^\t/.test(raw) || /^[•·▪●◦▶-]\s/.test(t)) {
      out.push(`- ${normalizeBoldMarkers(t.replace(/^[•·▪●◦▶-]\s*/, ''))}`)
      firstBlock = false
      continue
    }
    // Sous-titre : ligne courte finissant par `:` (ex. « Caractéristiques principales : »).
    if (t.length <= 70 && /:\s*$/.test(t)) { out.push(`## ${normalizeBoldMarkers(t)}`); firstBlock = false; continue }
    // 1re phrase COURTE (tagline produit) → titre `#` (h2 de la source). Un long
    // 1er paragraphe reste de la prose (ce n'est pas un titre).
    if (firstBlock && t.length <= 170) { out.push(`# ${normalizeBoldMarkers(t)}`); firstBlock = false; continue }
    out.push(normalizeBoldMarkers(t))
    firstBlock = false
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Aplatit un markdown structuré en texte inline (retire les préfixes titre `#`
 *  et puce `- `, garde le gras `**` et le texte) — pour les surfaces compactes
 *  (carte promo clampée) qui ne veulent qu'un teaser en gras, pas la structure. */
export function flattenRichMarkdown(md: string): string {
  return normalizeBoldMarkers(md || '')
    .split('\n')
    .map((l) => l.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*•·▪●◦▶]\s+/, ''))
    .filter(Boolean)
    .join(' ')
}

/**
 * Rend un markdown de description STRUCTURÉ en HTML sûr, préservant les styles
 * de la source : titres (`#`..`######` → `<h3>`..`<h6>` ; h1/h2 réservés à la
 * page ne sont jamais produits), gras (`**` / `<strong>`), listes à puces
 * (`- ` / `• ` → `<ul><li>`), paragraphes → `<p>`. Texte échappé ; seules ces
 * balises structurelles sont produites (sûr pour innerHTML). Un texte PLAT (sans
 * markdown) ressort en un `<p>` par bloc — inchangé sémantiquement.
 */
export function descriptionMarkdownToHtml(md: string): string {
  const lines = normalizeBoldMarkers(md || '').split('\n')
  const html: string[] = []
  let list: string[] = []
  const flushList = () => {
    if (list.length) {
      html.push(`<ul>${list.map((li) => `<li>${boldMarkdownToHtml(li)}</li>`).join('')}</ul>`)
      list = []
    }
  }
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) { flushList(); continue }
    const h = t.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (h) {
      flushList()
      const lvl = Math.min(6, h[1].length + 2) // # → h3, ## → h4, … (h1/h2 réservés)
      html.push(`<h${lvl}>${boldMarkdownToHtml(h[2])}</h${lvl}>`)
      continue
    }
    const b = t.match(/^[-*•·▪●◦▶]\s+(.+)$/)
    if (b) { list.push(b[1]); continue }
    flushList()
    html.push(`<p>${boldMarkdownToHtml(t)}</p>`)
  }
  flushList()
  return html.join('')
}
