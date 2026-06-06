# Wizard d'onboarding A→Z — Design

> Date : 2026-06-06
> Statut : design validé, prêt pour plan d'implémentation

## Objectif

Remplacer le wizard mono-étape `OnboardingKeysWizard` (clés LLM uniquement) par un
**assistant de configuration multi-étapes** qui guide tout nouvel utilisateur à travers
l'ensemble du paramétrage de l'application à sa première ouverture, puis ne réapparaît
plus une fois terminé (flag Firestore par user).

## Parcours (5 étapes)

| # | Étape | Obligatoire | Contenu |
|---|-------|-------------|---------|
| 1 | **Bienvenue** | — | Pitch + aperçu des étapes à venir |
| 2 | **Clés LLM** | ✅ oui | Liste `ApiKeyRow` des providers ; « Suivant » bloqué tant que `hasAnyLlmKey()` est faux |
| 3 | **Modèles & cascade IA** | skippable | Sélecteur du modèle par défaut + édition de l'ordre de la cascade de raisonnement |
| 4 | **Connecteurs** | skippable | Google Drive (DAM), bot Telegram, token Bright Data (scraping anti-bot) |
| 5 | **Profil & tour** | skippable | Récap + bouton « Lancer la visite guidée » (`startTour('dashboard')`) puis **Terminer** |

Chaque étape optionnelle (3, 4, 5) expose un lien « Passer ». Seule l'étape 2 bloque la
progression. L'utilisateur peut fermer la modale (« Plus tard ») à tout moment.

## Logique d'affichage

### Auto-ouverture
```
ouvrir ⟺ areApiKeysHydrated() && !onboardingComplete && !hasAnyLlmKey()
```
- On attend l'hydratation des clés depuis Firestore (sinon flash pour un user de retour
  dont les clés vivent côté serveur) — on lit le booléen synchrone ET on écoute
  `API_KEYS_HYDRATED_EVENT` / `API_KEYS_UPDATED_EVENT`, comme le wizard actuel.
- **Dès qu'une clé LLM existe, plus aucune auto-ouverture.**
- **Corollaire (cas user existant)** : les utilisateurs actuels possèdent déjà des clés et
  n'ont pas de flag `onboardingComplete`. Le déclencheur ci-dessus garantit qu'ils ne sont
  **jamais** harcelés par le wizard au prochain login (ils ont des clés → condition fausse).
- `sessionStorage` (`ONBOARDING_DISMISS_KEY`) masque le wizard pour la session courante
  après un « Plus tard » — comportement conservé de l'actuel.

### Fin de parcours
- `onboardingComplete` (champ `users/{uid}.onboardingComplete: boolean`) passe à `true`
  **uniquement** au clic « Terminer » de l'étape 5.
- Une fois `true`, le wizard ne réapparaît **plus jamais**, sur toute machine.

### Ré-entrée manuelle
Puisque l'auto-ouverture disparaît dès la 1ʳᵉ clé, le « reprendre plus tard » des étapes
optionnelles passe par **deux points de ré-entrée manuels** (décision user : les deux) :
1. **Bandeau en tête du `SettingsPanel`** — bouton « Assistant de configuration ».
2. **Entrée dans le `ModuleNavDrawer`** (FAB nav bas-gauche) — « Configurer l'application ».

Les deux appellent `useOnboardingStore.open()` (ouverture forcée, indépendante du gate auto).

## Architecture

### Module `features/onboarding/`

```
features/onboarding/
  OnboardingWizard.tsx        # coquille modale : header + progression + nav + footer (<150 l)
  steps/
    WelcomeStep.tsx
    KeysStep.tsx              # réutilise ApiKeyRow
    AiStep.tsx                # réutilise <AiCascadeEditor> (extrait, cf. ci-dessous)
    ConnectorsStep.tsx        # réutilise les 3 lignes connecteurs (extraites)
    FinishStep.tsx            # récap + lancement du tour
  useOnboardingGate.ts        # décide de l'auto-ouverture
  onboarding.store.ts         # état { open, step }, actions open()/close()/next()/prev()/goto()
  completeOnboarding.ts       # écrit { onboardingComplete: true } (gardé)
  onboardingKeys.ts           # CONSERVÉ : hasAnyLlmKey, LLM_KEY_IDS, RECOMMENDED_KEY_IDS, ONBOARDING_DISMISS_KEY
```

`OnboardingKeysWizard.tsx` est **supprimé** ; `OnboardingWizard.tsx` le remplace.

### Persistance & lecture du flag

- **Lecture** : piggyback sur le `getDoc(doc(db,'users',uid))` que `useAccessInit` exécute
  déjà au login. On y récupère `onboardingComplete` et on l'expose via `access.store`
  (nouveau champ `onboardingComplete: boolean`). **Pas de 2ᵉ lecture Firestore.**
  - ⚠️ `useAccessInit` dépend déjà de `[user]` mais gère l'annulation (`cancelled`) — on ne
    touche pas à ses dépendances. Le gate du wizard, lui, lit depuis le store (pas de hook
    de fetch propre) → pas de risque de re-run sur refresh token.
- **Écriture** (`completeOnboarding.ts`) :
  ```ts
  export async function completeOnboarding(uid: string): Promise<void> {
    if (!uid) return // garde : fluctuation auth null→uid ne doit jamais écrire
    await setDoc(doc(db,'users',uid), { onboardingComplete: true }, { merge: true })
  }
  ```
  `merge: true` n'écrase pas les secrets ni les champs `access*` (même contrat que
  `writeUserProfile`). Garde `if (!uid) return` contre la fluctuation auth `null→uid` qui a
  déjà poussé un `{}` et effacé la config Telegram (cf. mémoire `firestore-sync-hooks-bugs`).

### Extraction depuis `SettingsPanel.tsx` (1237 l) — chirurgicale

Décision user : **extraction complète partagée**. Pour ne **jamais dupliquer** les flux
OAuth/sync, on sort en composants réutilisés par le wizard ET le SettingsPanel, **un par
un**, avec `npx tsc -b` + vérification du rendu SettingsPanel après chacun (chaque fichier
< 150 l, convention CLAUDE.md) :

| Composant extrait | Destination | Consommé par |
|-------------------|-------------|--------------|
| `GDriveConnectorRow` | `features/gdrive/GDriveConnectorRow.tsx` | wizard ét.4 + SettingsPanel |
| Ligne Telegram (existe déjà : `TelegramSettings`) | déjà autonome | wizard ét.4 + SettingsPanel |
| Ligne Bright Data | `features/scraping/BrightDataConnectorRow.tsx` | wizard ét.4 + SettingsPanel |
| Éditeur cascade IA + modèle par défaut | `features/ai/AiCascadeEditor.tsx` | wizard ét.3 + SettingsPanel |
| `ApiKeyRow` | déjà partagé (`components/shared/`) | tel quel |

Ordre d'extraction : un composant → `tsc -b` → vérif rendu Settings → commit → suivant.
**Aucune logique métier dupliquée** ; les composants extraits encapsulent leurs hooks
(`useGoogleDrive`, `useAiSettingsStore`, etc.) inchangés.

## Montage

- `DashboardPage.tsx:278` : remplacer `<OnboardingKeysWizard />` par `<OnboardingWizard />`.
- Le gate auto (`useOnboardingGate`) est appelé dans `OnboardingWizard` (monté après les
  gardes d'accès, donc users approuvés uniquement, comme l'actuel).

## Style (dark mode obligatoire)

Reprendre l'esthétique de la modale actuelle : fond `#1a1a1a`, bordures `white/10`, accent
indigo `#6366f1`, header avec icône gradient indigo→fuchsia. Ajout d'une **barre de
progression** (5 pastilles) en header et d'une nav **Précédent / Suivant / Passer / Terminer**
en footer.

## Tests

- `onboardingKeys.test.ts` (étendre) : `hasAnyLlmKey` cas vide/rempli.
- `onboardingGate.test.ts` : table de vérité de l'auto-ouverture
  (hydraté×onboardingComplete×hasKey×dismissed) — notamment le cas **user existant**
  (a une clé, pas de flag → ne s'ouvre PAS).
- `completeOnboarding.test.ts` : `uid` vide → aucune écriture ; `uid` valide → `setDoc merge`.

## Hors périmètre (YAGNI)

- Pas de progression partielle persistée (« reprise à l'étape 3 ») : on rouvre toujours à
  l'étape 1, la nav est rapide.
- Pas d'A/B testing ni d'analytics d'onboarding.
- Pas de modification des règles Firestore (le champ `onboardingComplete` vit dans
  `users/{uid}` déjà writable par le user lui-même).
