import type {
  ClientFormField,
  ClientFormFieldType,
} from '@/features/taxonomy/types'
import type { LucideIcon } from 'lucide-react'
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  List,
  Palette,
  ImageUp,
  Wallet,
  MapPin,
} from 'lucide-react'

interface FieldTypeMeta {
  label: string
  icon: LucideIcon
}

export const FIELD_TYPE_REGISTRY: Record<ClientFormFieldType, FieldTypeMeta> = {
  text:         { label: 'Texte court',      icon: Type },
  textarea:     { label: 'Texte long',       icon: AlignLeft },
  number:       { label: 'Nombre',           icon: Hash },
  email:        { label: 'Email',            icon: Mail },
  select:       { label: 'Liste déroulante', icon: List },
  color:        { label: 'Couleur',          icon: Palette },
  logo_upload:  { label: 'Logo',             icon: ImageUp },
  budget_range: { label: 'Fourchette budget',icon: Wallet },
  address:      { label: 'Adresse',          icon: MapPin },
}

export const ALL_FIELD_TYPES = Object.keys(
  FIELD_TYPE_REGISTRY,
) as ClientFormFieldType[]

const LABEL_BY_TYPE: Record<ClientFormFieldType, string> = {
  text: 'Nouveau champ texte',
  textarea: 'Nouveau champ long',
  number: 'Nouveau champ nombre',
  email: 'Nouvel email',
  select: 'Nouvelle liste',
  color: 'Nouvelle couleur',
  logo_upload: 'Nouveau logo',
  budget_range: 'Nouveau budget',
  address: 'Nouvelle adresse',
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

/**
 * Crée un champ custom (non-builtin) vierge du type demandé.
 */
export function createEmptyField(
  type: ClientFormFieldType,
  order: number,
): ClientFormField {
  const id = nextId('field')
  const base: ClientFormField = {
    id,
    key: `custom_${id}`,
    label: LABEL_BY_TYPE[type],
    type,
    required: false,
    order,
    builtin: false,
  }
  if (type === 'select') {
    base.options = ['Option 1']
  }
  return base
}
