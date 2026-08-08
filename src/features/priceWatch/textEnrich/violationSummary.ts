// Dire POURQUOI une réécriture a été refusée. PUR.
//
// ⚠ Ces refus étaient silencieux : la fiche restait « pas encore traduit », à côté d'une
// voisine réussie, sans rien pour distinguer « le modèle n'a pas répondu » de « sa réponse
// a été rejetée parce qu'elle perdait une référence ». Sur deux cents fiches demandées et
// onze écrites, il n'y avait aucun moyen de savoir ce qui s'était passé — ni si le module
// marchait.
import type { Violation } from '@/features/textEnrich/protected'
import type { TranslationKey } from '@/lib/i18n'

const LABEL: Record<Violation['kind'], TranslationKey> = {
  'ref-lost': 'pwte.reject.ref',
  'ean-lost': 'pwte.reject.ean',
  'number-lost': 'pwte.reject.number',
  'brand-lost': 'pwte.reject.brandLost',
  'brand-added': 'pwte.reject.brandAdded',
}

export interface RejectionPart {
  key: TranslationKey
  token: string
}

/**
 * Les motifs d'un refus, dédoublonnés, dans l'ordre où ils sont apparus.
 *
 * Dédoublonnés parce qu'une réécriture qui perd trois cotes produit trois violations
 * `number-lost` : les énumérer toutes noie le motif, qui est un seul et même problème.
 */
export function rejectionParts(violations: Violation[]): RejectionPart[] {
  const seen = new Set<string>()
  const out: RejectionPart[] = []
  for (const v of violations) {
    const key = LABEL[v.kind]
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ key, token: v.token })
  }
  return out
}
