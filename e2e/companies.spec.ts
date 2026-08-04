// e2e/companies.spec.ts
// Cloisonnement par SOCIÉTÉ : un administrateur d'entreprise (permissions `team.*`)
// gère ses collègues et ses rôles, JAMAIS ceux d'une autre société. Comme pour
// `rbac.spec.ts`, on parle à l'émulateur Firestore avec le vrai jeton du user :
// c'est `firestore.rules` qu'on teste, pas l'écran.
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

const str = (stringValue: string) => ({ stringValue })
const strList = (v: string[]) => ({ arrayValue: { values: v.map(str) } })

/** Rôle proposable dans une ou plusieurs sociétés. */
async function seedRole(id: string, accounts: string | string[], permissions: string[]): Promise<void> {
  await seedDoc(`roles/${id}`, {
    accountIds: strList(Array.isArray(accounts) ? accounts : [accounts]),
    permissions: strList(permissions),
  })
}

/** Membre rattaché à une société, porteur d'un rôle. */
async function seedMember(uid: string, accountId: string, roleId: string): Promise<void> {
  await seedDoc(`users/${uid}`, { accountId: str(accountId), accessRoleId: str(roleId) })
}

/** Lecture d'un doc AVEC le jeton du user (règles appliquées). */
async function tryRead(user: TestUser, path: string): Promise<number> {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${user.idToken}` } })
  return res.status
}

/** PATCH d'un doc AVEC le jeton du user. */
async function tryPatch(user: TestUser, path: string, fields: Record<string, unknown>, mask?: string[]): Promise<number> {
  const qs = (mask ?? Object.keys(fields)).map((f) => `updateMask.fieldPaths=${f}`).join('&')
  const res = await fetch(`${FS}/${path}?${qs}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ fields }),
  })
  return res.status
}

/** Contexte : deux sociétés, un administrateur chez la première. */
async function twoCompanies(tag: string) {
  const t = `${tag}-${Date.now()}`
  const adminRole = `role-admin-${t}`
  const achatRole = `role-achat-${t}`
  const rivalRole = `role-rival-${t}`
  await seedRole(adminRole, 'auchan', ['team.view', 'team.assign', 'team.roles', 'pim.view'])
  await seedRole(achatRole, 'auchan', ['pim.view', 'dam.view'])
  await seedRole(rivalRole, 'leclerc', ['pim.view', 'workflows.view'])

  const admin = await createUser(`admin-${t}@example.com`)
  const francis = await createUser(`francis-${t}@example.com`)
  const rival = await createUser(`rival-${t}@example.com`)
  await seedMember(admin.uid, 'auchan', adminRole)
  await seedMember(francis.uid, 'auchan', achatRole)
  await seedMember(rival.uid, 'leclerc', rivalRole)
  return { admin, francis, rival, adminRole, achatRole, rivalRole, t }
}

test('un administrateur de société lit ses collègues, pas ceux d’une autre', async () => {
  const { admin, francis, rival } = await twoCompanies('read')
  expect(await tryRead(admin, `users/${francis.uid}`)).toBe(200)
  expect(await tryRead(admin, `users/${rival.uid}`)).toBe(403)
})

test('il attribue un rôle de SA société à un collègue', async () => {
  const { admin, francis, achatRole } = await twoCompanies('assign')
  expect(await tryPatch(admin, `users/${francis.uid}`, { accessRoleId: str(achatRole) })).toBe(200)
})

test('il ne peut PAS attribuer le rôle d’une autre société', async () => {
  const { admin, francis, rivalRole } = await twoCompanies('cross-role')
  expect(await tryPatch(admin, `users/${francis.uid}`, { accessRoleId: str(rivalRole) })).toBe(403)
})

test('il ne peut PAS toucher au membre d’une autre société', async () => {
  const { admin, rival, achatRole } = await twoCompanies('cross-user')
  expect(await tryPatch(admin, `users/${rival.uid}`, { accessRoleId: str(achatRole) })).toBe(403)
})

test('il ne peut PAS rattacher quelqu’un à sa société (aspiration de compte)', async () => {
  const { admin, rival } = await twoCompanies('steal')
  expect(await tryPatch(admin, `users/${rival.uid}`, { accountId: str('auchan') })).toBe(403)
})

test('il ne peut PAS déplacer un COLLÈGUE vers une autre société', async () => {
  // Le cas précédent échouerait de toute façon (cible hors société) : celui-ci
  // vise un membre légitime et ne teste donc QUE `teamManagedFields`, la clause
  // qui exclut `accountId` des champs délégués. Le rattachement reste global.
  const { admin, francis } = await twoCompanies('move-mate')
  expect(await tryPatch(admin, `users/${francis.uid}`, { accountId: str('leclerc') })).toBe(403)
  expect(await tryPatch(admin, `users/${francis.uid}`, { accountId: str('default') })).toBe(403)
})

test('il ne peut PAS se fabriquer un rôle administrateur global', async () => {
  const { admin, t } = await twoCompanies('escalate')
  // Rôle de sa propre société, mais portant `admin` → refusé (noAdminEscalation).
  const res = await fetch(`${FS}/roles?documentId=evil-${t}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ fields: { accountId: str('auchan'), permissions: strList(['admin']) } }),
  })
  expect(res.status).toBe(403)
})

test('il ne peut PAS s’accorder `admin` en droit ponctuel', async () => {
  const { admin, francis } = await twoCompanies('grant-admin')
  expect(await tryPatch(admin, `users/${francis.uid}`, { accessGrants: strList(['admin']) })).toBe(403)
})

test('il crée un rôle dans SA société mais pas dans une autre', async () => {
  const { admin, t } = await twoCompanies('create-role')
  const post = (accountId: string, id: string) => fetch(`${FS}/roles?documentId=${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ fields: { accountId: str(accountId), permissions: strList(['pim.view']) } }),
  })
  expect((await post('auchan', `mine-${t}`)).status).toBe(200)
  expect((await post('leclerc', `theirs-${t}`)).status).toBe(403)
})

test('il ne peut PAS déplacer un rôle vers une autre société', async () => {
  const { admin, achatRole } = await twoCompanies('move-role')
  expect(await tryPatch(admin, `roles/${achatRole}`, { accountIds: strList(['leclerc']) })).toBe(403)
})

test('il ne peut PAS AJOUTER une autre société à son propre rôle', async () => {
  // Multi-sociétés est réservé à l'admin global : sinon un administrateur rendrait
  // ses rôles attribuables chez un tiers.
  const { admin, achatRole } = await twoCompanies('add-company')
  expect(await tryPatch(admin, `roles/${achatRole}`, { accountIds: strList(['auchan', 'leclerc']) })).toBe(403)
})

test('un rôle PARTAGÉ entre deux sociétés est attribuable dans chacune', async () => {
  const t = `shared-${Date.now()}`
  const shared = `role-shared-${t}`
  await seedRole(shared, ['auchan', 'leclerc'], ['pim.view'])
  const adminRole = `role-admin-${t}`
  await seedRole(adminRole, 'auchan', ['team.view', 'team.assign', 'team.roles'])
  const admin = await createUser(`admin-${t}@example.com`)
  const mate = await createUser(`mate-${t}@example.com`)
  await seedMember(admin.uid, 'auchan', adminRole)
  await seedMember(mate.uid, 'auchan', `peu-importe-${t}`)
  expect(await tryPatch(admin, `users/${mate.uid}`, { accessRoleId: str(shared) })).toBe(200)
})

test('un rôle legacy (accountId seul) reste attribuable', async () => {
  // Les rôles créés avant le multi-sociétés n'ont que `accountId` : la règle doit
  // continuer à les accepter, sinon ils deviendraient inattribuables du jour au
  // lendemain.
  const t = `legacy-${Date.now()}`
  const legacy = `role-legacy-${t}`
  await seedDoc(`roles/${legacy}`, { accountId: str('auchan'), permissions: strList(['pim.view']) })
  const adminRole = `role-admin-${t}`
  await seedRole(adminRole, 'auchan', ['team.view', 'team.assign', 'team.roles'])
  const admin = await createUser(`admin-${t}@example.com`)
  const mate = await createUser(`mate-${t}@example.com`)
  await seedMember(admin.uid, 'auchan', adminRole)
  await seedMember(mate.uid, 'auchan', `peu-importe-${t}`)
  expect(await tryPatch(admin, `users/${mate.uid}`, { accessRoleId: str(legacy) })).toBe(200)
})

test('un membre SANS `team.view` ne lit pas ses collègues', async () => {
  const { francis, rival } = await twoCompanies('plain')
  const colleague = await createUser(`plain-mate-${Date.now()}@example.com`)
  await seedMember(colleague.uid, 'auchan', 'peu-importe')
  expect(await tryRead(francis, `users/${colleague.uid}`)).toBe(403)
  expect(await tryRead(francis, `users/${rival.uid}`)).toBe(403)
})
