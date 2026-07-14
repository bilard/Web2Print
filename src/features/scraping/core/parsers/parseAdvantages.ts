import { isGarbageContent, stripReviewBlocks } from './garbageFilter'

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

/** Fusion ADDITIVE d'avantages : garde `base` tel quel, ajoute les items de
 *  `extra` non dupliqués (normalisation : minuscules, alphanumérique, 40 chars).
 *  Contrat garde-fou : extra vide → base inchangée. */
export function mergeAdvantagesAdditive(
  base: Advantage[],
  extra: Advantage[],
): Advantage[] {
  if (extra.length === 0) return base
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, '').slice(0, 40)
  const seen = new Set(base.map((a) => norm(a.text)))
  const out = [...base]
  for (const a of extra) {
    const n = norm(a.text)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(a)
  }
  return out
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: '’', rsquo: '’', lsquo: '‘',
  lt: '<', gt: '>', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—',
  trade: '™', reg: '®', copy: '©', deg: '°', sup2: '²', sup3: '³', euro: '€',
  agrave: 'à', acirc: 'â', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', ccedil: 'ç',
  Agrave: 'À', Eacute: 'É', Egrave: 'È', Ccedil: 'Ç',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&([a-zA-Z]+[0-9]?);/g, (m, name: string) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Convertit le HTML brut en pseudo-markdown minimal (headings → `## …`,
 *  `<li>` → `*   …`) pour réutiliser TELLE QUELLE la batterie de gardes de
 *  parseAdvantagesFromMarkdown (zones features, filtres commercial/garbage).
 *  Les blocs sans avantages (script/style/table/select/nav/footer) sont retirés
 *  en amont pour limiter le bruit. */
function htmlToFeatureMarkdown(html: string): string {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<select[\s\S]*?<\/select>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const out: string[] = []
  // Balayage séquentiel : seuls les headings et les <li> produisent des lignes —
  // le reste du texte de la page est ignoré (la prose descriptive vit dans
  // parseDescription, pas ici).
  const TOKEN_RE = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>|<li[^>]*>([\s\S]*?)(?=<li[^>]*>|<\/li>|<\/[ou]l>)/gi
  for (const m of s.matchAll(TOKEN_RE)) {
    if (m[1]) {
      const t = stripTags(m[2])
      if (t) out.push(`\n${'#'.repeat(Number(m[1]))} ${t}\n`)
    } else if (m[3] != null) {
      const t = stripTags(m[3])
      if (t) out.push(`*   ${t}`)
    }
  }
  return out.join('\n')
}

/** Extrait les avantages depuis le HTML BRUT (source déterministe, comme
 *  parseImagesFromHtml pour les images) : le HTML statique contient les listes
 *  complètes même quand le rendu navigateur les replie (« Voir plus ») ou
 *  qu'un vieux markdown de cache est resservi. Additif par contrat : l'appelant
 *  FUSIONNE via mergeAdvantagesAdditive, ne remplace jamais. */
export function parseAdvantagesFromHtml(html: string): Advantage[] {
  if (!html || html.length < 200) return []
  try {
    return parseAdvantagesFromMarkdown(htmlToFeatureMarkdown(html))
  } catch {
    return []
  }
}

/** Extrait une liste d'avantages/points forts depuis du markdown. */
export function parseAdvantagesFromMarkdown(rawMd: string): Advantage[] {
  // Témoignages clients (« 5/5 » + paragraphe) : passaient les filtres et
  // devenaient des avantages (constat Jardiland) — neutralisés en amont.
  const md = stripReviewBlocks(rawMd)
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
  // « Caractéristiques et avantages » (heading Kingfisher : Castorama, Brico
  // Dépôt) = section de bullets marketing → NE PAS sortir de la zone features.
  const exitKeywords = /(?:sp[eé]cification|caract[eé]ristiques?\b(?!\s+(?:du\s+produit|et\s+avantages?))|donn[eé]es\s*technique|descriptif\s*technique|t[eé]l[eé]chargement|downloads?|documents?|avis|reviews?|note\s+g[eé]n[eé]rale|description\s+sommaire|filtrer\s+les\s+avis|trier\s+les\s+avis|foire\s+aux\s+questions|faq|r[eé]f[eé]rences?|variantes?|accessoires?\s*associ|offres?\s+partenaires?|marketplace|vendeur\s+tiers?|paiement|s[eé]curis[eé]|satisfait\s+ou\s+rembours[eé]|livraison|prix|tarif|contact|mentions?\s*l[eé]gal|conditions?\s*g[eé]n[eé]ral|informations?\s*compl[eé]ment|[eé]quipement\s+et\s+application|domaine\s+d[‘'']application|cookies?|gdpr|consentement|param[eè]tres?\s+(?:de\s+)?confidentialit|cr[eé]ation\s+d.{0,3}un\s+compte|commander\s+en\s+(?:tant\s+que|utilisant)|se\s+connecter|mot\s+de\s+passe|promesses)/i
  // Contenu commercial/politique à filtrer. Inclut l'UI compte client
  // (« Suivi de la commande », « Commandez plus rapidement » — bloc
  // « Avantages » du menu compte Magento) et le widget stock (« En rupture
  // en ligne », « Restez informé(e) sur le stock », « Me tenir informé(e) »)
  // qui deviennent sinon des « points forts » de la fiche.
  const COMMERCIAL_RE = /achet[eé]|achat|retourn|rembours|livr[eé]|livraison|exp[eé]di|panier|command(?:er|ez)|suivi\s+de\s+(?:la\s+)?commande|suiv(?:re|i)\s+l['’]historique|historique\s+des\s+commandes|boutique|magasin|labellis[eé]|certifi[eé].*utilisateur|v[eé]rifi[eé].*identit|historique.*d.achat|provien.*d.utilisateur|contrefaçon|authenticit|service\s*client|cat[eé]gories?\s*d.?[eé]valuation|distinguons?\s*trois|noter\s*ce\s*produit|\bsoldes?\b|black\s*friday|s[eé]lection\s+de\s+produits|offre\s+valable|cr[eé]er\s+un\s+compte|se\s+connecter|mon\s+compte|liste\s+d['’]envies|wishlist|en\s+rupture|rupture\s+de\s+stock|rest(?:ez|er)\s+inform[eé]|me\s+tenir\s+inform[eé]|v[eé]rifi(?:er|ez)\s+le\s+stock|alerte\s+(?:stock|dispo)|newsletter|payez\b|\bmollie\b|\bklarna\b|\b(?:fr|be|lu)\s?\d{8,}\b/i

  const extractGroupName = (raw: string): string | undefined => {
    const stripped = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      // « Caractéristiques et avantages » : après le strip du 1er mot générique,
      // retirer aussi la conjonction + 2e mot générique (sinon groupe = « et avantages »).
      .replace(/^(?:et|and|&)\s+(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?)\s*/i, '')
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
    // Ligne document injectée (« 780##Label,https://….pdf ») ou sentinelle résiduelle.
    if (/##|JINA_EXTRACTED_|NEXT_DATA_SPECS/.test(clean)) return
    // Paires « Nom : Valeur » courtes = specs (capturées par le parser de specs
    // dans les sections mixtes type « Caractéristiques et avantages ») — les
    // garder ici dupliquerait chaque spec en avantage.
    if (clean.length < 60 && /^[^:]{2,40}\s*:\s*\S/.test(clean)) return
    // Artefacts d'image-liens `[![img](url)label](anchor)` → après nettoyage: `!Image N:...`
    if (clean.startsWith('!')) return
    // Syntaxe de lien résiduelle (ex: `label](url)` quand le `[` était dans l'image)
    if (/\]\(https?:/.test(clean)) return
    // Rejeter le contenu commercial / politique
    if (COMMERCIAL_RE.test(clean)) return
    // Rejeter les noms de specs isolés (sans verbe, sans valeur)
    if (clean.length < 50 && /\*\s*$/.test(clean)) return
    // Fragment de TABLE markdown sérialisée (« Plus d'information| Référence
    // Trafic | 1084074 | ») : ≥ 2 pipes = ligne de tableau, jamais un avantage.
    if ((clean.match(/\|/g)?.length ?? 0) >= 2) return
    // Rejeter les adresses, noms d'entreprise, disclaimers, liens
    if (/^\d{4,5}\s+[A-Z]/.test(clean)) return
    if (/\b(?:rue|boulevard|avenue|chauss[eé]e|impasse|all[eé]e)\b[^|]*\b\d{4,5}\b/i.test(clean)) return
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

    // SENTINELLES internes (JINA_EXTRACTED_*, NEXT_DATA_SPECS…) : bornes de
    // sections machine injectées dans le markdown — jamais des avantages, et la
    // zone features en cours s'arrête là (ce qui suit est du contenu injecté
    // puis de la navigation, pas la suite des points forts).
    if (/JINA_EXTRACTED_|NEXT_DATA_SPECS/.test(trimmed)) {
      flushPending()
      inFeatureZone = false
      currentGroup = undefined
      currentBoldGroup = undefined
      continue
    }

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
      // Chercher la prochaine ligne NON-VIDE (une ligne vide entre le heading
      // et les items est fréquente sur Leroy Merlin, Castorama, etc.)
      let nextNonEmpty = ''
      for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
        const l = lines[j].trim()
        if (l) { nextNonEmpty = l; break }
      }
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextNonEmpty)
      // Aussi activer si les items suivants sont de la prose simple (pas de bullets)
      // ex: Leroy Merlin affiche les avantages comme paragraphes sans tirets
      const isTitleBeforeProse = nextNonEmpty.length >= 30
        && !nextNonEmpty.startsWith('#') && !nextNonEmpty.startsWith('|')
        && !exitKeywords.test(nextNonEmpty)
      if (isTitleBeforeBullets || isTitleBeforeProse || inFeatureZone) {
        flushPending()
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        currentBoldGroup = undefined
        continue
      }
    }

    if (!inFeatureZone) continue

    // Widget PRIX (« 944,10 €1 049,00 €- 10 % ») : tout ce qui suit est du
    // commerce (stock, livraison, paiement) — fin de la zone features. Sans
    // ça, les lignes marchandes post-prix devenaient des « avantages ».
    if (/\d+[.,]\d{2}\s*€/.test(trimmed)) {
      flushPending()
      inFeatureZone = false
      currentGroup = undefined
      currentBoldGroup = undefined
      continue
    }

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

    // Lignes de prose dans la zone features (pas un heading, pas un tableau,
    // pas un lien). Seuil 15 : les points forts en LIGNES PLATES sans puces
    // (« Robustesse exceptionnelle », « Double porte vitrée » — pattern
    // Jardiland/Leroy Merlin) font souvent < 40 chars ; les gardes d'addBullet
    // (commercial, garbage, paires specs) contiennent le bruit.
    if (
      trimmed.length >= 15
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
      // Si un avantage hiérarchique est en cours → la prose LONGUE est sa
      // description (les fragments courts n'y sont pas rattachés : bruit).
      if (pendingAdvantage) {
        if (cleanedProse.length >= 40) pendingAdvantage.text += '\n\n' + cleanedProse
      } else {
        addBullet(trimmed, currentBoldGroup ?? currentGroup)
      }
      continue
    }
  }

  flushPending()

  return advantages
}
