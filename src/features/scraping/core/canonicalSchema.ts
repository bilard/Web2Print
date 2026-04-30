import { z } from 'zod'

export const EnrichedProductSchema = z.object({
  url: z.string().url(),
  scrapedAt: z.number(),

  identity: z.object({
    name: z.string().min(1),
    reference: z.string().nullable(),
    brand: z.string().nullable(),
    ean: z.string().nullable(),
    breadcrumb: z.array(z.string()).default([]),
  }),

  marketing: z.object({
    subtitle: z.string().nullable(),
    description: z.string().nullable(),
    advantages: z.array(z.object({
      text: z.string(),
      group: z.string().optional(),
    })).default([]),
  }),

  commercial: z.object({
    price: z.object({
      amount: z.number().nullable(),
      currency: z.string().default('EUR'),
      raw: z.string(),
    }).nullable(),
    availability: z.string().nullable(),
  }),

  specifications: z.array(z.object({
    group: z.string(),
    name: z.string(),
    value: z.string(),
  })).default([]),

  variants: z.array(z.object({
    reference: z.string(),
    label: z.string(),
    properties: z.record(z.string(), z.string()),
  })).default([]),

  media: z.object({
    images: z.array(z.string().url()).default([]),
    documents: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
      filename: z.string(),
    })).default([]),
  }),

  meta: z.object({
    sourcesScraped: z.array(z.string()),
    llmModel: z.string(),
    llmProvider: z.enum(['claude', 'gemini', 'openai']),
    warnings: z.array(z.string()).default([]),
  }),
})

export type EnrichedProduct = z.infer<typeof EnrichedProductSchema>
