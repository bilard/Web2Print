import type { DriveStep } from 'driver.js'
import type { TranslationKey } from '@/lib/i18n'

/**
 * Étape de tour enrichie : driver.js ignore les champs supplémentaires.
 * - `prepare` : effet de bord à exécuter AVANT d'afficher l'étape (ouvrir une
 *   section, déplier un panneau…). Peut être asynchrone.
 * - `requireSelector` : sélecteur dont la présence est attendue (polling) avant
 *   d'afficher l'étape ; utile pour les panneaux montés en lazy.
 * - `popover.titleKey` / `descriptionKey` : le texte passe par le CATALOGUE.
 *   Les tableaux d'étapes sont des constantes de MODULE — un `t()` à cet endroit
 *   figerait la langue au chargement du bundle. `useGuidedTour` résout les clés
 *   juste avant de lancer driver.js, donc au moment où la langue est connue.
 */
export interface TourStep extends Omit<DriveStep, 'popover'> {
  prepare?: () => void | Promise<void>
  requireSelector?: string
  popover?: Omit<NonNullable<DriveStep['popover']>, 'title' | 'description'> & {
    titleKey?: TranslationKey
    descriptionKey?: TranslationKey
  }
}
