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

/** Paire singulier / pluriel d'un même libellé. */
export interface PluralKeys { one: TranslationKey; other: TranslationKey }

/**
 * La clé qui s'accorde avec le nombre. PUR.
 *
 * ⚠ `n > 1` et non `n !== 1` : en français, zéro prend le singulier (« 0 restant »). C'est
 * le seuil déjà retenu partout ailleurs dans l'application (`wfc.inconsistencies.*`,
 * `pim.products.*`) — en inventer un second ferait diverger deux écrans sur le même mot.
 */
export function plural(keys: PluralKeys, n: number): TranslationKey {
  return n > 1 ? keys.other : keys.one
}

/** Ce que COMPTENT les chiffres d'une carte — l'unité change d'un chantier à l'autre. */
export interface ChantierUnitKeys {
  done: PluralKeys
  remaining: PluralKeys
  /** Ce que mesure le pourcentage, quand il ne mesure pas la même chose que les deux
   *  compteurs qui l'encadrent. `null` = rien à préciser. */
  pctLabelKey: TranslationKey | null
}

/**
 * Libellés des trois chiffres d'un chantier. PUR, et des CLÉS (cf. `chantierLabelKey`).
 *
 * ⚠⚠ La moisson affichait « 21 faits · 64 % · 1 restants » — trois nombres qui ne mesurent
 * PAS la même chose : 21 et 1 comptent des SITES (bouclés / pas encore bouclés), tandis que
 * 64 % est l'avancement du balayage EN COURS. Côte à côte et sans distinction, ils donnaient
 * l'impression d'une erreur de calcul. Le calcul est juste ; c'est ce que l'écran en disait
 * qui ne l'était pas — d'où l'unité nommée et le pourcentage étiqueté, ici seulement. Les
 * chantiers de textes comptent des CHAMPS et n'ont pas ce problème : les uniformiser les
 * dégraderait.
 */
export function chantierUnitKeys(id: ChantierId): ChantierUnitKeys {
  if (id === 'harvest') {
    return {
      done: { one: 'ops.card.harvest.done.one', other: 'ops.card.harvest.done.other' },
      remaining: { one: 'ops.card.harvest.remaining.one', other: 'ops.card.harvest.remaining.other' },
      pctLabelKey: 'ops.card.harvest.pct',
    }
  }
  return {
    done: { one: 'ops.card.done.one', other: 'ops.card.done.other' },
    remaining: { one: 'ops.card.remaining.one', other: 'ops.card.remaining.other' },
    pctLabelKey: null,
  }
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
