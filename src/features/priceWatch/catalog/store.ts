// src/features/priceWatch/catalog/store.ts
// Persistance de l'index catalogue concurrent. Adaptateurs Firestore FINS : toute la
// logique métier vit dans les modules purs (harvest, match, keys, prestashop).
//
// Modèle : un doc méta par concurrent (curseur inclus), un doc par page liste
// moissonnée. Le node de matching relit toutes les pages d'un site pour reconstruire
// l'index en mémoire — quelques centaines de lectures, largement sous les plafonds.
import {
  doc, collection, getDoc, getDocs, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { competitorDoc, competitorPagesCol } from '../paths'
import type { CompetitorListing } from './prestashop'
import type { HarvestCursor } from './harvest'

/** Retire les `undefined` (rejetés par Firestore) en préservant null/objets/arrays. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

export interface CompetitorMeta {
  domain: string
  /** Curseur de moisson (repris au tick suivant). Absent avant la 1ʳᵉ moisson. */
  cursor?: HarvestCursor
  /** Nombre de produits actuellement indexés (dérivé, pour l'affichage). */
  productCount?: number
  /** Nombre de pages moissonnées. */
  pageCount?: number
  /** Durée (ms) de la DERNIÈRE passe de moisson de ce concurrent. */
  lastHarvestMs?: number
  /** Cumul (ms) de toutes les passes de moisson de ce concurrent (calibrage du cron). */
  cumulHarvestMs?: number
  updatedAt?: number
}

/** Lit la méta + le curseur d'un concurrent. null si jamais moissonné. */
export async function loadCompetitorMeta(
  uid: string, watchId: string, siteId: string,
): Promise<CompetitorMeta | null> {
  const snap = await getDoc(doc(db, competitorDoc(uid, watchId, siteId)))
  return snap.exists() ? (snap.data() as CompetitorMeta) : null
}

/** Écrit/fusionne la méta d'un concurrent (curseur compris). */
export async function saveCompetitorMeta(
  uid: string, watchId: string, siteId: string, meta: Partial<CompetitorMeta>,
): Promise<void> {
  await setDoc(
    doc(db, competitorDoc(uid, watchId, siteId)),
    stripUndefined({ ...meta, updatedAt: serverTimestamp() }),
    { merge: true },
  )
}

/**
 * Enregistre les produits d'UNE page liste. Réécrit le doc de la page (id stable) →
 * rafraîchit sans doublon. Un doc = ~40 produits × ~200 o ≈ 8 Ko, loin du plafond 1 Mo.
 */
export async function savePage(
  uid: string, watchId: string, siteId: string,
  pageDocId: string, url: string, page: number, products: CompetitorListing[],
): Promise<void> {
  await setDoc(
    doc(db, competitorPagesCol(uid, watchId, siteId), pageDocId),
    stripUndefined({ url, page, products, harvestedAt: serverTimestamp() }),
  )
}

interface PageDoc {
  url: string
  page: number
  products: CompetitorListing[]
}

/**
 * Relit tous les produits indexés d'un concurrent (toutes pages confondues), pour
 * construire l'index en mémoire du matching. À l'échelle ciblée (familles à forte
 * concurrence) c'est quelques milliers de produits ; le plein catalogue reste sous
 * ~500 docs par site.
 */
export async function loadAllListings(
  uid: string, watchId: string, siteId: string,
): Promise<CompetitorListing[]> {
  const snap = await getDocs(collection(db, competitorPagesCol(uid, watchId, siteId)))
  const out: CompetitorListing[] = []
  snap.forEach((d) => {
    const data = d.data() as PageDoc
    if (Array.isArray(data.products)) out.push(...data.products)
  })
  return out
}

/** Nombre de pages moissonnées pour un concurrent (pour la méta / l'affichage). */
export async function countPages(uid: string, watchId: string, siteId: string): Promise<number> {
  const snap = await getDocs(collection(db, competitorPagesCol(uid, watchId, siteId)))
  return snap.size
}
