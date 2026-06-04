import type { DriveStep } from 'driver.js'

/**
 * Étape de tour enrichie : driver.js ignore les champs supplémentaires.
 * - `prepare` : effet de bord à exécuter AVANT d'afficher l'étape (ouvrir une
 *   section, déplier un panneau…). Peut être asynchrone.
 * - `requireSelector` : sélecteur dont la présence est attendue (polling) avant
 *   d'afficher l'étape ; utile pour les panneaux montés en lazy.
 */
export interface TourStep extends DriveStep {
  prepare?: () => void | Promise<void>
  requireSelector?: string
}
