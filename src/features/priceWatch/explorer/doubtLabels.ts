// Libellés des motifs de doute — module DÉDIÉ, et non un export du composant qui les
// affiche : deux écrans les lisent désormais (la ligne d'appariement, et le compteur
// « À vérifier » qui en donne la ventilation). Exporter une table depuis un module de
// composant est la cause récurrente de dépendances circulaires dans ce projet.
import type { DoubtReason } from './confidence'
import type { TranslationKey } from '@/lib/i18n'

export const DOUBT_LABEL: Record<DoubtReason, TranslationKey> = {
  'ean-conflict': 'pwx.doubt.eanConflict',
  'ref-conflict': 'pwx.doubt.refConflict',
  'weak-key': 'pwx.doubt.weakKey',
  'numeric-short': 'pwx.doubt.numericShort',
  'origin-key': 'pwx.doubt.originKey',
  contested: 'pwx.doubt.contested',
  'price-gulf': 'pwx.doubt.priceGulf',
  'price-abyss': 'pwx.doubt.priceAbyss',
  'family-conflict': 'pwx.doubt.familyConflict',
  'visual-conflict': 'pwx.doubt.visualConflict',
}

/** Forme COURTE, pour une énumération : « référence d'origine · clé courte · familles ».
 *  Le libellé long explique un cas ; celui-ci nomme une catégorie qu'on compte. */
export const DOUBT_SHORT: Record<DoubtReason, TranslationKey> = {
  'ean-conflict': 'pwx.doubt.short.eanConflict',
  'ref-conflict': 'pwx.doubt.short.refConflict',
  'weak-key': 'pwx.doubt.short.weakKey',
  'numeric-short': 'pwx.doubt.short.numericShort',
  'origin-key': 'pwx.doubt.short.originKey',
  contested: 'pwx.doubt.short.contested',
  'price-gulf': 'pwx.doubt.short.priceGulf',
  'price-abyss': 'pwx.doubt.short.priceAbyss',
  'family-conflict': 'pwx.doubt.short.familyConflict',
  'visual-conflict': 'pwx.doubt.short.visualConflict',
}
