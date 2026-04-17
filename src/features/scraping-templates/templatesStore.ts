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

/** Strip récursif des clés `undefined` : Firestore v10 rejette les undefined par défaut
 *  (pas de ignoreUndefinedProperties activé). Sans ce strip, les strategies avec
 *  `attr: undefined` font échouer le setDoc — et le dernier champ custom est perdu. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

export async function saveTemplate(template: ScrapingTemplate): Promise<void> {
  const parsed = scrapingTemplateSchema.safeParse(template)
  if (!parsed.success) {
    throw new Error(`Template invalide : ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }
  const data = stripUndefined({ ...parsed.data, updatedAt: Date.now() })
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
