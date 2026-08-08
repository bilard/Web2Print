// Ce que la CONSIGNE du mail de veille peut demander : la liste des données réellement
// transmises au modèle. PUR.
//
// ⚠ Raison d'être. L'aide du champ disait comment écrire une consigne, jamais SUR QUOI
// elle pouvait porter. Sans cette liste, on demande au hasard : ce qui existe sort, ce qui
// n'existe pas ne sort pas, et rien ne dit lequel des deux cas on vient de rencontrer —
// le modèle a interdiction d'inventer, donc il se tait.
//
// ⚠ Cette liste est du TEXTE, mais elle n'a pas le droit de mentir : `composeFields.test.ts`
// la confronte aux clés que `reportFacts`/`movesFacts` produisent vraiment. Une donnée
// ajoutée au prompt sans l'être ici resterait invisible ; une donnée retirée du prompt et
// laissée ici se ferait demander en vain.
import type { TranslationKey } from '@/lib/i18n'

export interface ComposeFieldGroup {
  /** Clé du bloc tel qu'il apparaît dans le prompt. */
  id: 'report' | 'moves'
  titleKey: TranslationKey
  /** Champs de premier niveau, dans l'ordre du prompt. */
  fields: { key: string; labelKey: TranslationKey }[]
}

export const COMPOSE_FIELDS: ComposeFieldGroup[] = [
  {
    id: 'report',
    titleKey: 'pw.compose.fields.report',
    fields: [
      { key: 'analyse_du', labelKey: 'pw.compose.f.analyse_du' },
      { key: 'produits_apparies', labelKey: 'pw.compose.f.produits_apparies' },
      { key: 'comparaisons', labelKey: 'pw.compose.f.comparaisons' },
      { key: 'produits_sous_cotes', labelKey: 'pw.compose.f.produits_sous_cotes' },
      { key: 'indice_tarif_base_100', labelKey: 'pw.compose.f.indice' },
      { key: 'indice_vs_meilleur_prix', labelKey: 'pw.compose.f.indice_best' },
      { key: 'comparaisons_ou_le_concurrent_est_moins_cher', labelKey: 'pw.compose.f.cheaper' },
      { key: 'ruptures_chez_les_concurrents', labelKey: 'pw.compose.f.ruptures' },
      { key: 'concurrents', labelKey: 'pw.compose.f.concurrents' },
      { key: 'familles', labelKey: 'pw.compose.f.familles' },
      { key: 'exemples_de_produits_sous_cotes', labelKey: 'pw.compose.f.exemples' },
    ],
  },
  {
    id: 'moves',
    titleKey: 'pw.compose.fields.moves',
    fields: [
      { key: 'releve_du', labelKey: 'pw.compose.f.releve_du' },
      { key: 'mouvements', labelKey: 'pw.compose.f.mouvements' },
      { key: 'baisses_concurrentes', labelKey: 'pw.compose.f.baisses' },
      { key: 'hausses_concurrentes', labelKey: 'pw.compose.f.hausses' },
      { key: 'baisse_moyenne_pct', labelKey: 'pw.compose.f.baisse_moy' },
      { key: 'hausse_moyenne_pct', labelKey: 'pw.compose.f.hausse_moy' },
      { key: 'par_concurrent', labelKey: 'pw.compose.f.par_concurrent' },
      { key: 'plus_fortes_baisses', labelKey: 'pw.compose.f.top_baisses' },
      { key: 'plus_fortes_hausses', labelKey: 'pw.compose.f.top_hausses' },
    ],
  },
]

/** Consignes prêtes à l'emploi. Un exemple vaut mieux qu'une explication : la difficulté
 *  n'est pas d'écrire une phrase, c'est de savoir ce qu'on a le droit de demander. */
export const COMPOSE_PRESETS: { labelKey: TranslationKey; textKey: TranslationKey }[] = [
  { labelKey: 'pw.compose.preset.short.label', textKey: 'pw.compose.preset.short.text' },
  { labelKey: 'pw.compose.preset.moves.label', textKey: 'pw.compose.preset.moves.text' },
  { labelKey: 'pw.compose.preset.family.label', textKey: 'pw.compose.preset.family.text' },
]
