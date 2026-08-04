// e2e/workspace.spec.ts
// ESPACE DE TRAVAIL PARTAGÉ (option A) : une société désigne un compte porteur,
// et ses membres travaillent sur SES données selon leurs permissions. On teste
// `firestore.rules` contre l'émulateur — l'écran ne protège rien.
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
const num = (n: number) => ({ integerValue: String(n) })

async function tryRead(user: TestUser, path: string): Promise<number> {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${user.idToken}` } })
  return res.status
}

async function tryWrite(user: TestUser, path: string, fields: Record<string, unknown>): Promise<number> {
  const qs = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&')
  const res = await fetch(`${FS}/${path}?${qs}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ fields }),
  })
  return res.status
}

/**
 * Société « auchan » dont le porteur détient les données, un membre lecteur de
 * PIM et de workflows, et un tiers d'une autre société sans rien à y voir.
 */
async function sharedWorkspace(tag: string) {
  const t = `${tag}-${Date.now()}`
  const carrier = await createUser(`porteur-${t}@example.com`)
  const member = await createUser(`membre-${t}@example.com`)
  const outsider = await createUser(`tiers-${t}@example.com`)

  const memberRole = `role-membre-${t}`
  const outsiderRole = `role-tiers-${t}`
  await seedDoc(`roles/${memberRole}`, {
    accountIds: strList([`auchan-${t}`]),
    permissions: strList(['pim.view', 'workflows.view', 'workflows.create', 'workflows.edit', 'library.view']),
  })
  await seedDoc(`roles/${outsiderRole}`, {
    accountIds: strList([`leclerc-${t}`]),
    permissions: strList(['pim.view', 'workflows.view', 'library.view']),
  })

  // Le porteur des données ET la société qui le désigne.
  await seedDoc(`accounts/auchan-${t}`, { name: str('Auchan'), workspaceUid: str(carrier.uid) })
  await seedDoc(`accounts/leclerc-${t}`, { name: str('Leclerc'), workspaceUid: str(outsider.uid) })
  await seedDoc(`users/${carrier.uid}`, { accountId: str(`auchan-${t}`), accessRoleId: str(memberRole) })
  await seedDoc(`users/${member.uid}`, { accountId: str(`auchan-${t}`), accessRoleId: str(memberRole) })
  await seedDoc(`users/${outsider.uid}`, { accountId: str(`leclerc-${t}`), accessRoleId: str(outsiderRole) })

  // Données appartenant au porteur : un projet, un workflow, un prompt personnel.
  const projectId = `proj-${t}`
  await seedDoc(`projects/${projectId}`, { ownerId: str(carrier.uid), title: str('Catalogue 2026'), createdAt: num(1) })
  const workflowId = `wf-${t}`
  await seedDoc(`users/${carrier.uid}/workflows/${workflowId}`, { name: str('Démo Screwfix') })
  await seedDoc(`users/${carrier.uid}/prompts/p-${t}`, { text: str('mon prompt perso') })

  return { carrier, member, outsider, projectId, workflowId, t }
}

test('un membre lit les projets de l’espace de sa société', async () => {
  const { member, projectId } = await sharedWorkspace('read-project')
  expect(await tryRead(member, `projects/${projectId}`)).toBe(200)
})

test('un membre lit les WORKFLOWS de l’espace, stockés sous l’uid du porteur', async () => {
  const { member, carrier, workflowId } = await sharedWorkspace('read-wf')
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${workflowId}`)).toBe(200)
})

test('il y écrit s’il en a la permission — et le refus suit la permission EXACTE', async () => {
  const { member, carrier, workflowId } = await sharedWorkspace('write-wf')
  expect(await tryWrite(member, `users/${carrier.uid}/workflows/${workflowId}`, { name: str('renommé') })).toBe(200)
})

test('une société SANS porteur laisse chacun sur ses données', async () => {
  const t = `solo-${Date.now()}`
  const roleId = `role-${t}`
  await seedDoc(`roles/${roleId}`, { accountIds: strList([`acme-${t}`]), permissions: strList(['library.view']) })
  await seedDoc(`accounts/acme-${t}`, { name: str('Acme') })   // ⚠ pas de workspaceUid
  const a = await createUser(`a-${t}@example.com`)
  const b = await createUser(`b-${t}@example.com`)
  await seedDoc(`users/${a.uid}`, { accountId: str(`acme-${t}`), accessRoleId: str(roleId) })
  await seedDoc(`users/${b.uid}`, { accountId: str(`acme-${t}`), accessRoleId: str(roleId) })
  await seedDoc(`projects/p-${t}`, { ownerId: str(b.uid), title: str('privé'), createdAt: num(1) })
  // Même société, aucun porteur désigné → rien n'est partagé.
  expect(await tryRead(a, `projects/p-${t}`)).toBe(403)
})

test('un membre d’une AUTRE société ne voit rien de l’espace', async () => {
  const { outsider, carrier, projectId, workflowId } = await sharedWorkspace('outsider')
  expect(await tryRead(outsider, `projects/${projectId}`)).toBe(403)
  expect(await tryRead(outsider, `users/${carrier.uid}/workflows/${workflowId}`)).toBe(403)
})

test('l’espace partagé n’ouvre PAS les données personnelles du porteur', async () => {
  const { member, carrier, t } = await sharedWorkspace('private')
  // Le doc user porte les secrets (clés d'API, cookies) : jamais partagé.
  expect(await tryRead(member, `users/${carrier.uid}`)).toBe(403)
  // Les bibliothèques de prompts restent personnelles, par choix explicite.
  expect(await tryRead(member, `users/${carrier.uid}/prompts/p-${t}`)).toBe(403)
})

test('sans la permission, un membre de l’espace ne peut pas écrire', async () => {
  const { member, carrier, t } = await sharedWorkspace('no-perm')
  // Rôle réduit à la lecture : `workflows.edit` absent.
  const roleId = `role-lecture-${t}`
  await seedDoc(`roles/${roleId}`, { accountIds: strList([`auchan-${t}`]), permissions: strList(['workflows.view']) })
  await seedDoc(`users/${member.uid}`, { accountId: str(`auchan-${t}`), accessRoleId: str(roleId) })
  const wfPath = `users/${carrier.uid}/workflows/wf-${t}`
  expect(await tryRead(member, wfPath)).toBe(200)
  expect(await tryWrite(member, wfPath, { name: str('interdit') })).toBe(403)
})

test('la liste blanche limite l’accès à CERTAINS workflows', async () => {
  const { member, carrier, workflowId, t } = await sharedWorkspace('wf-scope')
  const autre = `wf-autre-${t}`
  await seedDoc(`users/${carrier.uid}/workflows/${autre}`, { name: str('Démo Trafic') })

  // Sans restriction : les deux sont lisibles.
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${workflowId}`)).toBe(200)
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${autre}`)).toBe(200)

  // Restreint au premier : le second devient inaccessible.
  // ⚠️ `seedDoc` REMPLACE le document : sans re-poser société et rôle, le membre
  // perdrait ses permissions et le 403 ne prouverait plus rien.
  await seedDoc(`users/${member.uid}`, {
    accountId: str(`auchan-${t}`), accessRoleId: str(`role-membre-${t}`),
    allowedWorkflows: strList([workflowId]),
  })
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${workflowId}`)).toBe(200)
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${autre}`)).toBe(403)
  // …et il ne peut pas non plus l'écrire.
  expect(await tryWrite(member, `users/${carrier.uid}/workflows/${autre}`, { name: str('non') })).toBe(403)
})

test('une liste blanche VIDE n’enferme personne', async () => {
  // Le piège du chantier : tous les comptes existants sont dépourvus du champ.
  // Si « vide » avait voulu dire « aucun », le déploiement aurait coupé l'accès
  // aux workflows à tout le monde d'un coup.
  const { member, carrier, workflowId, t } = await sharedWorkspace('wf-empty')
  await seedDoc(`users/${member.uid}`, {
    accountId: str(`auchan-${t}`), accessRoleId: str(`role-membre-${t}`),
    allowedWorkflows: strList([]),
  })
  expect(await tryRead(member, `users/${carrier.uid}/workflows/${workflowId}`)).toBe(200)
})

test('un membre ne peut PAS s’ouvrir des workflows lui-même', async () => {
  const { member } = await sharedWorkspace('wf-self')
  expect(await tryWrite(member, `users/${member.uid}`, { allowedWorkflows: strList(['n-importe-quoi']) })).toBe(403)
})

test('le planning d’un workflow est LISIBLE par les membres de l’espace', async () => {
  // ⚠️ Même piège que le webhook : le champ s'appelle `uid` et non `ownerId`, il
  // avait donc échappé à la bascule vers l'espace de travail. Résultat : le
  // panneau de statut cron disparaissait pour tout membre non porteur, SANS
  // erreur visible — l'onSnapshot se contente d'un avertissement en console.
  const { member, carrier, workflowId, t } = await sharedWorkspace('cron')
  await seedDoc(`workflowSchedules/${workflowId}`, {
    uid: str(carrier.uid), enabled: { booleanValue: true },
  })
  expect(await tryRead(member, `workflowSchedules/${workflowId}`), 'lecture du planning').toBe(200)

  // Planifier reste une modification du workflow : refusée sans `workflows.edit`.
  const roleId = `role-run-only-${t}`
  await seedDoc(`roles/${roleId}`, {
    accountIds: strList([`auchan-${t}`]),
    permissions: strList(['workflows.view', 'workflows.run']),
  })
  await seedDoc(`users/${member.uid}`, { accountId: str(`auchan-${t}`), accessRoleId: str(roleId) })
  expect(await tryRead(member, `workflowSchedules/${workflowId}`), 'toujours lisible').toBe(200)
  expect(await tryWrite(member, `workflowSchedules/${workflowId}`, { enabled: { booleanValue: false } }),
    'modification refusée sans workflows.edit').toBe(403)
})
