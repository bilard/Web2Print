// e2e/rbac.spec.ts
// Valide l'enforcement SERVEUR des permissions (RBAC Phase 4, firestore.rules)
// avec un compte NON-owner : les requêtes Firestore portent le vrai jeton du
// user contre l'émulateur (règles réelles chargées) — pas de navigateur ici,
// on teste la couche règles directement.
import { test, expect } from '@playwright/test'

const PROJECT = 'web2print-6fe5a'
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

interface TestUser { uid: string; idToken: string }

/** Crée un compte email/password directement dans l'émulateur Auth. */
async function createUser(email: string): Promise<TestUser> {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake-emulator-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'e2e-password', returnSecureToken: true }),
  })
  const json = (await res.json()) as { localId?: string; idToken?: string; error?: { message?: string } }
  if (!json.localId || !json.idToken) throw new Error(`signUp échoué : ${json.error?.message}`)
  return { uid: json.localId, idToken: json.idToken }
}

/** Écrit un doc en BYPASSANT les règles (seed de l'état de test). */
async function seedDoc(path: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${FS}/${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`seed ${path} : ${res.status} ${await res.text()}`)
}

/** Tente de créer projects/{id} AVEC le jeton du user (règles appliquées). */
async function tryCreateProject(user: TestUser, docId: string): Promise<number> {
  const res = await fetch(`${FS}/projects?documentId=${docId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({
      fields: {
        ownerId: { stringValue: user.uid },
        title: { stringValue: 'doc rbac' },
        createdAt: { integerValue: '1' },
      },
    }),
  })
  return res.status
}

test('un compte sans rôle (pending) ne peut pas créer de projet côté serveur', async () => {
  const user = await createUser(`pending-${Date.now()}@example.com`)
  // Profil minimal SANS accessRoleId — l'état d'un compte fraîchement inscrit.
  await seedDoc(`users/${user.uid}`, { email: { stringValue: 'p@example.com' } })
  expect(await tryCreateProject(user, `rbac-pending-${Date.now()}`)).toBe(403)
})

test('un rôle limité ouvre exactement les permissions accordées', async () => {
  const user = await createUser(`limited-${Date.now()}@example.com`)
  const roleId = `e2e-limited-${Date.now()}`
  await seedDoc(`roles/${roleId}`, {
    permissions: {
      arrayValue: { values: [{ stringValue: 'library.view' }, { stringValue: 'library.create' }] },
    },
  })
  await seedDoc(`users/${user.uid}`, {
    accessRoleId: { stringValue: roleId },
  })

  // library.create accordé → création de projet AUTORISÉE.
  const docId = `rbac-ok-${Date.now()}`
  expect(await tryCreateProject(user, docId)).toBe(200)

  // library.delete NON accordé → suppression REFUSÉE (même sur son propre doc).
  const del = await fetch(`${FS}/projects/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${user.idToken}` },
  })
  expect(del.status).toBe(403)

  // taxonomies.edit NON accordé → création de taxonomie REFUSÉE.
  const tax = await fetch(`${FS}/taxonomies?documentId=rbac-tax-${Date.now()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ fields: { ownerId: { stringValue: user.uid } } }),
  })
  expect(tax.status).toBe(403)
})

test('un compte bloqué perd toute écriture même avec un rôle complet', async () => {
  const user = await createUser(`blocked-${Date.now()}@example.com`)
  const roleId = `e2e-full-${Date.now()}`
  await seedDoc(`roles/${roleId}`, {
    permissions: { arrayValue: { values: [{ stringValue: 'library.view' }, { stringValue: 'library.create' }] } },
  })
  await seedDoc(`users/${user.uid}`, {
    accessRoleId: { stringValue: roleId },
    accessBlocked: { booleanValue: true },
  })
  expect(await tryCreateProject(user, `rbac-blocked-${Date.now()}`)).toBe(403)
})

test('une révocation (accessRevokes) prime sur le rôle', async () => {
  const user = await createUser(`revoked-${Date.now()}@example.com`)
  const roleId = `e2e-revoke-${Date.now()}`
  await seedDoc(`roles/${roleId}`, {
    permissions: { arrayValue: { values: [{ stringValue: 'library.view' }, { stringValue: 'library.create' }] } },
  })
  await seedDoc(`users/${user.uid}`, {
    accessRoleId: { stringValue: roleId },
    accessRevokes: { arrayValue: { values: [{ stringValue: 'library.create' }] } },
  })
  expect(await tryCreateProject(user, `rbac-revoked-${Date.now()}`)).toBe(403)
})
