import { isGarbageContent } from './garbageFilter'

/**
 * Extrait la description marketing d'un produit depuis du markdown.
 * Stratégie (héritée de useProductEnrichment.ts) :
 *   1. Chercher une section "## Description" / "## À propos" en priorité
 *   2. Sinon, premier paragraphe non-titre après le H1
 *   3. Filtrer les bandeaux cookies (isGarbageContent)
 *   4. Couper avant la première section "Spécifications" / "Caractéristiques"
 */
export function parseDescriptionFromMarkdown(md: string): string {
  const lines = md.split('\n')

  // ── Helpers ──
  const isProseText = (s: string) =>
    s.length >= 40 && !s.startsWith('|') && !s.startsWith('#')
    && !/^\[.*\]\(.*\)$/.test(s) && !/^!\[/.test(s) && !s.startsWith('http')
    && !/^[-*•✓✔]\s/.test(s) && !isGarbageContent(s)
    && !/^\d+([.,]\d+)?\s*(b|kb|mb|gb|ko|mo|go|octets?|bytes?)\s*$/i.test(s)
    // Rejet des lignes-documents (format "Label | URL" ou "Label ## URL") :
    // label court suivi d'un séparateur puis d'une URL → c'est une ligne
    // téléchargement, pas de la prose descriptive.
    && !/\s[|#]{1,2}\s*https?:\/\//.test(s)
    && !/https?:\/\/\S+/.test(s)

  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()

  // Sections qui contiennent typiquement de la description/prose
  const descSectionRe = /caract[eé]ristiques?\s*(du\s*produit|principales?|g[eé]n[eé]rales?)?|description|pr[eé]sentation|aper[çc]u|about|overview|introduction|r[eé]sum[eé]|en\s*bref|le\s*produit|d[eé]tail|points?\s*forts?\s*(du\s*produit)?|[eé]quipement\s*(et\s*application)?|informations?\s*compl[eé]ment/i
  // Sections techniques / non-descriptives → on sort de la description
  const nonDescSectionRe = /sp[eé]cification|descriptif\s*technique|donn[eé]es?\s*technique|fiche\s*technique|t[eé]l[eé]chargement|downloads?|documents?|r[eé]f[eé]rences?|variantes?|accessoires?\s*(?:associ|inclus|compatib)|avis|reviews?|galerie|vid[eé]os?|questions?|faq|contact|prix|tarif|dimensions?\s*et|table\s*des?\s*mati[eè]res/i

  // ── Phase 1 : texte entre le H1 et le premier H2 ──
  const phase1Parts: string[] = []
  let afterTitle = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#\s/.test(trimmed)) { afterTitle = true; continue }
    if (!afterTitle) continue
    if (/^#{2,}\s/.test(trimmed)) break
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) phase1Parts.push(c)
    if (phase1Parts.length >= 4) break
  }

  // ── Phase 2 : texte dans les sections descriptives (## Caractéristiques du produit, etc.) ──
  const phase2Parts: string[] = []
  let inDescSection = false
  for (const line of lines) {
    const trimmed = line.trim()

    // Heading markdown
    if (/^#{2,4}\s/.test(trimmed)) {
      const heading = trimmed.replace(/^#{2,4}\s+/, '')
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
      // Heading inconnu : quitter la section desc en cours
      if (inDescSection) {
        inDescSection = false
        continue
      }
      continue
    }

    // Titre en bold sur une ligne seule (format Bosch : **Points forts du produit**)
    const boldLine = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldLine) {
      const heading = boldLine[1]
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
    }

    if (!inDescSection) continue
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) {
      const norm = c.toLowerCase().slice(0, 50)
      if (!phase2Parts.some(p => p.toLowerCase().slice(0, 50) === norm)) {
        phase2Parts.push(c)
      }
    }
    if (phase2Parts.length >= 8) break
  }

  // ── Phase 3 : fallback — trouver le plus long bloc de prose consécutif dans tout le markdown ──
  const phase3Parts: string[] = []
  if (phase1Parts.length === 0 && phase2Parts.length === 0) {
    let currentBlock: string[] = []
    let bestBlock: string[] = []
    let bestLen = 0
    for (const line of lines) {
      const trimmed = line.trim()
      const c = clean(trimmed)
      if (trimmed && isProseText(c) && c.length >= 50) {
        currentBlock.push(c)
      } else {
        const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
        if (blockLen > bestLen) {
          bestBlock = [...currentBlock]
          bestLen = blockLen
        }
        currentBlock = []
      }
    }
    // Vérifier le dernier bloc
    const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
    if (blockLen > bestLen) bestBlock = currentBlock
    if (bestBlock.length > 0) phase3Parts.push(...bestBlock.slice(0, 6))
  }

  // ── Sélection du meilleur résultat ──
  // Préférer Phase 2 (section descriptive identifiée) si elle a du contenu riche
  // Sinon Phase 1 (après le titre), sinon Phase 3 (fallback prose)
  const phase2Text = phase2Parts.join('\n\n').trim()
  const phase1Text = phase1Parts.join('\n\n').trim()
  const phase3Text = phase3Parts.join('\n\n').trim()

  // Si Phase 2 a trouvé du contenu riche, le préférer
  if (phase2Text.length > phase1Text.length && phase2Text.length >= 50) {
    return phase2Text
  }
  // Si Phase 1 a du contenu décent, le combiner avec Phase 2
  if (phase1Text.length >= 50) {
    if (phase2Text.length >= 50) {
      // Les deux ont du contenu — combiner en évitant les doublons
      const combined = phase1Text
      const p2Norm = phase2Text.toLowerCase().slice(0, 50)
      if (!combined.toLowerCase().includes(p2Norm.slice(0, 30))) {
        return (combined + '\n\n' + phase2Text).trim()
      }
      return combined
    }
    return phase1Text
  }
  // Fallback : Phase 2 ou Phase 3
  if (phase2Text.length >= 40) return phase2Text
  if (phase3Text.length >= 40) return phase3Text

  // Dernier recours : H1 comme description minimale
  const h1Match = md.match(/^#\s+(.+)/m)
  if (h1Match) return clean(h1Match[1])

  return ''
}
