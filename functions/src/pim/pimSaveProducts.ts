// functions/src/pim/pimSaveProducts.ts
// Écriture SERVEUR des produits PIM pour les comptes démo : chemin infalsifiable.
// Les firestore.rules refusent l'écriture directe de `pim_projects/*/products` aux
// comptes démo → ils ne peuvent ajouter des lignes QUE par cette callable, qui
// impose le quota `usage.pimRows` (Admin SDK, hors des rules). Les comptes non-démo
// continuent d'écrire en direct côté client (perf), cette CF n'est appelée que pour eux.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { isDemoLimited, DEMO_PIM_LIMIT } from '../access/demo'

if (!getApps().length) initializeApp()

const MAX_BATCH = 500 // garde-fou anti-abus (un lot d'import raisonnable reste < 500)

export const pimSaveProducts = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const uid = request.auth.uid
    const { projectId, products } = (request.data ?? {}) as { projectId?: string; products?: unknown[] }
    if (typeof projectId !== 'string' || !projectId) throw new HttpsError('invalid-argument', 'projectId manquant')
    if (!Array.isArray(products) || products.length === 0) throw new HttpsError('invalid-argument', 'products manquant')
    if (products.length > MAX_BATCH) throw new HttpsError('invalid-argument', `Lot trop grand (${products.length} > ${MAX_BATCH})`)

    const db = getFirestore()
    const projRef = db.collection('pim_projects').doc(projectId)
    const projSnap = await projRef.get()
    // Possession : si le projet existe, il doit appartenir au caller (sinon écriture
    // interdite). Projet absent = toléré (créé dans le même flux client), comme les rules.
    if (projSnap.exists && projSnap.data()?.userId !== uid) throw new HttpsError('permission-denied', 'Projet non possédé')

    const email = (request.auth.token.email as string | undefined) ?? null
    const demo = await isDemoLimited(db, uid, email)
    const userRef = db.collection('users').doc(uid)
    if (demo) {
      const used = ((await userRef.get()).data()?.usage?.pimRows as number | undefined) ?? 0
      if (used + products.length > DEMO_PIM_LIMIT) {
        const left = Math.max(0, DEMO_PIM_LIMIT - used)
        throw new HttpsError('resource-exhausted', `Limite démo : ${DEMO_PIM_LIMIT} lignes PIM maximum (${left} restante(s)).`)
      }
    }

    // Écriture par lots de 400 (merge par _id), miroir du saveProducts client.
    const items = products as { _id?: string }[]
    let batch = db.batch()
    let n = 0
    for (const p of items) {
      const id = typeof p._id === 'string' && p._id ? p._id : projRef.collection('products').doc().id
      batch.set(projRef.collection('products').doc(id), { ...p, _id: id }, { merge: true })
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    if (n % 400 !== 0) await batch.commit()

    if (demo) await userRef.set({ usage: { pimRows: FieldValue.increment(products.length) } }, { merge: true })
    return { count: products.length }
  },
)
