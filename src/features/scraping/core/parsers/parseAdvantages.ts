import { isGarbageContent } from './garbageFilter'

export interface Advantage {
  text: string
  group?: string
}

export function mergeGroupsIntoAdvantages(
  existing: Array<{ text: string; group?: string }>,
  mdAdvantages: Array<{ text: string; group?: string }>,
): Array<{ text: string; group?: string }> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  // Essayer de matcher chaque item existant avec un item markdown pour récupérer son groupe
  const result = existing.map(adv => {
    if (adv.group) return adv // déjà groupé
    const normAdv = normalize(adv.text)
    const match = mdAdvantages.find(md => {
      const normMd = normalize(md.text)
      return normMd === normAdv || normMd.includes(normAdv) || normAdv.includes(normMd)
    })
    return match?.group ? { ...adv, group: match.group } : adv
  })

  // Ajouter les items markdown qui n'ont pas de correspondance dans l'existant
  const existingNorms = new Set(existing.map(a => normalize(a.text)))
  for (const md of mdAdvantages) {
    const normMd = normalize(md.text)
    if (!existingNorms.has(normMd) && ![...existingNorms].some(e => e.includes(normMd) || normMd.includes(e))) {
      result.push(md)
    }
  }

  return result
}

/** Extrait une liste d'avantages/points forts depuis du markdown. */
export function parseAdvantagesFromMarkdown(md: string): Advantage[] {
  const advantages: Array<{ text: string; group?: string }> = []
  const seenTexts = new Set<string>()

  // Sections qui contiennent des avantages (bullet points)
  const featureKeywords = /(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit|caract[eé]ristiques?)/i
  // Sections qui NE contiennent PAS des avantages → quitter la featureZone
  const exitKeywords = /(?:sp[eé]cification|caract[eé]ristiques?\s*techniques?|donn[eé]es\s*technique|descriptif\s*technique|t[eé]l[eé]chargement|downloads?|documents?|avis|reviews?|r[eé]f[eé]rences?|variantes?|accessoires?\s*associ|prix|tarif|contact|mentions?\s*l[eé]gal|conditions?\s*g[eé]n[eé]ral|informations?\s*compl[eé]ment|[eé]quipement|application)/i
  // Contenu commercial/politique à filtrer
  const COMMERCIAL_RE = /achet[eé]|achat|retourn|rembours|livr[eé]|exp[eé]di|panier|commander|boutique|magasin|labellis[eé]|certifi[eé].*utilisateur|v[eé]rifi[eé].*identit|historique.*d.achat|provien.*d.utilisateur|contrefaçon|authenticit|service\s*client|cat[eé]gories?\s*d.?[eé]valuation|distinguons?\s*trois|noter\s*ce\s*produit/i

  const extractGroupName = (raw: string): string | undefined => {
    const cleaned = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    return cleaned.length > 1 && cleaned.length < 80 ? cleaned : undefined
  }

  const addBullet = (text: string, group: string | undefined) => {
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\\/g, '')
      .trim()
    if (clean.length < 15 || clean.startsWith('http') || /^\d+$/.test(clean) || seenTexts.has(clean)) return
    // Rejeter le contenu commercial / politique
    if (COMMERCIAL_RE.test(clean)) return
    // Rejeter les noms de specs isolés (sans verbe, sans valeur)
    if (clean.length < 50 && /\*\s*$/.test(clean)) return
    // Rejeter les adresses, noms d'entreprise, disclaimers, liens
    if (/^\d{4,5}\s+[A-Z]/.test(clean)) return
    if (/GmbH|S\.A\.|SAS|SARL|Ltd|Inc/i.test(clean)) return
    if (/avertissement|consigne.*s[eé]curit|notice.*utilisation|t[eé]l[eé]charg|cliqu/i.test(clean)) return
    if (isGarbageContent(clean)) return
    seenTexts.add(clean)
    advantages.push({ text: clean, group })
  }

  const lines = md.split('\n')
  let currentGroup: string | undefined
  let inFeatureZone = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    const headingMatch = trimmed.match(/^#{1,5}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/\*\*/g, '').trim()
      // Quitter si on entre dans une section technique / commerciale / autre
      if (exitKeywords.test(headingText)) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(headingText)) {
        inFeatureZone = true
        currentGroup = extractGroupName(headingText)
        continue
      }
      if (inFeatureZone) {
        const level = trimmed.match(/^(#{1,5})/)?.[1].length ?? 99
        if (level <= 2) {
          inFeatureZone = false
          currentGroup = undefined
        }
      }
      continue
    }

    // Texte bold seul = potentiel titre de section
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldMatch) {
      if (exitKeywords.test(boldMatch[1])) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(boldMatch[1])) {
        inFeatureZone = true
        currentGroup = extractGroupName(boldMatch[1])
        continue
      }
    }

    // Texte non-markdown qui matche les keywords
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('•')
        && featureKeywords.test(trimmed) && !exitKeywords.test(trimmed) && trimmed.length < 80) {
      const nextLine = (lines[i + 1] ?? '').trim()
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextLine)
      if (isTitleBeforeBullets || inFeatureZone) {
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        continue
      }
    }

    if (!inFeatureZone) continue

    // Bullet points explicites
    const bulletMatch = trimmed.match(/^[-*•·✓✔]\s+(.+)/)
    if (bulletMatch) {
      addBullet(bulletMatch[1], currentGroup)
      continue
    }

    // Numérotés : "1. Texte"
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (numberedMatch && numberedMatch[1].length > 20) {
      addBullet(numberedMatch[1], currentGroup)
      continue
    }

    // Paragraphes de prose dans la zone features (pas un heading, pas un tableau, pas un lien)
    // Certaines pages mettent les avantages en texte libre plutôt qu'en bullets
    if (
      trimmed.length >= 40
      && !trimmed.startsWith('|')
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('![')
      && !/^\[.*\]\(/.test(trimmed)
      && !COMMERCIAL_RE.test(trimmed)
      && !isGarbageContent(trimmed)
    ) {
      addBullet(trimmed, currentGroup)
      continue
    }
  }

  return advantages
}
