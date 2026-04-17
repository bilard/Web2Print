import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, writeBatch } from 'firebase/firestore'
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

/**
 * Sauvegarde un template ET propage son `vendorPrompt` à tous les autres
 * templates du même `vendorDomain`. Utilise un writeBatch Firestore.
 *
 * Pourquoi : pas d'entité Fournisseur séparée → chaque template stocke sa
 * copie du prompt fournisseur. La sync garantit la cohérence sans refonte.
 */
export async function saveTemplateWithVendorSync(template: ScrapingTemplate): Promise<{ syncedCount: number }> {
  const parsed = scrapingTemplateSchema.safeParse(template)
  if (!parsed.success) {
    throw new Error(`Template invalide : ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }

  const batch = writeBatch(db)
  let syncedCount = 0

  // 1. Lire les autres templates du même vendorDomain
  const q = query(collection(db, COLLECTION), where('vendorDomain', '==', template.vendorDomain))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (d.id === template.id) continue
    const otherParsed = scrapingTemplateSchema.safeParse({ ...d.data(), id: d.id })
    if (!otherParsed.success) continue
    const other = otherParsed.data
    if ((other.vendorPrompt ?? '') !== (template.vendorPrompt ?? '')) {
      const updated = stripUndefined({
        ...other,
        vendorPrompt: template.vendorPrompt,
        updatedAt: Date.now(),
      })
      batch.set(doc(db, COLLECTION, d.id), updated)
      syncedCount += 1
    }
  }

  // 2. Écrire le template principal en dernier dans le batch
  const data = stripUndefined({ ...parsed.data, updatedAt: Date.now() })
  batch.set(doc(db, COLLECTION, template.id), data)

  await batch.commit()
  invalidateTemplatesCache()
  return { syncedCount }
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
