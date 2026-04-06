// Field type definitions for Excel import

export type FieldTypeId =
  | 'text'
  | 'text_long'
  | 'text_rich'
  | 'select_multiple'
  | 'select_single'
  | 'date'
  | 'number'
  | 'phone'
  | 'url'
  | 'email'
  | 'duration'
  | 'currency'
  | 'rating'
  | 'percent'
  | 'link_record'
  | 'checkbox'
  | 'auto_number'
  | 'barcode'
  | 'formula'
  | 'image'

export interface FieldTypeDefinition {
  id: FieldTypeId
  label: string
  icon: string // Lucide icon name
  description: string
  category: 'text' | 'choice' | 'number' | 'date' | 'link' | 'other'
  shortLabel?: string
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
  { id: 'text', label: 'Texte sur une seule ligne', shortLabel: 'Texte', icon: 'Type', description: 'Texte court', category: 'text' },
  { id: 'text_long', label: 'Texte long', icon: 'AlignLeft', description: 'Texte multi-lignes', category: 'text' },
  { id: 'text_rich', label: 'Texte long avec formatage', shortLabel: 'Texte riche', icon: 'FileText', description: 'Texte avec mise en forme', category: 'text' },
  { id: 'select_multiple', label: 'Selection multiple', shortLabel: 'Multi-select', icon: 'ListChecks', description: 'Plusieurs choix possibles', category: 'choice' },
  { id: 'select_single', label: 'Selection unique', shortLabel: 'Select', icon: 'CircleCheck', description: 'Un seul choix', category: 'choice' },
  { id: 'date', label: 'Date', icon: 'CalendarDays', description: 'Date et heure', category: 'date' },
  { id: 'number', label: 'Nombre', icon: 'Hash', description: 'Valeur numerique', category: 'number' },
  { id: 'phone', label: 'Numero de telephone', shortLabel: 'Telephone', icon: 'Phone', description: 'Format telephone', category: 'text' },
  { id: 'url', label: 'URL', icon: 'Link', description: 'Lien web', category: 'link' },
  { id: 'email', label: 'Adresse e-mail', shortLabel: 'Email', icon: 'Mail', description: 'Adresse email', category: 'text' },
  { id: 'duration', label: 'Duree', icon: 'Clock', description: 'Duree en heures/minutes', category: 'date' },
  { id: 'currency', label: 'Devise', icon: 'DollarSign', description: 'Montant monetaire', category: 'number' },
  { id: 'rating', label: 'Evaluation', icon: 'Star', description: 'Note / etoiles', category: 'number' },
  { id: 'percent', label: 'Pourcentage', icon: 'Percent', description: 'Valeur en %', category: 'number' },
  { id: 'link_record', label: 'Lier a une autre entree', shortLabel: 'Lien', icon: 'ArrowUpRight', description: 'Reference croisee', category: 'link' },
  { id: 'checkbox', label: 'Case a cocher', shortLabel: 'Checkbox', icon: 'CheckSquare', description: 'Oui / Non', category: 'other' },
  { id: 'auto_number', label: 'Numero automatique', shortLabel: 'Auto-num', icon: 'ListOrdered', description: 'Incrementation auto', category: 'number' },
  { id: 'barcode', label: 'Code-barres', icon: 'Barcode', description: 'Code-barres / QR', category: 'other' },
  { id: 'formula', label: 'Formule', icon: 'Calculator', description: 'Calcul automatique', category: 'other' },
  { id: 'image', label: 'Image / Piece jointe', shortLabel: 'Image', icon: 'Image', description: 'Fichier attache', category: 'other' },
]

export interface ExcelColumn {
  key: string
  label: string
  fieldType: FieldTypeId
  detectedType: FieldTypeId
  isPrimary: boolean
  width: number
  stats?: ColumnStats
  taxonomy?: TaxonomyTag[]
  decimals?: number
  formula?: string
  formulaResultType?: 'auto' | 'number' | 'text'
  formulaDecimals?: number | null
}

export interface ColumnStats {
  min: number | string | null
  max: number | string | null
  avg: number | null
  count: number
  empty: number
  unique: number
}

export interface TaxonomyTag {
  id: string
  label: string
  color: string
  parentId?: string
}

export interface TaxonomyCategory {
  id: string
  name: string
  color: string
  tags: TaxonomyTag[]
}

export type CellValue = string | number | boolean | null

export interface ExcelRow {
  _id: string
  [key: string]: CellValue
}

/** Maps column key → taxonomy level (1 = top category, 2+ = sub-levels) */
export interface TaxonomyLevelMap {
  [colKey: string]: number
}

export interface ExcelSheet {
  name: string
  columns: ExcelColumn[]
  rows: ExcelRow[]
  taxonomy: TaxonomyCategory[]
  hiddenColumns?: string[]
  taxonomyLevels?: TaxonomyLevelMap
}
