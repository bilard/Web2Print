// functions/src/priceWatch/textEnrich/staleRevision.ts
// ⚠ COPIE de src/features/priceWatch/textEnrich/staleRevision.ts (bundles séparés : `functions/`
// est hermétique, `rootDir: "src"`). Toute modification là-bas doit être reportée ici —
// cf. textReviseParity.test.ts.
// Quelles fiches un passage de traduction doit-il reprendre. PUR.
//
// ⚠ « Ne jamais traiter deux fois » ne suffit pas quand la source vit. Le catalogue reçoit
// des produits chaque jour, et les fiches existantes sont corrigées chez le fournisseur :
// une fiche déjà réécrite était sautée POUR TOUJOURS, y compris quand son texte d'origine
// avait changé — la traduction restait celle d'un texte qui n'existe plus.
//
// Le juge de péremption est déjà en base : `TextRevision.nameSource` et
// `descriptionSource` portent le texte d'origine, capturé à la PREMIÈRE réécriture et
// jamais réécrit ensuite. Si le catalogue ne dit plus la même chose, la révision est
// périmée.
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

/** Pourquoi cette fiche entre dans la file. Sert au journal du run et au compteur. */
type ReviseReason = 'new' | 'stale'

export interface ReviseTarget {
  product: SourceProduct
  reason: ReviseReason
  /** Ce qui a bougé depuis la réécriture, pour le dire au lieu de le subir. */
  changed?: ('name' | 'description')[]
}

/** Deux textes disent-ils la même chose ? Espaces et casse ne font pas une modification :
 *  un export qui change la capitalisation relancerait sinon tout le catalogue. */
function same(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

/**
 * Champs dont le texte d'origine a changé depuis la réécriture.
 *
 * ⚠ Un champ SANS original mémorisé n'est pas jugé périmé quand le catalogue n'en porte
 * pas non plus : `descriptionSource` n'est écrit que si la fiche avait une description.
 * Mais une description APPARUE depuis compte — c'est de la matière neuve à traduire, et la
 * traiter comme « déjà faite » la laisserait en allemand pour toujours.
 */
export function changedFields(p: SourceProduct, rev: TextRevision): ('name' | 'description')[] {
  const out: ('name' | 'description')[] = []
  if (!same(rev.nameSource, p.name)) out.push('name')
  if (!same(rev.descriptionSource, p.description)) out.push('description')
  return out
}

/**
 * La file d'un passage : les fiches jamais traitées, puis celles que la source a modifiées.
 *
 * ⚠ Les NEUVES d'abord. Une file plafonnée (`maxUnits`) qui commencerait par les périmées
 * laisserait les arrivées du jour attendre indéfiniment derrière un catalogue qui bouge —
 * or c'est précisément pour elles qu'on relance chaque nuit.
 */
export function reviseQueue(
  products: SourceProduct[],
  revisions: Map<string, TextRevision>,
  opts: {
    /** Reprendre les fiches dont le texte source a changé. Faux = seulement les neuves. */
    refreshStale: boolean
    /** Restriction facultative (langue, texte de vente…), appliquée avant tout le reste. */
    accept?: (p: SourceProduct) => boolean
  },
): ReviseTarget[] {
  const fresh: ReviseTarget[] = []
  const stale: ReviseTarget[] = []
  for (const p of products) {
    if (opts.accept && !opts.accept(p)) continue
    const rev = revisions.get(p.id)
    if (!rev) { fresh.push({ product: p, reason: 'new' }); continue }
    if (!opts.refreshStale) continue
    const changed = changedFields(p, rev)
    if (changed.length > 0) stale.push({ product: p, reason: 'stale', changed })
  }
  return [...fresh, ...stale]
}
