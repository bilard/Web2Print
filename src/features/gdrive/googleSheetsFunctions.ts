// src/features/gdrive/googleSheetsFunctions.ts
// Catalogue (curaté) des fonctions Google Sheets pour l'autocomplétion des
// colonnes-formule de l'export. Nom + courte aide affichée dans le menu.
export interface GSheetsFunction {
  name: string
  hint: string
}

export const GSHEETS_FUNCTIONS: GSheetsFunction[] = [
  { name: 'SUM', hint: 'Somme : SUM(plage)' },
  { name: 'AVERAGE', hint: 'Moyenne : AVERAGE(plage)' },
  { name: 'MIN', hint: 'Minimum d’une plage' },
  { name: 'MAX', hint: 'Maximum d’une plage' },
  { name: 'COUNT', hint: 'Compte les nombres' },
  { name: 'COUNTA', hint: 'Compte les cellules non vides' },
  { name: 'COUNTIF', hint: 'Compte selon un critère' },
  { name: 'SUMIF', hint: 'Somme selon un critère' },
  { name: 'IF', hint: 'IF(test ; si_vrai ; si_faux)' },
  { name: 'IFS', hint: 'Conditions multiples' },
  { name: 'IFERROR', hint: 'IFERROR(valeur ; sinon)' },
  { name: 'AND', hint: 'ET logique' },
  { name: 'OR', hint: 'OU logique' },
  { name: 'NOT', hint: 'NON logique' },
  { name: 'ROUND', hint: 'ROUND(nombre ; décimales)' },
  { name: 'ROUNDUP', hint: 'Arrondi au supérieur' },
  { name: 'ROUNDDOWN', hint: 'Arrondi à l’inférieur' },
  { name: 'ABS', hint: 'Valeur absolue' },
  { name: 'CONCATENATE', hint: 'Concatène du texte' },
  { name: 'TEXT', hint: 'TEXT(valeur ; format)' },
  { name: 'LEFT', hint: 'Caractères de gauche' },
  { name: 'RIGHT', hint: 'Caractères de droite' },
  { name: 'MID', hint: 'Sous-chaîne' },
  { name: 'LEN', hint: 'Longueur du texte' },
  { name: 'TRIM', hint: 'Supprime les espaces superflus' },
  { name: 'UPPER', hint: 'Majuscules' },
  { name: 'LOWER', hint: 'Minuscules' },
  { name: 'SUBSTITUTE', hint: 'Remplace du texte' },
  { name: 'VLOOKUP', hint: 'Recherche verticale' },
  { name: 'HLOOKUP', hint: 'Recherche horizontale' },
  { name: 'INDEX', hint: 'INDEX(plage ; ligne ; col)' },
  { name: 'MATCH', hint: 'Position dans une plage' },
  { name: 'ARRAYFORMULA', hint: 'Applique à toute la colonne' },
  { name: 'SPLIT', hint: 'Découpe du texte' },
  { name: 'JOIN', hint: 'Joint avec un séparateur' },
  { name: 'TODAY', hint: 'Date du jour' },
  { name: 'NOW', hint: 'Date et heure actuelles' },
  { name: 'DATE', hint: 'DATE(année ; mois ; jour)' },
  { name: 'ROW', hint: 'Numéro de ligne' },
  { name: 'COLUMN', hint: 'Numéro de colonne' },
]
