# Design — Système de rôles & permissions (RBAC)

> Date : 2026-06-03 · Statut : approuvé (design), à implémenter
> App : Web2Print (déployée multi-utilisateurs sur ibs-studio.com via Firebase Hosting)

## 1. Problème & objectif

L'app est passée publique avec connexion Google **ouverte à tous**. Aujourd'hui tout
compte connecté voit tous les modules. On veut un contrôle d'accès **par rôles**, avec une
**granularité maximale** (jusqu'aux boutons/champs), géré depuis un **écran d'admin dédié**.

Ce système **généralise** le gating ad-hoc actuel basé sur l'e-mail (`useIsOwner`, utilisé
pour masquer les données financières Bright Data, l'onglet Firebase, etc.).

### Objectifs
- Modèle de permissions flexible supportant n'importe quelle finesse (clés arbitraires).
- Rôles réutilisables + surcharges ponctuelles par utilisateur.
- Nouvel utilisateur connecté = **aucun accès** tant que l'admin ne lui assigne pas un rôle.
- Écran d'admin pour gérer utilisateurs et rôles.

### Non-objectifs (V1)
- Application des permissions côté serveur au niveau champ (les règles Firestore ne gatent
  qu'au niveau collection — durcissement progressif en phase 4).
- Déléguer le rôle « Admin » à un autre compte de façon sûre (nécessite des custom claims
  Firebase → v2). En V1, **l'admin = le propriétaire `ibs.studio@gmail.com` uniquement**.

## 2. Décisions de design (validées)
| Sujet | Décision |
|---|---|
| Granularité | Maximum — modèle de permissions « par clés » arbitraires |
| Onboarding | Connexion ouverte + état « en attente » (deny-all jusqu'à attribution d'un rôle) |
| Rôles | Rôles réutilisables **+ surcharges par utilisateur** (grants/revokes) |
| Application | Interface d'abord (V1), règles serveur par collection ensuite (phase 4) |
| Admin | Propriétaire uniquement en V1 |

## 3. Modèle de permissions
Registre central typé : `src/features/access/permissions.ts`.
- Clés pointées `module.action` (ou `module.sous.action`), ex :
  `pim.view`, `pim.edit`, `pim.delete`, `pim.export`,
  `dam.view`, `dam.upload`, `dam.delete`,
  `workflows.view`, `workflows.run`,
  `telegram.view`,
  `settings.view`, `settings.firebase.view`, `settings.connectors.edit`, `settings.cookies.edit`…
- Chaque entrée : `{ key, module, label, description }`. Le registre est la **source de
  vérité** : l'écran admin génère sa matrice à partir de lui, et `useCan` valide contre lui.
- Convention : `<module>.view` gate la visibilité du module dans la sidebar. Les clés plus
  fines gatent onglets/boutons/champs, ajoutées au fil de l'eau (incrémental assumé).
- Permission spéciale `admin` : accès total + gestion rôles/users. Le propriétaire la possède
  toujours (fallback en dur, impossible de se verrouiller dehors).

## 4. Données (Firestore)
- **`roles/{roleId}`** : `{ name: string, permissions: string[], createdAt: number, updatedAt: number }`.
- **`users/{uid}`** (doc existant, étendu — n'écrase pas `apiKeys`/`telegram`/`siteCookies`) :
  - `accessRoleId: string | null` — `null` = en attente (aucun accès).
  - `accessGrants: string[]` — permissions ajoutées en plus du rôle.
  - `accessRevokes: string[]` — permissions retirées du rôle.
  - `email`, `displayName`, `photoURL`, `lastSeenAt: number` — écrits/rafraîchis au login
    (un effet dans `AuthProvider`) pour que l'admin identifie les utilisateurs.
- **Permissions effectives** = `(rôle.permissions ∪ accessGrants) \ accessRevokes`.
  - Propriétaire → court-circuit : toutes les permissions + `admin`.

## 5. Couche d'accès runtime — `src/features/access/`
- `permissions.ts` — registre + types (`PermissionKey`, `PERMISSIONS`, helpers).
- `access.store.ts` (ou hook + React Query) — au login : lit `users/{uid}` puis le doc
  `roles/{accessRoleId}` ; calcule un `Set<PermissionKey>` des permissions effectives.
- `useAccess.ts` :
  - `useCan(key): boolean` — l'utilisateur a-t-il la permission ? (owner → toujours `true`).
  - `useIsPending(): boolean` — connecté mais sans rôle (et non-owner).
  - `useIsAdmin(): boolean` — possède `admin` (= owner en V1).
- `Can` (composant optionnel) : `<Can perm="pim.edit">…</Can>`.
- Migration : `useIsOwner` reste pour l'infra pure ; les gates existants (onglet Firebase,
  données Bright Data) peuvent migrer vers des clés (`settings.firebase.view`, etc.) en phase 3.

## 6. Écran « accès en attente »
Si `useIsPending()` → rendu plein-écran « Accès en attente de validation » (style charte
sombre, bouton de déconnexion) à la place du dashboard. Implémenté comme garde dans
`ProtectedRoute` ou en tête de `DashboardPage`.

## 7. Écran d'admin « Utilisateurs & rôles » (admin only)
Nouvel élément de sidebar (visible si `useIsAdmin()`), nouvelle section/route.
- **Onglet Utilisateurs** : liste de tous les `users` (avatar, e-mail, nom, dernière vue,
  rôle courant). Par ligne : sélecteur de rôle + panneau dépliable de surcharges
  (toggles +grant / −revoke par permission).
- **Onglet Rôles** : liste des rôles ; créer/éditer/supprimer. L'édition affiche la **matrice
  complète** des permissions du registre (groupées par module, une case par clé) = granularité
  maximum. Nom du rôle éditable. Suppression d'un rôle → les utilisateurs concernés repassent
  « en attente » (`accessRoleId` orphelin traité comme null).

## 8. Application V1 (interface)
- `menuItems` du Dashboard filtrés par `useCan('<module>.view')`.
- Onglets de `SettingsPanel` filtrés par clés (`settings.firebase.view`, etc.).
- Boutons/champs sensibles enveloppés dans `useCan(...)` progressivement.
- Garde de rendu sur les sections (défense si la route est forcée).

## 9. Règles Firestore (V1)
Helper `isAdmin()` = `request.auth.token.email == 'ibs.studio@gmail.com'` (aligné sur
`OWNER_EMAIL` côté client ; custom claims en v2).
- `roles/{roleId}` : `read` si authentifié (les listes de permissions ne sont pas secrètes) ;
  `write` si `isAdmin()`.
- `users/{uid}` : `read, write` si `uid == request.auth.uid` **OU** `isAdmin()` (l'admin lit la
  liste et écrit `accessRoleId`/grants/revokes). ⚠️ vérifier que l'admin peut écrire le champ
  `access*` sans pouvoir corrompre les secrets perso d'un autre (acceptable : l'admin est de
  confiance ; affiner si besoin).
- Phase 4 : durcir les collections de données (PIM `pim_projects`, DAM `dam_assets`…) pour
  exiger la permission correspondante — non couvert par cette spec.

## 10. Séquence de construction (V1 = phases 1→3)
1. **Cœur d'accès** : registre de permissions, extension du modèle `users`, écriture du profil
   au login, `access.store`/`useAccess`, écran « en attente », règles Firestore (roles + users
   admin-read). Tests unitaires du calcul des permissions effectives.
2. **Écran admin** : route + sidebar (admin only), onglet Utilisateurs (liste + assignation
   rôle + surcharges), onglet Rôles (CRUD + matrice).
3. **Câblage module-level** : filtrage sidebar + onglets Paramètres ; migration des gates
   ad-hoc existants vers des clés.
4. *(Hors V1)* points de contrôle fins (boutons/champs) + durcissement règles serveur.

## 11. Tests
- Unitaire : calcul des permissions effectives (rôle ∪ grants − revokes ; owner = tout ;
  rôle manquant = pending).
- Unitaire : helpers du registre (clé inconnue, groupement par module).
- Manuel : 2 comptes (owner + invité) → invité « en attente », puis rôle assigné → modules
  visibles selon les clés ; surcharge +/− vérifiée.

## 12. Risques / points d'attention
- `users/{uid}` lisible par l'admin : s'assurer que les **secrets perso** (apiKeys, telegram,
  siteCookies) ne fuient pas dans l'écran admin — l'écran ne lit/affiche QUE les champs
  `email/displayName/photoURL/lastSeenAt/access*`, jamais les sous-objets secrets.
- Ne pas se verrouiller dehors : owner = admin en dur, jamais dépendant d'un rôle Firestore.
- Cohérence avec la purge localStorage multi-user (les permissions viennent de Firestore,
  recalculées au login → insensibles à la purge).
