# RBAC — Rôles & Permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'app Web2Print un contrôle d'accès par rôles & permissions granulaires, géré depuis un écran d'admin, avec onboarding « open + pending ».

**Architecture:** Registre central de permissions (clés arbitraires) → rôles Firestore (`roles/{id}`) + champs d'accès sur `users/{uid}` (rôle + surcharges) → calcul pur des permissions effectives → store Zustand hydraté au login → hooks `useCan/useIsPending/useIsAdmin` qui gatent l'UI. Le propriétaire (`ibs.studio@gmail.com`) est admin en dur. Application UI-first (phases 1→3) ; règles serveur par collection en phase 4 (hors plan).

**Tech Stack:** React 18 + TS strict, Zustand v4, Firebase 12 (Firestore), React Query v5, Vitest, Tailwind, Lucide.

**Spec:** `docs/superpowers/specs/2026-06-03-rbac-roles-permissions-design.md`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/features/access/permissions.ts` | Registre des clés de permission + types + helpers (groupement par module) |
| `src/features/access/computePermissions.ts` | Fonction PURE `computeEffectivePermissions` (rôle ∪ grants − revokes ; owner = tout) |
| `src/features/access/computePermissions.test.ts` | Tests unitaires du calcul + helpers registre |
| `src/stores/access.store.ts` | État runtime : `Set` des permissions, roleId, loading |
| `src/features/access/useAccess.ts` | `useAccessInit()` (hydrate au login) + `useCan/useIsPending/useIsAdmin` |
| `src/features/access/PendingAccessScreen.tsx` | Écran plein « accès en attente » |
| `src/features/access/rolesApi.ts` | CRUD Firestore `roles/{id}` |
| `src/features/access/usersApi.ts` | Lister les users (admin) + écrire les champs `access*` |
| `src/features/access/admin/AccessAdminPage.tsx` | Page admin (onglets Utilisateurs / Rôles) |
| `src/features/access/admin/RolesTab.tsx` | Liste rôles + `RoleEditor` (matrice de permissions) |
| `src/features/access/admin/UsersTab.tsx` | Liste users + assignation rôle + surcharges |
| `firestore.rules` | Règles `roles/*` + `users/*` admin-read/write |
| `src/features/auth/AuthProvider.tsx` | Monter `useAccessInit()` + écrire le profil au login |
| `src/pages/DashboardPage.tsx` | Section `access` (admin) + filtrage `menuItems` par `<module>.view` |
| `src/components/shared/SettingsPanel.tsx` | Filtrage des onglets par clés de permission |

---

## PHASE 1 — Cœur d'accès

### Task 1: Registre de permissions

**Files:**
- Create: `src/features/access/permissions.ts`

- [ ] **Step 1: Créer le registre**

```ts
// src/features/access/permissions.ts
/** Catalogue central de toutes les permissions de l'app. Source de vérité : l'écran admin
 *  génère sa matrice à partir d'ici et `useCan` valide contre ces clés.
 *  Convention : `<module>.view` gate la visibilité du module ; les clés plus fines gatent
 *  onglets/boutons/champs (ajoutées au fil de l'eau). */
export interface PermissionDef {
  key: string
  module: string
  label: string
  description?: string
}

/** Permission spéciale : accès total + gestion des rôles/utilisateurs. */
export const ADMIN_PERMISSION = 'admin'

export const PERMISSIONS: PermissionDef[] = [
  { key: 'library.view', module: 'Bibliothèque', label: 'Voir la bibliothèque' },
  { key: 'import.view', module: 'Import', label: 'Importer des fichiers' },
  { key: 'dam.view', module: 'DAM', label: 'Voir le DAM' },
  { key: 'dam.upload', module: 'DAM', label: 'Uploader des assets' },
  { key: 'dam.delete', module: 'DAM', label: 'Supprimer des assets' },
  { key: 'pim.view', module: 'PIM', label: 'Voir le PIM' },
  { key: 'pim.edit', module: 'PIM', label: 'Éditer les produits' },
  { key: 'pim.delete', module: 'PIM', label: 'Supprimer des produits' },
  { key: 'pim.export', module: 'PIM', label: 'Exporter les produits' },
  { key: 'taxonomies.view', module: 'Taxonomies', label: 'Voir les taxonomies' },
  { key: 'scrapingTemplates.view', module: 'Scraping', label: 'Voir les templates de scraping' },
  { key: 'scrapingHub.view', module: 'Scraping', label: 'Voir le Scraping Hub' },
  { key: 'workflows.view', module: 'Workflows', label: 'Voir les workflows' },
  { key: 'workflows.run', module: 'Workflows', label: 'Exécuter les workflows' },
  { key: 'hyperframes.view', module: 'Animation', label: 'Voir le module Animation' },
  { key: 'chat.view', module: 'Chat IA', label: 'Voir le Chat IA' },
  { key: 'telegram.view', module: 'Telegram', label: 'Voir Telegram' },
  { key: 'settings.view', module: 'Paramètres', label: 'Ouvrir les Paramètres' },
  { key: 'settings.firebase.view', module: 'Paramètres', label: 'Voir l\'onglet Firebase' },
  { key: 'settings.connectors.edit', module: 'Paramètres', label: 'Éditer les connecteurs' },
  { key: 'settings.cookies.edit', module: 'Paramètres', label: 'Éditer les cookies' },
]

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key)

/** Regroupe les permissions par module pour la matrice de l'écran admin. */
export function permissionsByModule(): Record<string, PermissionDef[]> {
  const out: Record<string, PermissionDef[]> = {}
  for (const p of PERMISSIONS) {
    ;(out[p.module] ??= []).push(p)
  }
  return out
}

/** Libellé lisible d'une clé (fallback = la clé brute si inconnue). */
export function permissionLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc -b`
Expected: aucune sortie (succès).

- [ ] **Step 3: Commit**

```bash
git add src/features/access/permissions.ts
git commit -m "feat(access): registre central des permissions"
```

---

### Task 2: Calcul des permissions effectives (pur + testé)

**Files:**
- Create: `src/features/access/computePermissions.ts`
- Test: `src/features/access/computePermissions.test.ts`

- [ ] **Step 1: Écrire le test (échoue)**

```ts
// src/features/access/computePermissions.test.ts
import { describe, it, expect } from 'vitest'
import { computeEffectivePermissions, isPending } from './computePermissions'
import { ADMIN_PERMISSION, ALL_PERMISSION_KEYS } from './permissions'

describe('computeEffectivePermissions', () => {
  it('owner → toutes les permissions + admin', () => {
    const set = computeEffectivePermissions({ isOwner: true, rolePermissions: null, grants: [], revokes: [] })
    expect(set.has(ADMIN_PERMISSION)).toBe(true)
    for (const k of ALL_PERMISSION_KEYS) expect(set.has(k)).toBe(true)
  })

  it('rôle ∪ grants − revokes', () => {
    const set = computeEffectivePermissions({
      isOwner: false,
      rolePermissions: ['pim.view', 'pim.edit'],
      grants: ['dam.view'],
      revokes: ['pim.edit'],
    })
    expect([...set].sort()).toEqual(['dam.view', 'pim.view'])
  })

  it('rôle null + non-owner → vide', () => {
    const set = computeEffectivePermissions({ isOwner: false, rolePermissions: null, grants: [], revokes: [] })
    expect(set.size).toBe(0)
  })
})

describe('isPending', () => {
  it('non-owner sans rôle → pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: null })).toBe(true)
  })
  it('non-owner avec rôle → non pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: 'r1' })).toBe(false)
  })
  it('owner → jamais pending', () => {
    expect(isPending({ isOwner: true, accessRoleId: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test (échoue : module absent)**

Run: `npx vitest run src/features/access/computePermissions.test.ts`
Expected: FAIL (`Cannot find module './computePermissions'`).

- [ ] **Step 3: Implémenter**

```ts
// src/features/access/computePermissions.ts
import { ADMIN_PERMISSION, ALL_PERMISSION_KEYS } from './permissions'

export interface EffectiveInput {
  isOwner: boolean
  rolePermissions: string[] | null
  grants: string[]
  revokes: string[]
}

/** Permissions effectives = (rôle ∪ grants) − revokes. Owner = court-circuit (tout). */
export function computeEffectivePermissions(input: EffectiveInput): Set<string> {
  if (input.isOwner) return new Set([ADMIN_PERMISSION, ...ALL_PERMISSION_KEYS])
  const set = new Set(input.rolePermissions ?? [])
  for (const g of input.grants) set.add(g)
  for (const r of input.revokes) set.delete(r)
  return set
}

/** Connecté mais sans accès : non-owner et aucun rôle assigné. */
export function isPending(input: { isOwner: boolean; accessRoleId: string | null }): boolean {
  return !input.isOwner && !input.accessRoleId
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npx vitest run src/features/access/computePermissions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/access/computePermissions.ts src/features/access/computePermissions.test.ts
git commit -m "feat(access): calcul pur des permissions effectives + tests"
```

---

### Task 3: Store d'accès + hooks

**Files:**
- Create: `src/stores/access.store.ts`
- Create: `src/features/access/useAccess.ts`

- [ ] **Step 1: Créer le store**

```ts
// src/stores/access.store.ts
import { create } from 'zustand'

interface AccessState {
  /** Permissions effectives du user courant. */
  permissions: Set<string>
  /** Rôle assigné (null = en attente, sauf owner). */
  roleId: string | null
  isOwner: boolean
  /** true tant que l'accès n'a pas été hydraté depuis Firestore. */
  loading: boolean
  setAccess: (a: { permissions: Set<string>; roleId: string | null; isOwner: boolean }) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAccessStore = create<AccessState>((set) => ({
  permissions: new Set(),
  roleId: null,
  isOwner: false,
  loading: true,
  setAccess: (a) => set({ ...a, loading: false }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ permissions: new Set(), roleId: null, isOwner: false, loading: true }),
}))
```

- [ ] **Step 2: Créer les hooks**

```ts
// src/features/access/useAccess.ts
import { useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { isOwnerEmail } from '@/features/auth/useAuth'
import { computeEffectivePermissions } from './computePermissions'

/** Hydrate les permissions effectives au login (lit users/{uid} + le doc rôle). */
export function useAccessInit() {
  const user = useAuthStore((s) => s.user)
  const setAccess = useAccessStore((s) => s.setAccess)
  const reset = useAccessStore((s) => s.reset)

  useEffect(() => {
    if (!user) { reset(); return }
    let cancelled = false
    const isOwner = isOwnerEmail(user.email)

    ;(async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const data = userSnap.data() ?? {}
        const roleId = (data.accessRoleId as string | undefined) ?? null
        const grants = (data.accessGrants as string[] | undefined) ?? []
        const revokes = (data.accessRevokes as string[] | undefined) ?? []
        let rolePermissions: string[] | null = null
        if (roleId) {
          const roleSnap = await getDoc(doc(db, 'roles', roleId))
          rolePermissions = (roleSnap.data()?.permissions as string[] | undefined) ?? []
        }
        if (cancelled) return
        setAccess({
          permissions: computeEffectivePermissions({ isOwner, rolePermissions, grants, revokes }),
          roleId,
          isOwner,
        })
      } catch (e) {
        if (cancelled) return
        console.warn('[useAccessInit] load failed:', e)
        setAccess({ permissions: computeEffectivePermissions({ isOwner, rolePermissions: null, grants: [], revokes: [] }), roleId: null, isOwner })
      }
    })()

    return () => { cancelled = true }
  }, [user, setAccess, reset])
}

/** L'utilisateur a-t-il cette permission ? (owner → toujours true) */
export function useCan(key: string): boolean {
  return useAccessStore((s) => s.isOwner || s.permissions.has(key))
}

/** Connecté mais sans rôle (et non-owner). */
export function useIsPending(): boolean {
  return useAccessStore((s) => !s.loading && !s.isOwner && !s.roleId)
}

/** Possède la permission admin (= owner en V1). */
export function useIsAdmin(): boolean {
  return useAccessStore((s) => s.isOwner || s.permissions.has('admin'))
}

/** true tant que l'accès n'est pas hydraté. */
export function useAccessLoading(): boolean {
  return useAccessStore((s) => s.loading)
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc -b`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/stores/access.store.ts src/features/access/useAccess.ts
git commit -m "feat(access): store + hooks useCan/useIsPending/useIsAdmin"
```

---

### Task 4: Écrire le profil au login + monter l'init + règles Firestore

**Files:**
- Modify: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/access/writeUserProfile.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Helper d'écriture du profil**

```ts
// src/features/access/writeUserProfile.ts
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { User } from 'firebase/auth'

/** Écrit/rafraîchit l'identité du user dans users/{uid} (pour l'écran admin). N'écrase PAS
 *  les secrets (apiKeys/telegram/siteCookies) ni les champs access* gérés par l'admin. */
export async function writeUserProfile(user: User): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? '',
        lastSeenAt: Date.now(),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[writeUserProfile] failed:', e)
  }
}
```

- [ ] **Step 2: Monter l'init + écriture profil dans AuthProvider**

Modifier `src/features/auth/AuthProvider.tsx` — ajouter les imports et appels :

```tsx
import { useEffect } from 'react'
import { useAuthInit } from './useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsSync } from '@/features/settings/useAiSettingsSync'
import { useApiKeysSync } from '@/features/settings/useApiKeysSync'
import { useTelegramSettingsSync } from '@/features/settings/useTelegramSettingsSync'
import { useSiteCookiesSync } from '@/features/settings/useSiteCookiesSync'
import { useAccessInit } from '@/features/access/useAccess'
import { writeUserProfile } from '@/features/access/writeUserProfile'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthInit()
  useAiSettingsSync()
  useApiKeysSync()
  useTelegramSettingsSync()
  useSiteCookiesSync()
  useAccessInit()
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  // Rafraîchit l'identité du user (pour l'écran admin) à chaque (re)connexion.
  useEffect(() => {
    if (user) void writeUserProfile(user)
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 3: Étendre les règles Firestore**

Dans `firestore.rules`, ajouter le helper admin (sous `isAuthenticated()`), et les blocs `roles` + l'extension `users`. Remplacer le bloc `match /users/{uid}` existant :

```
    function isAdmin() {
      return request.auth != null && request.auth.token.email == 'ibs.studio@gmail.com';
    }

    // ── Roles (RBAC) ──────────────────────────────────────────────────────────
    match /roles/{roleId} {
      allow read:  if isAuthenticated();   // listes de permissions, non secrètes
      allow write: if isAdmin();
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    match /users/{uid} {
      // Le user lit/écrit son propre doc ; l'admin lit tous les docs et écrit les champs access*.
      allow read:  if isAuthenticated() && (request.auth.uid == uid || isAdmin());
      allow write: if isAuthenticated() && (request.auth.uid == uid || isAdmin());
    }
```

(⚠️ supprimer l'ancien bloc `match /users/{uid}` pour éviter le doublon.)

- [ ] **Step 4: Vérifier compilation + déployer les règles**

Run: `npx tsc -b`
Expected: succès.

Run: `firebase deploy --only firestore:rules`
Expected: `released rules ... successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AuthProvider.tsx src/features/access/writeUserProfile.ts firestore.rules
git commit -m "feat(access): profil user au login + init permissions + règles roles/users admin"
```

---

### Task 5: Écran « accès en attente » + garde

**Files:**
- Create: `src/features/access/PendingAccessScreen.tsx`
- Modify: `src/pages/DashboardPage.tsx` (garde en tête de rendu)

- [ ] **Step 1: Créer l'écran**

```tsx
// src/features/access/PendingAccessScreen.tsx
import { ShieldAlert } from 'lucide-react'
import { useSignOut } from '@/features/auth/useAuth'
import { useAuthStore } from '@/stores/auth.store'

export function PendingAccessScreen() {
  const signOut = useSignOut()
  const email = useAuthStore((s) => s.user?.email)
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-6">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-10 max-w-md text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Accès en attente de validation</h1>
        <p className="text-sm text-white/50">
          Ton compte <span className="text-white/80">{email}</span> est connecté mais n'a pas
          encore de rôle attribué. Un administrateur doit te donner accès.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Garder le rendu du Dashboard**

Dans `src/pages/DashboardPage.tsx`, importer et insérer la garde en tout début du `return` du composant (avant le markup principal) :

```tsx
import { useIsPending, useAccessLoading } from '@/features/access/useAccess'
import { PendingAccessScreen } from '@/features/access/PendingAccessScreen'
```

Au début du corps de `DashboardPage()` (après les hooks existants, avant le `return` principal) :

```tsx
  const accessLoading = useAccessLoading()
  const pending = useIsPending()
  if (accessLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (pending) return <PendingAccessScreen />
```

- [ ] **Step 3: Vérifier compilation + build**

Run: `npx tsc -b && npm run build`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/features/access/PendingAccessScreen.tsx src/pages/DashboardPage.tsx
git commit -m "feat(access): écran accès en attente + garde dashboard"
```

---

## PHASE 2 — Écran d'admin

### Task 6: API Firestore rôles & users

**Files:**
- Create: `src/features/access/rolesApi.ts`
- Create: `src/features/access/usersApi.ts`

- [ ] **Step 1: rolesApi**

```ts
// src/features/access/rolesApi.ts
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface Role {
  id: string
  name: string
  permissions: string[]
  createdAt: number
  updatedAt: number
}

export async function listRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, 'roles'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Role, 'id'>) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Crée ou met à jour un rôle. id absent → nouvel id auto. */
export async function saveRole(role: { id?: string; name: string; permissions: string[] }): Promise<string> {
  const id = role.id ?? doc(collection(db, 'roles')).id
  const now = Date.now()
  await setDoc(
    doc(db, 'roles', id),
    { name: role.name.trim(), permissions: role.permissions, updatedAt: now, ...(role.id ? {} : { createdAt: now }) },
    { merge: true },
  )
  return id
}

export async function deleteRole(id: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', id))
}
```

- [ ] **Step 2: usersApi**

```ts
// src/features/access/usersApi.ts
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface ManagedUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
  lastSeenAt: number
  accessRoleId: string | null
  accessGrants: string[]
  accessRevokes: string[]
}

/** Liste tous les users (admin only — la règle Firestore l'autorise). On NE lit QUE les
 *  champs d'identité/access, jamais les secrets (apiKeys/telegram/siteCookies). */
export async function listUsers(): Promise<ManagedUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        uid: d.id,
        email: (x.email as string) ?? '',
        displayName: (x.displayName as string) ?? '',
        photoURL: (x.photoURL as string) ?? '',
        lastSeenAt: (x.lastSeenAt as number) ?? 0,
        accessRoleId: (x.accessRoleId as string | null) ?? null,
        accessGrants: (x.accessGrants as string[]) ?? [],
        accessRevokes: (x.accessRevokes as string[]) ?? [],
      }
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export async function updateUserAccess(
  uid: string,
  access: { accessRoleId?: string | null; accessGrants?: string[]; accessRevokes?: string[] },
): Promise<void> {
  await setDoc(doc(db, 'users', uid), access, { merge: true })
}
```

- [ ] **Step 3: Vérifier compilation**

Run: `npx tsc -b`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/features/access/rolesApi.ts src/features/access/usersApi.ts
git commit -m "feat(access): API Firestore rôles & users"
```

---

### Task 7: Onglet Rôles (liste + éditeur matrice)

**Files:**
- Create: `src/features/access/admin/RolesTab.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
// src/features/access/admin/RolesTab.tsx
import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { permissionsByModule } from '@/features/access/permissions'
import { listRoles, saveRole, deleteRole, type Role } from '@/features/access/rolesApi'

export function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([])
  const [editing, setEditing] = useState<{ id?: string; name: string; permissions: Set<string> } | null>(null)
  const byModule = permissionsByModule()

  const refresh = () => { void listRoles().then(setRoles) }
  useEffect(() => { refresh() }, [])

  const startNew = () => setEditing({ name: '', permissions: new Set() })
  const startEdit = (r: Role) => setEditing({ id: r.id, name: r.name, permissions: new Set(r.permissions) })

  const toggle = (key: string) => {
    if (!editing) return
    const next = new Set(editing.permissions)
    next.has(key) ? next.delete(key) : next.add(key)
    setEditing({ ...editing, permissions: next })
  }

  const save = async () => {
    if (!editing || !editing.name.trim()) return
    await saveRole({ id: editing.id, name: editing.name, permissions: [...editing.permissions] })
    setEditing(null); refresh()
  }

  const remove = async (id: string) => { await deleteRole(id); refresh() }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nom du rôle (ex. Éditeur PIM)"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          <button onClick={save} disabled={!editing.name.trim()} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
          <button onClick={() => setEditing(null)} className="p-2 text-white/40 hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-3">
          {Object.entries(byModule).map(([module, defs]) => (
            <div key={module} className="bg-white/[0.03] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">{module}</p>
              <div className="flex flex-wrap gap-1.5">
                {defs.map((d) => {
                  const on = editing.permissions.has(d.key)
                  return (
                    <button key={d.key} onClick={() => toggle(d.key)} title={d.key}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${on ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/70'}`}>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={startNew} className="self-start flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200">
        <Plus className="w-4 h-4" /> Nouveau rôle
      </button>
      {roles.map((r) => (
        <div key={r.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5">
          <button onClick={() => startEdit(r)} className="flex flex-col items-start text-left min-w-0">
            <span className="text-sm text-white/90">{r.name}</span>
            <span className="text-[10px] text-white/30">{r.permissions.length} permission(s)</span>
          </button>
          <button onClick={() => remove(r.id)} className="p-1.5 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {roles.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun rôle — clique « Nouveau rôle ».</p>}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc -b`
Expected: succès.

- [ ] **Step 3: Commit**

```bash
git add src/features/access/admin/RolesTab.tsx
git commit -m "feat(access): onglet Rôles + éditeur matrice de permissions"
```

---

### Task 8: Onglet Utilisateurs (rôle + surcharges)

**Files:**
- Create: `src/features/access/admin/UsersTab.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
// src/features/access/admin/UsersTab.tsx
import { useEffect, useState } from 'react'
import { permissionsByModule, permissionLabel } from '@/features/access/permissions'
import { listUsers, updateUserAccess, type ManagedUser } from '@/features/access/usersApi'
import { listRoles, type Role } from '@/features/access/rolesApi'

export function UsersTab() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const byModule = permissionsByModule()

  const refresh = () => { void listUsers().then(setUsers) }
  useEffect(() => { refresh(); void listRoles().then(setRoles) }, [])

  const setRole = async (u: ManagedUser, roleId: string) => {
    await updateUserAccess(u.uid, { accessRoleId: roleId || null })
    refresh()
  }

  const toggleOverride = async (u: ManagedUser, key: string, kind: 'grant' | 'revoke') => {
    const field = kind === 'grant' ? 'accessGrants' : 'accessRevokes'
    const cur = new Set(u[field])
    cur.has(key) ? cur.delete(key) : cur.add(key)
    await updateUserAccess(u.uid, { [field]: [...cur] })
    refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <div key={u.uid} className="bg-white/[0.03] rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            {u.photoURL
              ? <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full" />
              : <div className="w-7 h-7 rounded-full bg-white/10" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/90 truncate">{u.displayName || u.email}</p>
              <p className="text-[10px] text-white/30 truncate">{u.email}</p>
            </div>
            <select
              value={u.accessRoleId ?? ''}
              onChange={(e) => setRole(u, e.target.value)}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80"
            >
              <option value="">— en attente —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={() => setExpanded(expanded === u.uid ? null : u.uid)} className="text-[11px] text-white/40 hover:text-white/70 px-1">
              surcharges
            </button>
          </div>

          {expanded === u.uid && (
            <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
              {Object.entries(byModule).map(([module, defs]) => (
                <div key={module}>
                  <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1">{module}</p>
                  <div className="flex flex-wrap gap-1">
                    {defs.map((d) => {
                      const granted = u.accessGrants.includes(d.key)
                      const revoked = u.accessRevokes.includes(d.key)
                      return (
                        <span key={d.key} className="inline-flex items-center gap-0.5">
                          <button onClick={() => toggleOverride(u, d.key, 'grant')} title={`+ ${d.key}`}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${granted ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'border-white/10 text-white/40'}`}>+ {permissionLabel(d.key)}</button>
                          <button onClick={() => toggleOverride(u, d.key, 'revoke')} title={`− ${d.key}`}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${revoked ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'border-white/10 text-white/40'}`}>−</button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {users.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun utilisateur.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc -b`
Expected: succès.

- [ ] **Step 3: Commit**

```bash
git add src/features/access/admin/UsersTab.tsx
git commit -m "feat(access): onglet Utilisateurs + assignation rôle & surcharges"
```

---

### Task 9: Page admin + entrée sidebar (admin only)

**Files:**
- Create: `src/features/access/admin/AccessAdminPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Page admin (assemble les deux onglets)**

```tsx
// src/features/access/admin/AccessAdminPage.tsx
import { useState } from 'react'
import { Users, Shield } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'

export function AccessAdminPage() {
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  return (
    <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold text-white">Utilisateurs & rôles</h1>
        <nav className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1 self-start">
          {([['users', 'Utilisateurs', Users], ['roles', 'Rôles', Shield]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ${tab === id ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
        {tab === 'users' ? <UsersTab /> : <RolesTab />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ajouter la section au Dashboard**

Dans `src/pages/DashboardPage.tsx` :

1. Ajouter `'access'` au type `Section` (ligne ~33) :
```tsx
type Section = 'blank' | 'import' | 'library' | 'images' | 'data' | 'chat' | 'settings' | 'taxonomies' | 'scraping-templates' | 'scraping-hub' | 'workflows' | 'hyperframes' | 'telegram' | 'access'
```

2. Importer en haut :
```tsx
import { ShieldCheck } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { AccessAdminPage } from '@/features/access/admin/AccessAdminPage'
```

3. Ajouter l'item de menu à `menuItems` (après `chat`) :
```tsx
  { id: 'access', icon: ShieldCheck, label: 'Utilisateurs & rôles', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300' },
```

4. Dans le composant, calculer la visibilité admin (après les hooks existants) :
```tsx
  const isAdmin = useIsAdmin()
```

5. Filtrer le menu affiché — remplacer `menuItems.map(` dans la sidebar par `visibleMenuItems.map(` et définir au-dessus du `return` :
```tsx
  const visibleMenuItems = isAdmin ? menuItems : menuItems.filter((m) => m.id !== 'access')
```
(et utiliser `visibleMenuItems` aussi dans la navigation clavier ArrowUp/Down comme pour les autres items.)

6. Ajouter le rendu de la section (dans la chaîne de conditions `activeSection === ...`) :
```tsx
      ) : activeSection === 'access' && isAdmin ? (
        <AccessAdminPage />
```

- [ ] **Step 3: Vérifier compilation + build**

Run: `npx tsc -b && npm run build`
Expected: succès.

- [ ] **Step 4: Déployer + vérifier en réel**

Run: `firebase deploy --only hosting`
Vérifier : connecté en owner → onglet « Utilisateurs & rôles » visible ; créer un rôle, l'assigner à un compte test ; le compte test (pending) voit l'écran d'attente puis, après assignation, accède aux modules.

- [ ] **Step 5: Commit**

```bash
git add src/features/access/admin/AccessAdminPage.tsx src/pages/DashboardPage.tsx
git commit -m "feat(access): écran admin Utilisateurs & rôles (admin only)"
```

---

## PHASE 3 — Câblage des modules

### Task 10: Filtrer la sidebar par `<module>.view`

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Mapper les sections aux permissions**

Ajouter en haut de `DashboardPage.tsx` (après `menuItems`) une table section→permission. Les sections sans clé (`blank`, `settings`, `access`) ne sont pas filtrées par `view` ici (`settings` géré en Task 11 ; `access` géré par `isAdmin`) :

```tsx
const SECTION_PERMISSION: Partial<Record<Section, string>> = {
  import: 'import.view',
  library: 'library.view',
  images: 'dam.view',
  data: 'pim.view',
  taxonomies: 'taxonomies.view',
  'scraping-templates': 'scrapingTemplates.view',
  'scraping-hub': 'scrapingHub.view',
  workflows: 'workflows.view',
  hyperframes: 'hyperframes.view',
  chat: 'chat.view',
  telegram: 'telegram.view',
}
```

- [ ] **Step 2: Filtrer `visibleMenuItems` par permission**

Remplacer la définition de `visibleMenuItems` (Task 9) par une version qui utilise le store de permissions. Comme `useCan` est un hook (un par clé), on lit le `Set` directement :

```tsx
import { useAccessStore } from '@/stores/access.store'
// ...dans le composant :
  const permissions = useAccessStore((s) => s.permissions)
  const canSee = (id: Section) => {
    if (id === 'access') return isAdmin
    const perm = SECTION_PERMISSION[id]
    return isAdmin || !perm || permissions.has(perm)
  }
  const visibleMenuItems = menuItems.filter((m) => canSee(m.id))
```

(`blank` et `settings` n'ont pas d'entrée dans `SECTION_PERMISSION` → toujours visibles ; affiner plus tard si besoin.)

- [ ] **Step 3: Garder le rendu des sections**

Pour chaque section gérée, ajouter `&& canSee('<id>')` à sa condition de rendu (défense si `activeSection` est forcé). Exemple pour `data` (PIM) :
```tsx
      ) : activeSection === 'data' && canSee('data') ? (
```
Répéter pour : `import`, `images`, `taxonomies`, `scraping-templates`, `scraping-hub`, `workflows`, `hyperframes`, `chat`, `telegram`.

- [ ] **Step 4: Vérifier compilation + build**

Run: `npx tsc -b && npm run build`
Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(access): filtrage de la sidebar par permissions de module"
```

---

### Task 11: Filtrer les onglets Paramètres + migrer les gates ad-hoc

**Files:**
- Modify: `src/components/shared/SettingsPanel.tsx`

- [ ] **Step 1: Mapper les onglets aux permissions**

Dans `SettingsPanel.tsx`, ajouter une table onglet→permission (sous la const `TABS`). Les onglets `profile`/`ai`/`stats` restent visibles par tous ; `connectors`/`cookies` exigent une permission d'édition ; `firebase` reste owner via `isOwner` (déjà en place) :

```tsx
const TAB_PERMISSION: Partial<Record<SettingsTab, string>> = {
  connectors: 'settings.connectors.edit',
  cookies: 'settings.cookies.edit',
}
```

- [ ] **Step 2: Filtrer `visibleTabs` par permission**

Remplacer la définition existante de `visibleTabs` (mise en place pour l'onglet Firebase) par :

```tsx
import { useAccessStore } from '@/stores/access.store'
// ...dans le composant :
  const permissions = useAccessStore((s) => s.permissions)
  const canTab = (id: SettingsTab) => {
    if (id === 'firebase') return isOwner
    const perm = TAB_PERMISSION[id]
    return isOwner || !perm || permissions.has(perm)
  }
  const visibleTabs = TABS.filter((t) => canTab(t.id))
```

(`isOwner` est déjà défini dans le composant via `useIsOwner()`.)

- [ ] **Step 3: Garder le contenu des onglets**

Mettre à jour les rendus conditionnels pour utiliser `canTab` :
```tsx
      {activeTab === 'connectors' && canTab('connectors') && <ConnectorsTab />}
      {activeTab === 'cookies' && canTab('cookies') && <CookiesTab />}
      {activeTab === 'firebase' && isOwner && <FirebaseTab />}
```

- [ ] **Step 4: Vérifier compilation + build**

Run: `npx tsc -b && npm run build`
Expected: succès.

- [ ] **Step 5: Déployer + commit**

```bash
firebase deploy --only hosting
git add src/components/shared/SettingsPanel.tsx
git commit -m "feat(access): filtrage des onglets Paramètres par permissions"
```

---

## Vérification finale (V1 complète)

- [ ] `npx tsc -b` ✅ · `npm run test:run` ✅ · `npm run build` ✅
- [ ] Test réel 2 comptes : owner voit tout + « Utilisateurs & rôles » ; compte test = pending → écran d'attente ; owner crée « Lecteur DAM » (`dam.view`), l'assigne → le compte test ne voit QUE le DAM ; surcharge `+pim.view` → le PIM apparaît ; `−dam.view` via revoke → le DAM disparaît.
- [ ] Confirmer qu'aucun secret (apiKeys/telegram/siteCookies) n'apparaît dans l'écran admin.

## Hors plan (phase 4, à planifier séparément)
- Points de contrôle fins (boutons/champs individuels) via `useCan` ciblés.
- Durcissement des règles Firestore par collection de données (PIM `pim_projects`, DAM `dam_assets`…) en fonction des permissions.
- Délégation du rôle Admin à d'autres comptes via custom claims Firebase.
