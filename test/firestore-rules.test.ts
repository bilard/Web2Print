// test/firestore-rules.test.ts
// Test comportemental des règles Firestore du rôle « démo » (quotas). Tourne sur
// l'émulateur Firestore : `npm run test:rules` (nécessite Java 17+ sur le PATH).
// Hors du glob vitest par défaut (src/**) → n'alourdit pas `npm run test:run`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const PROJECT = 'web2print-rules-test'
const RULES = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../firestore.rules'), 'utf8')

const DEMO_UID = 'demoUser'
const NORMAL_UID = 'normalUser'
const DEMO_EMAIL = 'prospect@example.com'
const NORMAL_EMAIL = 'client@example.com'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: RULES } })
})
afterAll(async () => { await env.cleanup() })

// Réinitialise les données seed avant chaque test (rules désactivées pour le seed).
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'roles', 'roleDemo'), { permissions: ['demo.view', 'pim.edit', 'pim.import', 'dam.upload'] })
    await setDoc(doc(db, 'roles', 'roleNormal'), { permissions: ['pim.edit', 'pim.import', 'dam.upload'] })
    await setDoc(doc(db, 'users', DEMO_UID), { email: DEMO_EMAIL, accessRoleId: 'roleDemo', usage: { pimRows: 0, damAssets: 0 } })
    await setDoc(doc(db, 'users', NORMAL_UID), { email: NORMAL_EMAIL, accessRoleId: 'roleNormal' })
    // Projet PIM possédé par chaque user (parent des products).
    await setDoc(doc(db, 'pim_projects', 'projDemo'), { userId: DEMO_UID })
    await setDoc(doc(db, 'pim_projects', 'projNormal'), { userId: NORMAL_UID })
  })
})

const demoDb = () => env.authenticatedContext(DEMO_UID, { email: DEMO_EMAIL }).firestore()
const normalDb = () => env.authenticatedContext(NORMAL_UID, { email: NORMAL_EMAIL }).firestore()

const product = { _id: 'p1', masterSku: null, fields: {}, createdAt: 0, updatedAt: 0 }

describe('PIM — écriture directe des produits', () => {
  it('REFUSE un démo (doit passer par la CF pimSaveProducts)', async () => {
    await assertFails(setDoc(doc(demoDb(), 'pim_projects', 'projDemo', 'products', 'p1'), product))
  })
  it('AUTORISE un compte normal (non-régression)', async () => {
    await assertSucceeds(setDoc(doc(normalDb(), 'pim_projects', 'projNormal', 'products', 'p1'), product))
  })
})

describe('DAM — dam_assets.create plafonné', () => {
  it('AUTORISE un démo sous le quota', async () => {
    await assertSucceeds(setDoc(doc(demoDb(), 'dam_assets', 'a1'), { addedBy: DEMO_UID, url: 'x' }))
  })
  it('REFUSE un démo au quota (damAssets == 20)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', DEMO_UID), { usage: { pimRows: 0, damAssets: 20 } }, { merge: true })
    })
    await assertFails(setDoc(doc(demoDb(), 'dam_assets', 'a2'), { addedBy: DEMO_UID, url: 'x' }))
  })
  it('AUTORISE un compte normal sans limite', async () => {
    await assertSucceeds(setDoc(doc(normalDb(), 'dam_assets', 'a3'), { addedBy: NORMAL_UID, url: 'x' }))
  })
})

describe('usage — monotonie (anti-reset)', () => {
  it('AUTORISE l’incrément de usage par le user (nœud save-dam)', async () => {
    await assertSucceeds(setDoc(doc(demoDb(), 'users', DEMO_UID), { usage: { pimRows: 0, damAssets: 1 } }, { merge: true }))
  })
  it('REFUSE la décroissance de usage (reset du quota)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', DEMO_UID), { usage: { pimRows: 0, damAssets: 10 } }, { merge: true })
    })
    await assertFails(setDoc(doc(demoDb(), 'users', DEMO_UID), { usage: { pimRows: 0, damAssets: 0 } }, { merge: true }))
  })
})

describe('quotas configurables (roles/{id}.limits)', () => {
  it('honore une limite DAM personnalisée (damAssets: 2)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'roles', 'roleDemo'), { limits: { pimRows: 50, damAssets: 2 } }, { merge: true })
      await setDoc(doc(db, 'users', DEMO_UID), { usage: { pimRows: 0, damAssets: 2 } }, { merge: true })
    })
    await assertFails(setDoc(doc(demoDb(), 'dam_assets', 'ax'), { addedBy: DEMO_UID, url: 'x' }))
  })
  it('honore une limite PIM personnalisée pour excel_data (pimRows: 10)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roles', 'roleDemo'), { limits: { pimRows: 10, damAssets: 20 } }, { merge: true })
    })
    await assertFails(setDoc(doc(demoDb(), 'excel_data', 'ec'), { userId: DEMO_UID, totalRows: 11 }))
    await assertSucceeds(setDoc(doc(demoDb(), 'excel_data', 'ec2'), { userId: DEMO_UID, totalRows: 10 }))
  })
})

describe('excel_data — plafond de taille démo', () => {
  it('REFUSE un dataset démo > 50 lignes', async () => {
    await assertFails(setDoc(doc(demoDb(), 'excel_data', 'e1'), { userId: DEMO_UID, totalRows: 51 }))
  })
  it('AUTORISE un dataset démo <= 50 lignes', async () => {
    await assertSucceeds(setDoc(doc(demoDb(), 'excel_data', 'e2'), { userId: DEMO_UID, totalRows: 50 }))
  })
  it('AUTORISE un compte normal sans limite de taille', async () => {
    await assertSucceeds(setDoc(doc(normalDb(), 'excel_data', 'e3'), { userId: NORMAL_UID, totalRows: 9999 }))
  })
})
