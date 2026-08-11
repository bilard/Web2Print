// Mise en forme des durées de l'écran « Suivi ». PUR.
import type { ChantierId } from './buildWatchOps'
import type { ResumeMode } from './opsTypes'
import type { TranslationKey } from '@/lib/i18n'

/** Heures et minutes d'une durée. Toujours au moins une minute tant qu'il reste du
 *  travail : « 0 min » sur une file de deux mille champs ne trompe personne longtemps. */
export function etaParts(ms: number): { h: number; m: number } {
  const total = Math.max(1, Math.ceil(ms / 60_000))
  return { h: Math.floor(total / 60), m: total % 60 }
}

/** Libellé d'un chantier. ⚠ La CLÉ, pas le texte : `t()` appelé ici, en constante de
 *  module, figerait la langue au chargement de l'application. */
export function chantierLabelKey(id: ChantierId): TranslationKey {
  return ({
    harvest: 'ops.chantier.harvest',
    translate: 'ops.chantier.translate',
    improve: 'ops.chantier.improve',
    structure: 'ops.chantier.structure',
  } as const)[id]
}

/**
 * Phrase qui dit ce qu'un lancement fera. `null` quand il n'y a rien à annoncer : sans flux
 * associé, l'écran affiche déjà son propre message d'absence — le répéter ici n'ajouterait
 * qu'un doublon.
 *
 * ⚠ La CLÉ, pas le texte, pour la même raison que `chantierLabelKey`.
 */
export function resumeModeKey(mode: ResumeMode): TranslationKey | null {
  return mode === 'noWorkflow' ? null : ({
    loading: 'ops.resume.loading',
    on: 'ops.resume.on',
    off: 'ops.resume.off',
    noNode: 'ops.resume.noNode',
    error: 'ops.resume.error',
  } as const)[mode]
}
