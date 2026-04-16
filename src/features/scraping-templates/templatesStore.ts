import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { scrapingTemplateSchema, type ScrapingTemplate } from './types'
import { invalidateTemplatesCache } from './useMatchingTemplate'

const COLLECTION = 'scrapingTemplates'

export async function listTemplates(): Promise<ScrapingTemplate[]> {
  const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  const out: ScrapingTemplate[] = []
  for (const d of snap.docs) {
    const parsed = scrapingTemplateSchema.safeParse({ ...d.data(), id: d.id })
    if (parsed.success) out.push(parsed.data)
    else console.warn('[templatesStore] invalid template', d.id, parsed.error.issues)
  }
  return out
}

export async function saveTemplate(template: ScrapingTemplate): Promise<void> {
  const parsed = scrapingTemplateSchema.safeParse(template)
  if (!parsed.success) {
    throw new Error(`Template invalide : ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }
  const data = { ...parsed.data, updatedAt: Date.now() }
  await setDoc(doc(db, COLLECTION, template.id), data)
  invalidateTemplatesCache()
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
  invalidateTemplatesCache()
}

export function emptyTemplate(vendorDomain: string): ScrapingTemplate {
  return {
    id: crypto.randomUUID(),
    name: `Template ${vendorDomain}`,
    vendorDomain,
    urlPattern: '.*',
    preActions: [],
    fields: [],
    specGroups: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    stats: { appliedCount: 0, successCount: 0 },
  }
}
