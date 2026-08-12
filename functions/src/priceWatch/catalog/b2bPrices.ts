// Les prix d'un espace PROFESSIONNEL : ce qu'on paie, ce qui est conseillé, ce qu'on gagne.
//
// ⚠⚠ Un site B2B connecté n'affiche pas UN prix mais trois, et la veille n'en retenait
// qu'un — sans savoir lequel. Relevé sur une fiche progarden en accès connecté :
//
//     Votre prix d'achat unitaire : 6,54 € HT
//     Prix conseillé unit. : 16,36 € HT
//     Remise sur prix de vente : -60 %
//
// Les confondre fausse tout : comparer son prix d'ACHAT à un prix de VENTE annonce des
// écarts de 150 % qui n'existent pas. Les trois sont donc lus séparément, et chacun garde
// son sens — le prix d'achat sert la négociation fournisseur, le conseillé sert la
// comparaison de marché.
//
// GÉNÉRIQUE : on reconnaît des LIBELLÉS de commerce professionnel, jamais un site. Les
// formulations sont celles du secteur, en français et en anglais ; un site qui n'en emploie
// aucune rend simplement des champs absents, et le comportement reste celui d'avant.

/** Nombre européen ou anglo-saxon collé à un symbole monétaire. */
const AMOUNT = String.raw`(\d[\d\s\u00a0.,]{0,12}\d|\d)\s*(?:&euro;|€|EUR\b)`

/** Convertit « 1 234,56 » ou « 1,234.56 » en nombre. */
function toNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[\s\u00a0]/g, '')
  // Séparateur décimal = le dernier signe présent ; l'autre est un séparateur de milliers.
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Cherche un montant DANS LA FOULÉE d'un libellé.
 *
 * ⚠ La fenêtre est courte (300 caractères) et ne franchit pas un autre libellé de prix :
 * sur une fiche, « prix conseillé » et « votre prix » se suivent à quelques balises près, et
 * une fenêtre large attribuerait au premier le montant du second.
 */
function amountAfter(text: string, label: RegExp): number | undefined {
  const m = label.exec(text)
  if (!m) return undefined
  const window = text.slice(m.index + m[0].length, m.index + m[0].length + 300)
  const found = new RegExp(AMOUNT, 'i').exec(window)
  return found ? toNumber(found[1]) : undefined
}

export interface B2BPrices {
  /** Prix d'ACHAT du professionnel connecté — ce que l'acheteur paie réellement. */
  netPrice?: number
  /** Prix de vente CONSEILLÉ par le fournisseur (tarif public). */
  advisedPrice?: number
  /** Remise consentie sur le prix de vente, en pourcentage positif (« -60 % » → 60). */
  discountPct?: number
}

const NET = /(?:votre\s+prix(?:\s+d['’]achat)?(?:\s+unitaire)?|prix\s+d['’]achat(?:\s+unitaire)?|prix\s+net|your\s+price|net\s+price|dealer\s+price)\s*(?:unitaire)?\s*:?/i
const ADVISED = /(?:prix\s+conseill[ée]|prix\s+(?:de\s+vente\s+)?public|prix\s+public\s+conseill[ée]|tarif\s+conseill[ée]|recommended\s+(?:retail\s+)?price|\brrp\b|\bpvc\b)\s*(?:unit\.?|unitaire)?\s*:?/i
const DISCOUNT = /(?:remise(?:\s+sur\s+prix\s+de\s+vente)?|discount)\s*:?\s*(-?\s*\d{1,3}(?:[.,]\d+)?)\s*%/i

/**
 * Prix professionnels d'une fiche produit. PUR.
 *
 * Le HTML est aplati en texte avant lecture : les libellés et leurs montants sont séparés
 * par des balises (`<span>`, `<strong>`, sauts de ligne) qui varient d'un thème à l'autre,
 * et raisonner sur la structure reviendrait à écrire du code par-vendeur.
 */
export function extractB2BPrices(html: string): B2BPrices {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\s\u00a0]+/g, ' ')

  const out: B2BPrices = {}
  const net = amountAfter(text, NET)
  if (net != null) out.netPrice = net
  const advised = amountAfter(text, ADVISED)
  if (advised != null) out.advisedPrice = advised

  const d = DISCOUNT.exec(text)
  if (d) {
    const pct = Number(d[1].replace(/\s/g, '').replace(',', '.'))
    // Toujours POSITIF : « -60 % » et « 60 % » décrivent la même remise, et un signe
    // conservé tel quel ferait basculer les calculs d'un site à l'autre.
    if (Number.isFinite(pct) && Math.abs(pct) > 0 && Math.abs(pct) <= 100) out.discountPct = Math.abs(pct)
  }

  // ⚠ Cohérence : une remise DÉDUITE des deux prix prime sur celle qu'on a lue, et comble
  // son absence. Certains thèmes affichent la remise en image ou la calculent en
  // JavaScript ; les deux montants, eux, sont toujours dans le texte.
  if (out.netPrice != null && out.advisedPrice != null && out.advisedPrice > out.netPrice) {
    out.discountPct = Math.round(((out.advisedPrice - out.netPrice) / out.advisedPrice) * 100)
  }
  return out
}
