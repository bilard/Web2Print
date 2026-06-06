// src/features/easycatalog/ecExport.ts
import type { ExcelSheet, FieldTypeId } from '@/features/excel/types'

export type EcDelimiter = 'tab' | 'comma'
export type EcFieldType = 'alphanumeric' | 'numeric' | 'image'

export interface EcKeyInfo {
  /** ecFieldName de la colonne-clé, ou '_ec_key' si synthétisée */
  keyName: string
  /** true quand aucune colonne primaire unique n'existait → clé générée */
  synthesized: boolean
}

/** Mappe un FieldTypeId interne vers le type de champ EasyCatalog. */
export function ecTypeFor(fieldType: FieldTypeId): EcFieldType {
  if (fieldType === 'image') return 'image'
  if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'percent' || fieldType === 'rating') {
    return 'numeric'
  }
  return 'alphanumeric'
}

/** Dérive un nom de fichier depuis une URL/chemin image ; entrée vide → ''. */
export function imageFileName(url: string): string {
  if (!url) return ''
  let s = url.split('?')[0].split('#')[0]
  try {
    s = decodeURIComponent(s)
  } catch {
    /* garder s tel quel si décodage impossible */
  }
  const last = s.substring(s.lastIndexOf('/') + 1)
  return last || 'image'
}

/** Détermine le champ-clé EasyCatalog : colonne primaire si valeurs uniques & non vides, sinon synthèse. */
export function resolveKeyInfo(sheet: ExcelSheet, ecNames: Map<string, string>): EcKeyInfo {
  const primary = sheet.columns.find((c) => c.isPrimary) ?? sheet.columns[0]
  if (primary && sheet.rows.length > 0) {
    const values = sheet.rows.map((r) => r[primary.key])
    const nonEmpty = values.every((v) => v !== null && v !== undefined && String(v).trim() !== '')
    const unique = new Set(values.map((v) => String(v))).size === values.length
    if (nonEmpty && unique) {
      return { keyName: ecNames.get(primary.key) ?? '_ec_key', synthesized: false }
    }
  }
  return { keyName: '_ec_key', synthesized: true }
}
