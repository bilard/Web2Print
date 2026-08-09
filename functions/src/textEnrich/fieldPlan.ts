// functions/src/textEnrich/fieldPlan.ts
// ⚠ COPIE de src/features/textEnrich/fieldPlan.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// Ce qu'un passage fait, CHAMP PAR CHAMP. PUR.
//
// ⚠ Un seuil global n'a pas de sens et c'est l'utilisateur qui l'a dit : un nom de
// produit devient explicite en une trentaine de caractères, une description reste
// indigente à cent. Un seuil unique ferait donc soit réécrire des noms corrects, soit
// laisser passer des descriptions vides de sens. Chaque champ porte le sien, avec son
// traitement et son gabarit.
import type { EnrichKind } from './revision'
import type { FieldTemplate } from './template'

export interface FieldPlan {
  /** Clé du champ produit visé. */
  key: string
  kind: EnrichKind
  /** En deçà, le contenu est jugé trop pauvre. Ignoré pour une traduction, où c'est la
   *  langue qui décide et non la longueur. */
  minLength: number
  /** Consigne libre pour ce champ. Sa VERSION entre dans le marqueur d'idempotence :
   *  la modifier rend les champs à nouveau éligibles. */
  prompt: string
  promptVersion: string
  /** Gabarit d'assemblage, pour les champs structurés (le nom, typiquement). */
  template?: FieldTemplate
  /** Traiter aussi les champs vides — utile quand un gabarit peut les CONSTRUIRE à
   *  partir d'autres colonnes. */
  includeEmpty?: boolean
  /**
   * Traduire aussi les textes dont la langue n'a PAS été tranchée.
   *
   * ⚠ Le détecteur s'abstient dès qu'un texte est court, très technique ou à l'encodage
   * abîmé — sur un catalogue de pièces, c'est la majorité : 81 117 fiches sur 115 814,
   * soit 70 %, hors de toute file sans que rien ne le dise. Son silence ne veut pas dire
   * « déjà en français ». Coché, ces fiches partent au modèle, à qui il est demandé de
   * rendre le texte INCHANGÉ s'il est déjà en français — on paie alors une passe pour
   * rien, mais on ne perd plus 70 % du catalogue.
   */
  includeUndetected?: boolean
}

/**
 * Le plan par défaut, tel que l'utilisateur l'a arrêté : nom, description, libellé.
 *
 * Les seuils viennent de lui — « autour de 25 à 30 caractères pour le nom et plus pour
 * la description ». Ils sont réglables dans la carte ; ceux-ci ne sont qu'un point de
 * départ raisonnable, pas une vérité.
 */
export const DEFAULT_MIN_LENGTH: Record<'name' | 'label' | 'description', number> = {
  name: 28,
  label: 28,
  /** Une description sous cent caractères ne décrit rien : c'est un libellé déguisé. */
  description: 100,
}


/** Les champs distincts touchés par un plan — c'est ce que la synthèse du passage
 *  annonce, et ce que l'écran de comparaison propose en filtre. */
export function planFields(plans: FieldPlan[]): string[] {
  return [...new Set(plans.map((p) => p.key))]
}
