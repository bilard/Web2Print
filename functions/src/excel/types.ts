// functions/src/excel/types.ts
// Le strict nécessaire de src/features/excel/types.ts pour l'enrichissement de textes.
// Non couvert par le test de parité : c'est un EXTRAIT assumé, pas une copie — le fichier
// client porte tout le modèle de tableur, dont le serveur n'a que faire.

export type CellValue = string | number | boolean | null

export interface ExcelRow {
  _id: string
  [key: string]: CellValue
}

/** Colonne, réduite à ce que l'enrichissement lit. */
export interface ExcelColumn {
  key: string
  label: string
  fieldType?: string
}
