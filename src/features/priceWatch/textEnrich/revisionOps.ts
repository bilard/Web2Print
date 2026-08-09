// Ce qui a été FAIT sur une fiche réécrite. PUR.
//
// ⚠ Le champ `ops` n'existe que depuis le 2026-08-09 : les réécritures antérieures n'en
// portent pas. Refuser de les classer les faisait disparaître à la fois de « Traduits » et
// d'« Améliorés » — l'écran répondait « Rien à traiter » sur des fiches pourtant traduites,
// visibles deux centimètres plus bas avec leur note « Traduction de l'anglais vers le
// français ».
//
// ⚠ La déduction s'appuie sur la LANGUE D'ORIGINE, pas sur une convention : une fiche dont
// le texte source est allemand et qui porte aujourd'hui une réécriture a été traduite. Ce
// n'est pas un classement d'office, c'est une lecture de la donnée. Faute de langue
// tranchée, on ne conclut rien et la fiche reste « traitée » — le détecteur s'abstient
// souvent, et inventer ici ferait mentir les deux filtres à la fois.
import type { TextRevision } from '../textRevisionsStore'

export interface RevisionOps { translate: boolean; improve: boolean }

export function opsOf(revision: TextRevision | undefined, lang: string | null): RevisionOps {
  if (!revision) return { translate: false, improve: false }
  if (revision.ops?.translate || revision.ops?.improve) {
    return { translate: !!revision.ops.translate, improve: !!revision.ops.improve }
  }
  return { translate: !!lang && lang !== 'fr', improve: false }
}
