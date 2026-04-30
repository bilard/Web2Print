/**
 * Ancres entre la liste « Champs scrapés » (colonne gauche, ScrapedFieldsTab)
 * et le panneau de données enrichies (EnrichmentPanel → DoneState).
 *
 * Cliquer sur un libellé de section ou de sous-groupe à gauche dispatch un
 * événement global ; les composants à droite écoutent, ouvrent l'accordéon
 * cible si nécessaire, puis on scrolle l'élément `id` correspondant dans la
 * vue. Le `id` est posé sur le wrapper du bloc — il existe même quand
 * l'accordéon est fermé.
 */

export const ANCHOR_EVENT = 'enrichment-anchor-jump'

/** Sentinel pour les groupes sans nom — évite la collision `enrichment-group-specifications-` entre sections. */
const NO_GROUP_SLUG = '__none__'

export type AnchorSection = 'images' | 'description' | 'advantages' | 'specifications' | 'variants' | 'documents' | string

export interface AnchorJumpDetail {
  section: AnchorSection
  /** Nom du sous-groupe (vide ou undefined = section top-level uniquement). */
  group?: string
}

function slug(name: string): string {
  if (!name) return NO_GROUP_SLUG
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || NO_GROUP_SLUG
}

export function sectionAnchor(section: AnchorSection): string {
  return `enrichment-section-${section}`
}

export function groupAnchor(section: AnchorSection, groupName: string): string {
  return `enrichment-group-${section}-${slug(groupName)}`
}

export function dispatchAnchorJump(detail: AnchorJumpDetail): void {
  window.dispatchEvent(new CustomEvent<AnchorJumpDetail>(ANCHOR_EVENT, { detail }))
}
