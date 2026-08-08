// Lecture des produits à enrichir, écriture des révisions et de la synthèse de passage.
// Adaptateur Firestore FIN — toute la décision vit dans les modules purs voisins.
//
// ⚠ La carte travaille sur un PROJET PIM, pas sur une feuille reçue par un edge. C'est
// inhabituel pour un node — les workflows manipulent des feuilles — mais c'est le même
// choix que « Comparer catalogue », qui relit son index dans Firestore : le volume ne doit
// pas transiter par la mémoire du run, et la donnée enrichie doit vivre là où les écrans
// la lisent. Une feuille traversant le graphe ne porterait pas les révisions, et la
// source resterait à réécrire — ce que l'utilisateur a explicitement exclu.
import { collection, doc, getDocs, writeBatch, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { stripUndefined } from '@/lib/stripUndefined'
import type { EnrichableField } from './revision'
import type { EnrichPass } from './revision'
import type { EnrichTarget } from './pass'

const PROJECTS = 'pim_projects'
const PRODUCTS = 'products'
/** Synthèses de passage, sous le projet : c'est par là que l'écran de comparaison entre. */
const PASSES = 'enrichPasses'

/** Produit tel qu'il vit en base, réduit à ce que l'enrichissement regarde. */
interface StoredProduct {
  _id: string
  fields?: Record<string, EnrichableField>
}

/**
 * Relit les produits d'un projet.
 *
 * ⚠ Aucune pagination ici, volontairement : le passage a besoin de TOUS les produits pour
 * chiffrer honnêtement le travail restant (« 412 sur 231 000 »). Un échantillon donnerait
 * un dénominateur faux, et l'utilisateur déciderait sur un chiffre inventé. Sur un
 * catalogue de 115 000 fiches, c'est une lecture lourde mais unique par passage.
 */
export async function loadTargets(projectId: string): Promise<EnrichTarget[]> {
  const snap = await getDocs(collection(db, PROJECTS, projectId, PRODUCTS))
  return snap.docs.map((d) => {
    const data = d.data() as StoredProduct
    const fields = data.fields ?? {}
    return {
      id: d.id,
      fields,
      // Les valeurs voisines servent aux gabarits (marque, référence, code-barres).
      row: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f?.value ?? null])),
    }
  })
}

/**
 * Écrit les champs révisés.
 *
 * ⚠ Écriture par CHAMP (`fields.<clé>`), jamais du produit entier. Un passage tourne
 * pendant que d'autres écrans travaillent ; réécrire tout le document effacerait ce qu'ils
 * viennent d'enregistrer. Firestore sait viser un champ imbriqué, il faut s'en servir.
 */
export async function saveRevisions(
  projectId: string,
  revisions: { productId: string; field: string; value: EnrichableField }[],
): Promise<void> {
  // Firestore plafonne à 500 opérations par lot : on reste en dessous avec de la marge.
  for (let i = 0; i < revisions.length; i += 400) {
    const batch = writeBatch(db)
    for (const r of revisions.slice(i, i + 400)) {
      batch.set(
        doc(db, PROJECTS, projectId, PRODUCTS, r.productId),
        stripUndefined({ fields: { [r.field]: r.value }, updatedAt: Date.now() }),
        { merge: true },
      )
    }
    await batch.commit()
  }
}

/**
 * Enregistre la synthèse du passage — la porte d'entrée de l'écran de comparaison.
 *
 * ⚠ La liste des produits touchés est BORNÉE. Un passage qui en révise cinquante mille
 * dépasserait la limite d'un document Firestore, et l'écriture échouerait en bloc : on
 * perdrait alors la trace de tout le passage, y compris des révisions déjà écrites. Mieux
 * vaut une liste tronquée, et le dire.
 */
const MAX_IDS = 5000

export async function savePass(projectId: string, pass: EnrichPass): Promise<void> {
  const truncated = pass.productIds.length > MAX_IDS
  await setDoc(
    doc(db, PROJECTS, projectId, PASSES, pass.passId),
    stripUndefined({
      ...pass,
      productIds: truncated ? pass.productIds.slice(0, MAX_IDS) : pass.productIds,
      ...(truncated ? { productIdsTruncated: pass.productIds.length } : {}),
      writtenAt: serverTimestamp(),
    }),
  )
}
