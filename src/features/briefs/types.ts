import type { Timestamp } from 'firebase/firestore'
import type {
  ClientFormField,
  DynamicQuestion,
} from '@/features/taxonomy/types'

// ─── Item du panier ─────────────────────────────────────────────────────────
export interface CartItem {
  sku: string
  name: string
  categoryNodeId: string         // traçabilité taxonomie
  quantity: number
  unitPrice?: number             // prix catalogue d'origine
  unitPriceOverride?: number     // prix édité par l'utilisateur
  imageUrl?: string
  description?: string
  aiJustification?: string
  source: 'ai' | 'manual'
}

// ─── Remise globale ─────────────────────────────────────────────────────────
export interface CartDiscount {
  type: 'percent' | 'amount'
  value: number
}

// ─── Spec d'une slide (union discriminée) ───────────────────────────────────
export type SlideSpec =
  | {
      type: 'cover'
      title: string
      subtitle: string
      heroPrompt: string
    }
  | {
      type: 'context'
      title: string
      bullets: string[]
    }
  | {
      type: 'product_grid'
      title: string
      productSkus: string[]
      layout: '2x2' | '3x2' | '1x3'
    }
  | {
      type: 'product_focus'
      title: string
      productSku: string
      keyPoints: string[]
      imagePrompt: string
    }
  | {
      type: 'budget'
      title: string
      showTotal: boolean
      showItemized: boolean
    }
  | {
      type: 'cta'
      title: string
      message: string
      contactEmail?: string
    }

export type SlideType = SlideSpec['type']

// ─── Versions de prompts IA stockées sur le brief ───────────────────────────
export interface BriefAiVersions {
  questions?: string
  branchSelection?: string
  cart?: string
  deck?: string
}

// ─── Brief ──────────────────────────────────────────────────────────────────
export type BriefStatus =
  | 'draft'
  | 'form_filled'
  | 'cart_ready'
  | 'deck_ready'
  | 'completed'

export type BriefStep = 1 | 2 | 3 | 4 | 5

export interface Brief {
  id: string
  taxonomyId: string
  ownerId: string
  clientName: string             // dénormalisé pour la liste
  status: BriefStatus
  currentStep: BriefStep

  client: {
    formTemplateSnapshot: ClientFormField[]
    values: Record<string, unknown>
  }

  dynamicForm?: {
    selectedNodeIds: string[]
    questions: DynamicQuestion[]
    answers: Record<string, unknown>
    aiReasoning?: string
  }

  cart?: {
    items: CartItem[]
    subtotal?: number
    discount?: CartDiscount
    totalEstimate?: number
    aiReasoning?: string
  }

  deck?: {
    slides: SlideSpec[]
  }

  pptxUrl?: string

  aiVersions?: BriefAiVersions

  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Image générée pour un brief (sous-collection) ──────────────────────────
export interface BriefImage {
  id: string                     // 'hero' ou `product_${sku}`
  type: 'hero' | 'product'
  productSku?: string
  prompt: string
  url: string                    // Firebase Storage
  thumbnailUrl?: string
  updatedAt: Timestamp
}
