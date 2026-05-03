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

  // Sections qui contiennent des avantages (bullet points).
  // `applications?` ajouté : sur RS Components / Conrad / Distrelec, le H3
  // `### **Applications**` liste les cas d'usage (= avantages marketing).
  // "Caractéristiques" seul = section specs (Dyson) ; "Caractéristiques du produit"
  // = features. "Description complète" (Dyson) = bullets de features détaillés.
  const featureKeywords = /(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit|caract[eé]ristiques?\s+du\s+produit|description\s+(?:compl[eèé]te|d[eé]taill[eé]e)|applications?)/i
  // Sections qui NE contiennent PAS d'avantages → quitter la featureZone.
  // "Caractéristiques" seul (sans "du produit") → specs → exit (sauf override
  // par l'heuristique caractéristiques plus bas).
  // "[équipement|domaine] et application" : exit (différent d'`Applications`
  // tout court qui est dans featureKeywords).
  const exitKeywords = /(?:sp[eé]cification|caract[eé]ristiques?(?!\s+du\s+produit)|donn[eé]es\s*technique|descriptif\s*technique|t[eé]l[eé]chargement|downloads?|documents?|avis|reviews?|note\s+g[eé]n[eé]rale|description\s+sommaire|filtrer\s+les\s+avis|trier\s+les\s+avis|foire\s+aux\s+questions|faq|r[eé]f[eé]rences?|variantes?|accessoires?\s*associ|offres?\s+partenaires?|marketplace|vendeur\s+tiers?|paiement|s[eé]curis[eé]|satisfait\s+ou\s+rembours[eé]|livraison|prix|tarif|contact|mentions?\s*l[eé]gal|conditions?\s*g[eé]n[eé]ral|informations?\s*compl[eé]ment|[eé]quipement\s+et\s+application|domaine\s+d[‘'']application|cookies?|gdpr|consentement|param[eè]tres?\s+(?:de\s+)?confidentialit)/i
  // Contenu commercial/politique à filtrer
  const COMMERCIAL_RE = /achet[eé]|achat|retourn|rembours|livr[eé]|exp[eé]di|panier|commander|boutique|magasin|labellis[eé]|certifi[eé].*utilisateur|v[eé]rifi[eé].*identit|historique.*d.achat|provien.*d.utilisateur|contrefaçon|authenticit|service\s*client|cat[eé]gories?\s*d.?[eé]valuation|distinguons?\s*trois|noter\s*ce\s*produit/i

  const extractGroupName = (raw: string): string | undefined => {
    const stripped = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    // Si le strip ne laisse rien (heading = juste le prefixe générique),
    // on n'a pas de groupe utile.
    if (stripped.length === 0) return undefined
    // Si le strip vide trop le heading (ex: "Avantages produits" -> "produits"
    // qui est ambigu), on garde le heading complet pour préserver la sémantique.
    if (stripped.length < 3 || stripped.split(/\s+/).length === 1) {
      const fullCleaned = raw.replace(/\*\*/g, '').trim()
      return fullCleaned.length > 1 && fullCleaned.length < 80 ? fullCleaned : undefined
    }
    return stripped.length > 1 && stripped.length < 80 ? stripped : undefined
  }

  const addBullet = (text: string, group: string | undefined) => {
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\\/g, '')
      .trim()
    if (clean.length < 15 || clean.startsWith('http') || /^\d+$/.test(clean) || seenTexts.has(clean)) return
    // Artefacts d'image-liens `[![img](url)label](anchor)` → après nettoyage: `!Image N:...`
    if (clean.startsWith('!')) return
    // Syntaxe de lien résiduelle (ex: `label](url)` quand le `[` était dans l'image)
    if (/\]\(https?:/.test(clean)) return
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
  // currentBoldGroup : bold heading (sans bullet) à l'intérieur de la zone features
  // → devient le groupe pour les bullets bold suivants. Préfère currentGroup.
  // Ex: ## Description complète > **Détection des taches…** > *  **Robot intelligent : …**
  //                                ^^^^^^^^^^^^^^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^
  //                                currentBoldGroup                         pendingAdvantage.text
  let currentBoldGroup: string | undefined
  let inFeatureZone = false
  // pendingAdvantage : l'avantage en cours de construction. Démarré par un
  // bullet bold (`*  **Titre**`), enrichi par les paragraphes prose suivants,
  // poussé à `advantages` quand on rencontre un autre bullet bold ou qu'on sort
  // de la zone features.
  let pendingAdvantage: { text: string; group?: string } | null = null

  const flushPending = () => {
    if (!pendingAdvantage) return
    const adv = pendingAdvantage
    pendingAdvantage = null
    if (adv.text.length < 15) return
    if (seenTexts.has(adv.text)) return
    seenTexts.add(adv.text)
    advantages.push(adv)
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    const headingMatch = trimmed.match(/^#{1,5}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/\*\*/g, '').trim()
      // Quitter si on entre dans une section technique / commerciale / autre
      if (exitKeywords.test(headingText)) {
        // Cas ambigu : "## Caractéristiques" seul peut être soit specs (Dyson)
        // soit features (Milwaukee bullets marketing). Scan la section ENTIÈRE
        // (jusqu'au prochain H1/H2) et compte bullets longs vs paires "name: value".
        // Si ≥ 3 bullets ≥ 30 chars sans pattern "name: value" → features.
        if (/^caract[eé]ristiques?\s*$/i.test(headingText)) {
          let longBullets = 0
          let specPairs = 0
          for (let j = i + 1; j < lines.length; j++) {
            const lj = lines[j].trim()
            if (!lj) continue
            if (/^#{1,2}\s/.test(lj)) break
            const bm = lj.match(/^[-*•·✓✔]\s+(.+)/)
            if (!bm) continue
            const txt = bm[1].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            if (/^\S[^:]{0,40}:\s*\S/.test(txt) && txt.length < 60) specPairs++
            else if (txt.length >= 30) longBullets++
          }
          if (longBullets >= 3 && longBullets > specPairs) {
            flushPending()
            inFeatureZone = true
            currentGroup = headingText
            currentBoldGroup = undefined
            continue
          }
        }
        flushPending()
        inFeatureZone = false
        currentGroup = undefined
        currentBoldGroup = undefined
        continue
      }
      if (featureKeywords.test(headingText)) {
        flushPending()
        inFeatureZone = true
        currentGroup = extractGroupName(headingText)
        currentBoldGroup = undefined
        continue
      }
      if (inFeatureZone) {
        const level = trimmed.match(/^(#{1,5})/)?.[1].length ?? 99
        if (level <= 2) {
          flushPending()
          inFeatureZone = false
          currentGroup = undefined
          currentBoldGroup = undefined
        }
      }
      continue
    }

    // Texte bold seul = potentiel titre de section ou sous-groupe
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldMatch) {
      if (exitKeywords.test(boldMatch[1])) {
        flushPending()
        inFeatureZone = false
        currentGroup = undefined
        currentBoldGroup = undefined
        continue
      }
      if (featureKeywords.test(boldMatch[1])) {
        flushPending()
        inFeatureZone = true
        currentGroup = extractGroupName(boldMatch[1])
        currentBoldGroup = undefined
        continue
      }
      // Bold heading dans la zone features → c'est un sous-groupe (style Dyson:
      // **Détection des taches…** au-dessus de bullets `* **Robot intelligent…**`)
      if (inFeatureZone) {
        flushPending()
        currentBoldGroup = boldMatch[1].replace(/\*\*/g, '').trim()
        continue
      }
    }

    // Texte non-markdown qui matche les keywords
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('•')
        && featureKeywords.test(trimmed) && !exitKeywords.test(trimmed) && trimmed.length < 80) {
      const nextLine = (lines[i + 1] ?? '').trim()
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextLine)
      if (isTitleBeforeBullets || inFeatureZone) {
        flushPending()
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        currentBoldGroup = undefined
        continue
      }
    }

    if (!inFeatureZone) continue

    // Bullet bold `* **Titre**` → démarre un nouvel avantage hiérarchique.
    // Les paragraphes prose qui suivent seront ajoutés à son texte.
    const bulletBoldMatch = trimmed.match(/^[-*•·✓✔]\s+\*\*(.+?)\*\*\s*$/)
    if (bulletBoldMatch) {
      flushPending()
      const title = bulletBoldMatch[1].replace(/\*\*/g, '').trim()
      if (title.length >= 5) {
        pendingAdvantage = {
          text: title,
          group: currentBoldGroup ?? currentGroup,
        }
      }
      continue
    }

    // Bullet points explicites (non-bold)
    const bulletMatch = trimmed.match(/^[-*•·✓✔]\s+(.+)/)
    if (bulletMatch) {
      flushPending()
      addBullet(bulletMatch[1], currentBoldGroup ?? currentGroup)
      continue
    }

    // Numérotés : "1. Texte"
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (numberedMatch && numberedMatch[1].length > 20) {
      flushPending()
      addBullet(numberedMatch[1], currentBoldGroup ?? currentGroup)
      continue
    }

    // Paragraphes de prose dans la zone features (pas un heading, pas un tableau, pas un lien)
    if (
      trimmed.length >= 40
      && !trimmed.startsWith('|')
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('![')
      && !/^\[.*\]\(/.test(trimmed)
      && !COMMERCIAL_RE.test(trimmed)
      && !isGarbageContent(trimmed)
    ) {
      const cleanedProse = trimmed
        .replace(/\*\*/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\\\\/g, '')
        .trim()
      // Si un avantage hiérarchique est en cours → la prose est sa description.
      // Sinon : paragraphe libre = avantage à part entière.
      if (pendingAdvantage) {
        pendingAdvantage.text += '\n\n' + cleanedProse
      } else {
        addBullet(trimmed, currentBoldGroup ?? currentGroup)
      }
      continue
    }
  }

  flushPending()

  return advantages
}
