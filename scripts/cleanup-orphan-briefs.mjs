#!/usr/bin/env node
/**
 * cleanup-orphan-briefs.mjs
 *
 * Détecte (et optionnellement supprime) les dossiers orphelins sous
 * `briefs/` dans Firebase Storage — c'est-à-dire les dossiers dont l'ID
 * ne correspond à aucun document Firestore dans la collection `briefs`.
 *
 * Usage :
 *   # Dry-run (liste uniquement, ne supprime rien) — défaut
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/cleanup-orphan-briefs.mjs
 *
 *   # Suppression réelle
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/cleanup-orphan-briefs.mjs --delete
 *
 * Pré-requis :
 *   - npm i -D firebase-admin
 *   - Clé de service du projet web2print-6fe5a exportée via
 *     la variable d'environnement GOOGLE_APPLICATION_CREDENTIALS
 *     (chemin vers le fichier JSON).
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { readFileSync } from 'node:fs'

const BUCKET = 'web2print-6fe5a.firebasestorage.app'
const PREFIX = 'briefs/'
const DELETE = process.argv.includes('--delete')

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!keyPath) {
  console.error(
    'Erreur : la variable GOOGLE_APPLICATION_CREDENTIALS doit pointer vers la clé de service Firebase.',
  )
  process.exit(1)
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
  storageBucket: BUCKET,
})

const db = getFirestore()
const bucket = getStorage().bucket()

console.log(`Mode : ${DELETE ? 'SUPPRESSION RÉELLE' : 'dry-run'}`)
console.log(`Bucket : gs://${BUCKET}`)
console.log('Lecture des briefs Firestore…')

const snap = await db.collection('briefs').get()
const validIds = new Set(snap.docs.map((d) => d.id))
console.log(`  → ${validIds.size} briefs trouvés dans Firestore`)

console.log(`Listing des fichiers sous ${PREFIX}…`)
const [files] = await bucket.getFiles({ prefix: PREFIX })
console.log(`  → ${files.length} fichiers Storage`)

// Extraire les IDs de premier niveau : briefs/{id}/...
const folderIds = new Set()
for (const file of files) {
  const parts = file.name.split('/') // ['briefs', '{id}', ...]
  if (parts.length >= 2 && parts[1]) folderIds.add(parts[1])
}
console.log(`  → ${folderIds.size} dossiers uniques`)

const orphans = [...folderIds].filter((id) => !validIds.has(id)).sort()

console.log('')
console.log(`Orphelins détectés : ${orphans.length}`)
orphans.forEach((id) => console.log('  -', id))

if (orphans.length === 0) {
  console.log('\nAucun orphelin. ✓')
  process.exit(0)
}

if (!DELETE) {
  console.log('\nDry-run : aucun fichier supprimé.')
  console.log('Relance avec --delete pour supprimer réellement.')
  process.exit(0)
}

console.log('\nSuppression des orphelins…')
for (const id of orphans) {
  const prefix = `${PREFIX}${id}/`
  try {
    await bucket.deleteFiles({ prefix })
    console.log(`  ✓ Supprimé ${prefix}`)
  } catch (err) {
    console.error(`  ✗ Échec ${prefix} :`, err.message)
  }
}

console.log('\nTerminé.')
