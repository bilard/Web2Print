import { z } from 'zod'

// ─── Champs du formulaire client ────────────────────────────────────────────
export const ClientFormFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'email',
  'select',
  'color',
  'logo_upload',
  'budget_range',
  'address',
])

export const ClientFormFieldSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  type: ClientFormFieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.string()).optional(),
  group: z.string().optional(),
  order: z.number().int().nonnegative(),
  builtin: z.boolean(),
})

// ─── Questions dynamiques ───────────────────────────────────────────────────
export const DynamicQuestionTypeSchema = z.enum([
  'text',
  'number',
  'select',
  'multiselect',
  'boolean',
])

export const DynamicQuestionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  type: DynamicQuestionTypeSchema,
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  helpText: z.string().optional(),
})

// ─── Panier ─────────────────────────────────────────────────────────────────
export const CartItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string(),
  categoryNodeId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  unitPriceOverride: z.number().nonnegative().optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  aiJustification: z.string().optional(),
  source: z.enum(['ai', 'manual']),
})

export const CartDiscountSchema = z.object({
  type: z.enum(['percent', 'amount']),
  value: z.number().nonnegative(),
})

// ─── Slide spec (union discriminée) ─────────────────────────────────────────
export const SlideSpecSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    title: z.string(),
    subtitle: z.string(),
    heroPrompt: z.string(),
  }),
  z.object({
    type: z.literal('context'),
    title: z.string(),
    bullets: z.array(z.string()).max(6),
  }),
  z.object({
    type: z.literal('product_grid'),
    title: z.string(),
    productSkus: z.array(z.string()).min(1).max(6),
    layout: z.enum(['2x2', '3x2', '1x3']),
  }),
  z.object({
    type: z.literal('product_focus'),
    title: z.string(),
    productSku: z.string(),
    keyPoints: z.array(z.string()).max(4),
    imagePrompt: z.string(),
  }),
  z.object({
    type: z.literal('budget'),
    title: z.string(),
    showTotal: z.boolean(),
    showItemized: z.boolean(),
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string(),
    message: z.string(),
    contactEmail: z.string().email().optional(),
  }),
])

// ─── Statut & étape du brief ────────────────────────────────────────────────
export const BriefStatusSchema = z.enum([
  'draft',
  'form_filled',
  'cart_ready',
  'deck_ready',
  'completed',
])

export const BriefStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])
