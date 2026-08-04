// e2e/member-startup.spec.ts
// Reproduit le DÉMARRAGE d'un membre ordinaire (rôle « Veille tarifaire »,
// rattaché à une société) et vérifie chaque lecture que l'application enchaîne.
// Objectif : localiser un « Missing or insufficient permissions » sans deviner.
import { test, expect } from '@playwright/test'

const PROJECT = 'web2print-6fe5a'
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

interface TestUser { uid: string; idToken: string }

async function createUser(email: string): Promise<TestUser> {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake-emulator-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'e2e-password', returnSecureToken: true }),
  })
  const json = (await res.json()) as { localId?: string; idToken?: string }
  if (!json.localId || !json.idToken) throw new Error('signUp échoué')
  return { uid: json.localId, idToken: json.idToken }
}

async function seedDoc(path: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${FS}/${path}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`seed ${path} : ${res.status}`)
}

const str = (stringValue: string) => ({ stringValue })
const strList = (v: string[]) => ({ arrayValue: { values: v.map(str) } })

async function read(user: TestUser, path: string): Promise<number> {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${user.idToken}` } })
  return res.status
}

/** Liste une (sous-)collection — le mode d'accès des écrans, pas un getDoc. */
async function list(user: TestUser, path: string): Promise<number> {
  const res = await fetch(`${FS}/${path}?pageSize=10`, { headers: { Authorization: `Bearer ${user.idToken}` } })
  return res.status
}

async function pimalionLike(tag: string, opts: { workspace: boolean; account: boolean }) {
  const t = `${tag}-${Date.now()}`
  const carrier = await createUser(`porteur-${t}@example.com`)
  const member = await createUser(`membre-${t}@example.com`)
  const roleId = `role-veille-${t}`
  await seedDoc(`roles/${roleId}`, { accountIds: strList([`ibs-${t}`]), permissions: strList(['priceWatch.view']) })
  if (opts.account) {
    await seedDoc(`accounts/ibs-${t}`, {
      name: str('IBS Studio'),
      ...(opts.workspace ? { workspaceUid: str(carrier.uid) } : {}),
    })
  }
  await seedDoc(`users/${carrier.uid}`, { accountId: str(`ibs-${t}`), accessRoleId: str(roleId) })
  await seedDoc(`users/${member.uid}`, { accountId: str(`ibs-${t}`), accessRoleId: str(roleId) })
  await seedDoc(`users/${carrier.uid}/priceWatch/veille-1`, { label: str('Veille') })
  return { carrier, member, t }
}

test('démarrage d’un membre : chaque lecture de l’amorçage passe', async () => {
  const { member, carrier, t } = await pimalionLike('boot', { workspace: true, account: true })
  // 1. son propre profil (permissions, société)
  expect(await read(member, `users/${member.uid}`), 'profil').toBe(200)
  // 2. la société (workspaceUid + vocabulaire d'interface)
  expect(await read(member, `accounts/ibs-${t}`), 'société').toBe(200)
  expect(await list(member, `accounts/ibs-${t}/i18nOverrides`), 'vocabulaire').toBe(200)
  // 3. les données de l'espace commun de son module
  expect(await list(member, `users/${carrier.uid}/priceWatch`), 'veille tarifaire').toBe(200)
})

test('démarrage SANS document de société : l’amorçage ne doit pas casser', async () => {
  // Cas réel : un compte rattaché à une société jamais déclarée dans `accounts`.
  const { member, t } = await pimalionLike('no-account', { workspace: false, account: false })
  expect(await read(member, `users/${member.uid}`), 'profil').toBe(200)
  // Un getDoc sur un doc inexistant doit répondre « absent », pas « interdit ».
  expect([200, 404]).toContain(await read(member, `accounts/ibs-${t}`))
  // Et ses PROPRES données restent lisibles malgré l'absence de société.
  expect(await list(member, `users/${member.uid}/priceWatch`), 'ses données').toBe(200)
})

test('démarrage avec société SANS porteur : chacun sur ses données', async () => {
  const { member, t } = await pimalionLike('no-carrier', { workspace: false, account: true })
  expect(await read(member, `accounts/ibs-${t}`), 'société').toBe(200)
  expect(await list(member, `users/${member.uid}/priceWatch`), 'ses données').toBe(200)
})

test('un compte SANS rôle ne casse pas non plus (écran « en attente »)', async () => {
  const t = `pending-${Date.now()}`
  const member = await createUser(`attente-${t}@example.com`)
  await seedDoc(`users/${member.uid}`, { accountId: str(`ibs-${t}`) })
  await seedDoc(`accounts/ibs-${t}`, { name: str('IBS Studio') })
  expect(await read(member, `users/${member.uid}`), 'profil').toBe(200)
  // ⚠️ `accounts` exige `isActiveUser()` = rôle assigné : un compte en attente
  // n'y a PAS accès. L'amorçage doit donc tolérer ce refus sans exploser.
  expect(await read(member, `accounts/ibs-${t}`), 'société').toBe(403)
})

test('un accountId VIDE ne doit pas tout verrouiller', async () => {
  // ⚠️ Le piège : `accessData().get('accountId', 'default')` ne rend « default »
  // que si le champ est ABSENT. Présent et vide (''), il donne '' — et le chemin
  // `accounts/` est INVALIDE : l'évaluation de la règle lève, donc TOUT est
  // refusé, jusqu'aux données personnelles du compte.
  const t = `empty-account-${Date.now()}`
  const member = await createUser(`vide-${t}@example.com`)
  const roleId = `role-${t}`
  await seedDoc(`roles/${roleId}`, { accountIds: strList(['default']), permissions: strList(['priceWatch.view']) })
  await seedDoc(`users/${member.uid}`, { accountId: str(''), accessRoleId: str(roleId) })
  await seedDoc(`users/${member.uid}/priceWatch/veille-1`, { label: str('Veille') })

  expect(await read(member, `users/${member.uid}`), 'profil').toBe(200)
  expect(await list(member, `users/${member.uid}/priceWatch`), 'ses propres données').toBe(200)
})

/** Requête filtrée (le mode d'accès réel des écrans : `where(...)`). */
async function runQuery(user: TestUser, collectionId: string, field: string, value: string): Promise<number> {
  const res = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
        limit: 10,
      },
    }),
  })
  return res.status
}

test('les REQUÊTES du tableau de bord passent dans l’espace commun', async () => {
  const { member, carrier, t } = await pimalionLike('queries', { workspace: true, account: true })
  await seedDoc(`projects/p-${t}`, { ownerId: str(carrier.uid), title: str('X'), createdAt: { integerValue: '1' } })
  await seedDoc(`taxonomies/tx-${t}`, { ownerId: str(carrier.uid), name: str('T') })
  await seedDoc(`excel_data/ex-${t}`, { userId: str(carrier.uid), name: str('D') })
  await seedDoc(`dam_collections/dc-${t}`, { ownerId: str(carrier.uid), name: str('C') })

  // Le tableau de bord interroge ces collections dès le montage, quel que soit le
  // module ouvert : un refus ici casse l'écran entier, pas seulement un panneau.
  expect(await runQuery(member, 'projects', 'ownerId', carrier.uid), 'projets').toBe(200)
  expect(await runQuery(member, 'taxonomies', 'ownerId', carrier.uid), 'taxonomies').toBe(200)
  expect(await runQuery(member, 'excel_data', 'userId', carrier.uid), 'datasets').toBe(200)
  expect(await runQuery(member, 'dam_collections', 'ownerId', carrier.uid), 'collections DAM').toBe(200)
})

/** Liste une sous-collection SANS filtre — ce que fait `listWorkflows`. */
async function listWorkflowsAs(user: TestUser, ownerUid: string): Promise<number> {
  const res = await fetch(`${FS}/users/${ownerUid}/workflows?pageSize=50`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  })
  return res.status
}

test('liste blanche : la requête de LISTE est refusée, la lecture ciblée passe', async () => {
  // ⚠️ LE piège du chantier. Firestore refuse une requête ENTIÈRE dès qu'un
  // document candidat ne satisfait pas la règle : avec une liste blanche
  // partielle, `listWorkflows` tombait en « Missing or insufficient
  // permissions » — l'écran entier cassait au lieu de masquer deux lignes.
  // D'où la lecture document par document côté client quand une liste existe.
  const { member, carrier, t } = await pimalionLike('wf-list', { workspace: true, account: true })
  await seedDoc(`users/${carrier.uid}/workflows/wf-a-${t}`, { name: str('Démo Screwfix') })
  await seedDoc(`users/${carrier.uid}/workflows/wf-b-${t}`, { name: str('Démo Trafic') })
  await seedDoc(`users/${member.uid}`, {
    accountId: str(`ibs-${t}`), accessRoleId: str(`role-veille-${t}`),
    allowedWorkflows: strList([`wf-a-${t}`]),
  })

  expect(await listWorkflowsAs(member, carrier.uid), 'liste non filtrée').toBe(403)
  expect(await read(member, `users/${carrier.uid}/workflows/wf-a-${t}`), 'autorisé').toBe(200)
  expect(await read(member, `users/${carrier.uid}/workflows/wf-b-${t}`), 'non autorisé').toBe(403)
})

test('sans liste blanche, la requête de liste passe normalement', async () => {
  const { member, carrier, t } = await pimalionLike('wf-list-all', { workspace: true, account: true })
  await seedDoc(`users/${carrier.uid}/workflows/wf-a-${t}`, { name: str('Démo Screwfix') })
  expect(await listWorkflowsAs(member, carrier.uid)).toBe(200)
})
