// Gabarit de champ : « nom du produit - Marque - réf fournisseur - discriminant - EAN ».
// PUR.
//
// ⚠ Le point qui décide du coût de tout le chantier : chaque morceau du gabarit a une
// PROVENANCE, et seuls les morceaux introuvables sont demandés au modèle. Sur un
// catalogue où marque, référence et code-barres existent déjà en colonnes, assembler
// n'appelle personne — c'est instantané, gratuit et exact. Demander au modèle de
// « reformater le nom » alors qu'il suffisait de concaténer trois colonnes, c'est payer
// pour qu'il recopie des données qu'on lui donne, avec le risque qu'il les altère.
//
// Le seul morceau qui demande vraiment un modèle est le DISCRIMINANT : ce qui distingue
// deux variantes d'un même produit (« droite » / « gauche », « 51 cm » / « 46 cm »), et
// qui n'existe nulle part ailleurs que dans le texte d'origine.
import type { CellValue } from '@/features/excel/types'

type PartSource =
  /** Une colonne déjà remplie : recopiée telle quelle, jamais soumise au modèle. */
  | { from: 'column'; key: string }
  /** Le texte d'origine du champ, nettoyé. */
  | { from: 'text' }
  /** À produire par le modèle. `hint` décrit ce qu'on attend de ce morceau. */
  | { from: 'ai'; hint: string }

interface TemplatePart {
  source: PartSource
  /** Sans ce morceau, le gabarit ne s'applique pas du tout. Un nom sans « nom » n'a
   *  aucun sens ; un nom sans EAN en a un. */
  required?: boolean
}

export interface FieldTemplate {
  parts: TemplatePart[]
  /** Ce qui sépare deux morceaux présents. */
  separator: string
}

/** Le gabarit demandé, prêt à l'emploi. Les clés de colonne sont à adapter au projet. */
export function defaultNameTemplate(cols: {
  brand?: string; supplierRef?: string; ean?: string
}): FieldTemplate {
  return {
    separator: ' - ',
    parts: [
      { source: { from: 'text' }, required: true },
      ...(cols.brand ? [{ source: { from: 'column' as const, key: cols.brand } }] : []),
      ...(cols.supplierRef ? [{ source: { from: 'column' as const, key: cols.supplierRef } }] : []),
      { source: { from: 'ai', hint: 'ce qui distingue cette variante des autres (côté, dimension, capacité) — rien si aucune variante' } },
      ...(cols.ean ? [{ source: { from: 'column' as const, key: cols.ean } }] : []),
    ],
  }
}

/** Valeur d'une cellule, réduite à un texte propre. */
function cell(row: Record<string, CellValue>, key: string): string {
  const v = row[key]
  return v == null ? '' : String(v).trim()
}

/**
 * Le gabarit a-t-il besoin du modèle pour ce produit ?
 *
 * Répondre non est le cas le plus rentable : on assemble et on passe au suivant, sans
 * appel ni dépense. C'est aussi le plus sûr — rien ne peut être inventé.
 */
export function needsAI(tpl: FieldTemplate, row: Record<string, CellValue>, text: string): boolean {
  return tpl.parts.some((p) => {
    if (p.source.from !== 'ai') return false
    // Un morceau « à produire » n'a de sens que s'il y a une matière d'où le tirer.
    return text.trim().length > 0 || Object.keys(row).length > 0
  })
}

/** Les indications des morceaux à produire, dans l'ordre — ce qu'on demande au modèle. */
export function aiHints(tpl: FieldTemplate): string[] {
  return tpl.parts.flatMap((p) => (p.source.from === 'ai' ? [p.source.hint] : []))
}

/**
 * Assemble le gabarit.
 *
 * ⚠ Les morceaux vides sont RETIRÉS, séparateurs compris. Sans ça, un produit sans
 * code-barres sortait « Lame 51 cm - STIGA - 1134431901 -  - » : des séparateurs
 * orphelins qui se retrouvent tels quels sur une étiquette ou dans un catalogue.
 *
 * ⚠ Un doublon consécutif est écrasé : quand le texte d'origine porte déjà la marque
 * (« Lame STIGA »), le gabarit produirait « Lame STIGA - STIGA ». On compare sur une
 * forme normalisée, sinon « Stiga » et « STIGA » passeraient tous les deux.
 */
export function renderTemplate(
  tpl: FieldTemplate,
  row: Record<string, CellValue>,
  text: string,
  aiParts: string[] = [],
): string {
  let aiIndex = 0
  const pieces: string[] = []

  for (const part of tpl.parts) {
    let value = ''
    if (part.source.from === 'column') value = cell(row, part.source.key)
    else if (part.source.from === 'text') value = String(text ?? '').trim()
    else value = String(aiParts[aiIndex++] ?? '').trim()

    if (!value) {
      if (part.required) return ''   // morceau indispensable absent : le gabarit ne s'applique pas
      continue
    }
    pieces.push(value)
  }

  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const out: string[] = []
  for (const piece of pieces) {
    const folded = fold(piece)
    // Déjà contenu dans ce qui précède : la marque figure souvent dans le libellé source.
    if (folded && out.some((p) => fold(p).includes(folded))) continue
    out.push(piece)
  }
  return out.join(tpl.separator)
}
