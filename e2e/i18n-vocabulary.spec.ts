// e2e/i18n-vocabulary.spec.ts
// Valide l'enforcement SERVEUR du vocabulaire de compte (firestore.rules).
// Le vocabulaire engage TOUS les membres d'un compte : ce qui est testé ici,
// c'est qu'on ne peut ni l'écrire sans la permission, ni l'écrire chez le
// voisin. Même approche que rbac.spec.ts — pas de navigateur, on parle à
// l'émulateur avec le vrai jeton du user et les vraies règles.
import { test, expect } from '@playwright/test'

const PROJECT = 'web2print-6fe5a'
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

interface TestUser { uid: string; idToken: string }

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

/** Prépare un user rattaché à `accountId`, avec ou sans la permission d'édition. */
async function makeMember(accountId: string, withPermission: boolean): Promise<TestUser> {
  const user = await createUser(`vocab-${accountId}-${withPermission}-${Date.now()}@example.com`)
  const roleId = `e2e-vocab-${Date.now()}-${withPermission}`
  const permissions = [{ stringValue: 'library.view' }]
  if (withPermission) permissions.push({ stringValue: 'settings.i18n.edit' })
  await seedDoc(`roles/${roleId}`, { permissions: { arrayValue: { values: permissions } } })
  await seedDoc(`users/${user.uid}`, {
    accessRoleId: { stringValue: roleId },
    accountId: { stringValue: accountId },
  })
  return user
}

/** Tente d'écrire les surcharges FR d'un compte, avec le jeton du user. */
async function tryWriteOverrides(user: TestUser, accountId: string): Promise<number> {
  const res = await fetch(`${FS}/accounts/${accountId}/i18nOverrides/fr`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({
      fields: { updatedBy: { stringValue: user.uid }, updatedAt: { integerValue: '1' } },
    }),
  })
  return res.status
}

test("un membre sans la permission ne peut pas réécrire le vocabulaire", async () => {
  const user = await makeMember(`acct-nope-${Date.now()}`, false)
  expect(await tryWriteOverrides(user, `acct-nope-${Date.now()}`)).toBe(403)
})

test('la permission settings.i18n.edit ouvre le vocabulaire de SON compte', async () => {
  const accountId = `acct-ok-${Date.now()}`
  const user = await makeMember(accountId, true)
  expect(await tryWriteOverrides(user, accountId)).toBe(200)
})

test("la permission ne donne AUCUN droit sur le compte d'un tiers", async () => {
  // Le scénario qui justifie `ownAccount()` : porter la permission chez soi ne
  // doit pas permettre de renommer les libellés d'une autre entreprise.
  const mine = `acct-mine-${Date.now()}`
  const theirs = `acct-theirs-${Date.now()}`
  const user = await makeMember(mine, true)
  expect(await tryWriteOverrides(user, theirs)).toBe(403)
})

test('un membre ne peut pas se rattacher au compte de son choix', async () => {
  // L'escalade que ferme l'ajout d'`accountId` aux champs réservés : sans elle,
  // il suffisait de changer son propre `accountId` pour contourner le test
  // ci-dessus et écrire chez le voisin en toute légalité.
  const user = await makeMember(`acct-fixed-${Date.now()}`, true)
  const res = await fetch(`${FS}/users/${user.uid}?updateMask.fieldPaths=accountId`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ fields: { accountId: { stringValue: 'acct-de-la-victime' } } }),
  })
  expect(res.status).toBe(403)
})

test("l'admin, lui, PEUT rattacher un membre à un compte", async () => {
  // Contrepartie du test précédent : le rattachement doit rester possible, sinon
  // l'écran « Utilisateurs & rôles » aurait un bouton qui échoue toujours. Le
  // jeton porte l'email owner, comme en réel (`isAdmin()` compare l'email).
  const admin = await createUser(`ibs.studio@gmail.com`).catch(async () => {
    // Le compte owner survit d'une suite à l'autre dans l'émulateur.
    const res = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake-emulator-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ibs.studio@gmail.com', password: 'e2e-password', returnSecureToken: true }),
    })
    const json = (await res.json()) as { localId: string; idToken: string }
    return { uid: json.localId, idToken: json.idToken }
  })

  const member = await makeMember(`acct-before-${Date.now()}`, false)
  const res = await fetch(`${FS}/users/${member.uid}?updateMask.fieldPaths=accountId`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ fields: { accountId: { stringValue: 'acct-after' } } }),
  })
  expect(res.status).toBe(200)
})

test('un membre actif peut LIRE le vocabulaire de son compte', async () => {
  // La lecture est ouverte à tout compte actif : sans elle, l'interface
  // s'afficherait d'abord en vocabulaire générique puis basculerait sous les
  // yeux du client.
  const accountId = `acct-read-${Date.now()}`
  const editor = await makeMember(accountId, true)
  expect(await tryWriteOverrides(editor, accountId)).toBe(200)

  const reader = await makeMember(accountId, false)
  const res = await fetch(`${FS}/accounts/${accountId}/i18nOverrides/fr`, {
    headers: { Authorization: `Bearer ${reader.idToken}` },
  })
  expect(res.status).toBe(200)
})
