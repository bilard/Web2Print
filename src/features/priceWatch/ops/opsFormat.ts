// Mise en forme des durées de l'écran « Suivi ». PUR.
import type { ChantierId, FactKey } from './buildWatchOps'
import type { ResumeMode } from './opsTypes'
import type { TranslationKey } from '@/lib/i18n'

/** Heures et minutes d'une durée. Toujours au moins une minute tant qu'il reste du
 *  travail : « 0 min » sur une file de deux mille champs ne trompe personne longtemps. */
export function etaParts(ms: number): { h: number; m: number } {
  const total = Math.max(1, Math.ceil(ms / 60_000))
  return { h: Math.floor(total / 60), m: total % 60 }
}

/**
 * Clé du pourcentage quand l'arrondi le trahit, `null` pour l'afficher tel quel.
 *
 * ⚠ Un travail commencé ne s'affiche pas « 0 % ». Sur une file de 200 000 champs, franchir
 * le premier pour cent demande des heures : la carte annonçait « 0 % » pendant tout ce
 * temps alors que ses deux compteurs bougeaient — le pourcentage semblait cassé, ou le
 * traitement bloqué. « < 1 % » dit la même mesure sans ce malentendu.
 *
 * ⚠ La CLÉ, pas le texte (cf. `chantierLabelKey`).
 */
export function subPercentKey(pct: number, done: number): TranslationKey | null {
  return pct === 0 && done > 0 ? 'ops.card.pct.sub1' : null
}

/**
 * Ce que l'écran dit d'un passage qui a rendu la main. PUR, et une CLÉ (cf.
 * `chantierLabelKey`).
 *
 * ⚠ Ton NEUTRE, jamais l'orange de l'alerte : ces trois fins sont normales et attendues à
 * chaque run. Seul le silence sans raison reste une anomalie, et il garde son badge.
 */
export function stoppedByKey(reason: 'spend' | 'deadline' | 'units'): TranslationKey {
  return ({
    spend: 'ops.card.stoppedBy.spend',
    deadline: 'ops.card.stoppedBy.deadline',
    units: 'ops.card.stoppedBy.units',
  } as const)[reason]
}

/** Libellé d'un volume affiché à côté de la jauge. ⚠ La CLÉ (cf. `chantierLabelKey`). */
export function factLabelKey(key: FactKey): TranslationKey {
  return ({
    indexed: 'ops.fact.indexed',
    pages: 'ops.fact.pages',
    lastPassProducts: 'ops.fact.lastPassProducts',
    collecting: 'ops.fact.collecting',
    considered: 'ops.fact.considered',
    alreadyDone: 'ops.fact.alreadyDone',
  } as const)[key]
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
 * qui ne l'était pas — d'où l'unité nommée et le pourcentage étiqueté.
 *
 * ⚠⚠ Les chantiers de TEXTES avaient le même défaut, et on avait écrit ici le contraire.
 * Une unité d'enrichissement est un CHAMP d'une fiche (`EnrichUnit` = `productId` + `field`),
 * pas une fiche : « 207 298 restants » sur un catalogue de 115 814 références se lit comme
 * une erreur de comptage — c'est le premier chiffre que l'utilisateur a relevé. Les deux
 * nombres portent donc leur unité eux aussi.
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
    done: { one: 'ops.card.fields.done.one', other: 'ops.card.fields.done.other' },
    remaining: { one: 'ops.card.fields.remaining.one', other: 'ops.card.fields.remaining.other' },
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
