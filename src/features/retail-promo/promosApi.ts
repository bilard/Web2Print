import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from './stripUndefined'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import type { PromoTemplateConfig, PromoColorKey } from './RetailPromoCard'

/** Fiche promo enregistrée (métadonnées + habillage ; les lignes vivent dans un doc payload séparé). */
export interface SavedPromoMeta {
  id: string
  name: string
  sourceRef: DataSourceRef | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  config: PromoTemplateConfig
  rowCount: number
  updatedAt: number
  thumbnail?: string // vignette JPEG (data-URL réduit) du visuel courant
}
export interface PromoPayload {
  columns: MergeColumn[]
  rows: MergeRow[]
  imgOverride?: Record<number, string> // images produit remplacées (panneau Images)
  textOverride?: Record<number, Partial<Record<PromoColorKey, string>>> // textes personnalisés par produit
}
export interface SavePromoInput {
  name: string
  sourceRef: DataSourceRef | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  config: PromoTemplateConfig
  columns: MergeColumn[]
  rows: MergeRow[]
  imgOverride?: Record<number, string>
  textOverride?: Record<number, Partial<Record<PromoColorKey, string>>>
  thumbnail?: string
}

const metaCol = (uid: string) => collection(db, 'users', uid, 'promos')
const payloadDoc = (uid: string, id: string) => doc(db, 'users', uid, 'promoPayloads', id)
const MAX_PAYLOAD = 900_000 // garde-fou limite Firestore ~1 Mo/doc

/** Enregistre la fiche courante (méta + lignes). Renvoie l'id. Throw si trop volumineux. */
export async function savePromo(input: SavePromoInput, existingId?: string): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const payload: PromoPayload = { columns: input.columns, rows: input.rows, imgOverride: input.imgOverride, textOverride: input.textOverride }
  const payloadJson = JSON.stringify(payload)
  if (payloadJson.length > MAX_PAYLOAD) throw new Error('Catalogue trop volumineux pour être sauvegardé (> 900 Ko)')

  const ref = existingId ? doc(metaCol(uid), existingId) : doc(metaCol(uid))
  // stripUndefined : Firestore rejette tout le doc si fieldMap/config contient un undefined
  // (champ « (non mappé) », style remis par défaut) → fiche jamais enregistrée.
  await setDoc(ref, {
    ...stripUndefined({
      name: input.name, sourceRef: input.sourceRef, fieldMap: input.fieldMap,
      config: input.config, rowCount: input.rows.length,
      ...(input.thumbnail ? { thumbnail: input.thumbnail } : null),
    }),
    updatedAt: serverTimestamp(),
  })
  await setDoc(payloadDoc(uid, ref.id), { payload: payloadJson, updatedAt: serverTimestamp() })
  return ref.id
}

/** Liste les fiches enregistrées (méta seules, triées du plus récent au plus ancien). */
export async function listPromos(): Promise<SavedPromoMeta[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(metaCol(uid))
  return snap.docs
    .map((d) => {
      const v = d.data()
      return {
        id: d.id, name: String(v.name ?? d.id), sourceRef: (v.sourceRef ?? null) as DataSourceRef | null,
        fieldMap: (v.fieldMap ?? {}) as SavedPromoMeta['fieldMap'], config: v.config as PromoTemplateConfig,
        rowCount: Number(v.rowCount ?? 0), updatedAt: Number(v.updatedAt?.seconds ?? 0) * 1000,
        thumbnail: v.thumbnail as string | undefined,
      }
    })
    .filter((p) => p.config)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Charge les lignes d'une fiche enregistrée. */
export async function loadPromoPayload(id: string): Promise<PromoPayload | null> {
  const uid = auth.currentUser?.uid
  if (!uid) return null
  const snap = await getDoc(payloadDoc(uid, id))
  if (!snap.exists()) return null
  try { return JSON.parse(String(snap.data().payload)) as PromoPayload } catch { return null }
}

/** Supprime une fiche (méta + payload). */
export async function deletePromo(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(metaCol(uid), id)).catch(() => {})
  await deleteDoc(payloadDoc(uid, id)).catch(() => {})
}
