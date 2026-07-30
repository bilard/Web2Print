import type {
  ClientFormField,
  ClientFormFieldType,
} from '@/features/taxonomy/types'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n'
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  List,
  Palette,
  ImageUp,
  Package,
  Wallet,
  MapPin,
} from 'lucide-react'

interface FieldTypeMeta {
  labelKey: TranslationKey
  icon: LucideIcon
}

// ⚠️ CLÉS, pas `t()` : cet objet est évalué au CHARGEMENT du module. Un texte
// traduit ici resterait dans la langue de départ après un changement de langue.
export const FIELD_TYPE_REGISTRY: Record<ClientFormFieldType, FieldTypeMeta> = {
  text:             { labelKey: 'br.ft.text',     icon: Type },
  textarea:         { labelKey: 'br.ft.textarea', icon: AlignLeft },
  number:           { labelKey: 'br.ft.number',   icon: Hash },
  email:            { labelKey: 'br.ft.email',    icon: Mail },
  select:           { labelKey: 'br.ft.select',   icon: List },
  color:            { labelKey: 'br.ft.color',    icon: Palette },
  logo_upload:      { labelKey: 'br.ft.logo',     icon: ImageUp },
  brand_kit_upload: { labelKey: 'br.ft.brandKit', icon: Package },
  budget_range:     { labelKey: 'br.ft.budget',   icon: Wallet },
  address:          { labelKey: 'br.ft.address',  icon: MapPin },
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
  brand_kit_upload: 'Nouveau brand kit',
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
