# Mode clair — Design (Approche A : re-pointage palette via variables CSS)

**Date** : 2026-06-10
**Statut** : validé par l'utilisateur (cadrage + approche + design)

## Objectif

Ajouter un mode clair à toute l'application (Dashboard, PIM, DAM, Workflows, Éditeur, Réglages, modales), avec bascule Clair / Sombre / Système, sans régression visuelle en mode sombre (comportement par défaut inchangé).

## Cadrage validé

- **Bascule** : bouton `ThemeToggle` dans les headers principaux + section « Apparence » dans les Réglages. Trois états : Clair / Sombre / Système.
- **Périmètre** : toute l'app, y compris le chrome de l'éditeur Fabric.
- **Défaut** : Sombre (les utilisateurs existants ne voient aucun changement tant qu'ils n'activent rien).
- **Persistance** : localStorage + synchro Firestore `users/{uid}` (même mécanique que les autres réglages).

## Principe central

L'app utilise ~4 300 occurrences de classes « dark codé en dur » (`text-white` ×2752, `border-white/x` ×632, `bg-white/x` ×567, hex littéraux ×~292) dans 247 fichiers. Plutôt que de tout migrer, on **redéfinit la couleur `white` de Tailwind** comme variable CSS :

```ts
// tailwind.config.ts — theme.extend.colors
white:       'rgb(var(--base) / <alpha-value>)',      // « avant-plan » thémable
background:  'rgb(var(--bg) / <alpha-value>)',
surface:     'rgb(var(--surface) / <alpha-value>)',
'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
```

Les ~3 950 occurrences `*-white*` basculent automatiquement, modificateurs d'opacité compris (hiérarchie visuelle préservée : `bg-white/5` = éclaircissement subtil en sombre, assombrissement subtil en clair).

**Convention à documenter dans CLAUDE.md** : `white` = couleur d'avant-plan thémable ; `text-[#fff]` = blanc véritable (non thémable).

## 1. Fondations de thème

### Variables CSS (`src/index.css`)

- `:root` = valeurs sombres actuelles (défaut sombre, zéro flash pour l'existant) :
  `--base: 255 255 255`, `--bg: 36 36 36` (#242424), `--surface: 48 48 48` (#303030), `--surface-2: 38 38 38` (#262626) + variables shadcn existantes.
- `html.light` redéfinit :
  `--base: 23 23 23`, `--bg: 245 245 246` (#f5f5f6), `--surface: 255 255 255`, `--surface-2: 237 237 238` (#ededee) + bloc shadcn clair (`--background`, `--card`, `--popover`, `--border`, `--muted`…).
- `black` n'est **pas** redéfini : les backdrops `bg-black/60` des modales restent sombres en mode clair (convention standard).
- Format canaux RGB bruts (`255 255 255`) obligatoire pour que `<alpha-value>` fonctionne.

### Passe de contraste systémique (teintes d'accent pâles)

Les crans pâles utilisés pour du texte sur fond sombre (`text-indigo-300`, `text-emerald-300`, `text-amber-300`, `text-red-300`, etc.) sont illisibles sur fond clair. Même mécanique : re-pointer les crans **200/300/400** des couleurs d'accent réellement utilisées (inventaire à faire en début d'implémentation : indigo, emerald, amber, red, blue, violet, rose, orange…) via variables qui valent les crans d'origine en sombre et basculent vers ~600/700 en clair. Zéro fichier composant touché. Les crans 500+ (boutons pleins) ne sont pas re-pointés.

## 2. État, bascule et persistance

- **`src/stores/theme.store.ts`** (nouveau) : `themePref: 'light' | 'dark' | 'system'` (défaut `'dark'`) + `resolvedTheme` (résolution `system` via `matchMedia('(prefers-color-scheme: light)')` avec listener). Application : pose/retire la classe `light` sur `document.documentElement`.
- **Persistance** : localStorage (lecture immédiate) + synchro Firestore `users/{uid}` (source de vérité multi-appareils). ⚠️ Suivre les leçons des hooks de sync existants : dépendre de `[uid]` (pas `[user]`), ne jamais pousser sur fluctuation d'auth `null`→uid, purge au logout via la mécanique `purgeLocalUserData()` existante.
- **Anti-flash** : script inline dans `index.html` qui lit le localStorage et pose `.light` sur `<html>` avant le premier paint. Seuls les utilisateurs en préférence claire sont concernés (défaut CSS = sombre).
- **`ThemeToggle`** (nouveau composant partagé) : cycle Clair → Sombre → Système, icônes soleil/lune/moniteur (Lucide), placé dans les headers principaux (Dashboard, éditeur, pages modules — réutiliser les emplacements de header existants).
- **Réglages** : section « Apparence » dans SettingsPanel (radio 3 états, même état que le toggle).
- **Sonner** : `<Toaster theme={resolvedTheme}>`.

## 3. Migration mécanique (~440 occurrences à toucher)

1. **Hex littéraux** (~292) : `bg-[#242424]` → `bg-background`, `bg-[#303030]` → `bg-surface`, `bg-[#262626]` → `bg-surface-2`. Inventaire préalable des variantes proches (`#2a2a2a`, `#1a1a1a`, `#212121`, `#181818`…) mappées au token le plus proche (ou nouveau token si récurrent).
2. **Blanc véritable** (~152 occ., 88 fichiers) : `text-white` sur fond coloré (boutons indigo/rouge/vert, gradients) → `text-[#fff]`. Détection semi-mécanique (même ligne qu'un `bg-{couleur}-{400..600}` ou `from-/to-{couleur}`) + revue manuelle — les cas parent (fond coloré) / enfant (texte) dans des éléments séparés échappent au grep et seront attrapés en QA visuelle.
3. **Cas particuliers connus** :
   - Champ prompt DAM (`DamGenerate.tsx`, blanc volontaire validé) → littéraux `bg-[#fff] text-[#111] placeholder:text-[#111]/40`.
   - `src/features/tour/tour.css` (driver.js) : vérifier/adapter les couleurs du popover.
   - Scrollbars custom et styles inline `rgba(...)` : inventaire + adaptation.
   - Chrome du canvas Fabric (`CanvasContainer` : `bg-surface-2`) : le document blanc ressort correctement sur fond clair comme sombre ; vérifier les marqueurs/règles dessinés en overlay.

## 4. Vérification et livraison

- `npx tsc -b`, `npm run lint`, `npm run test:run`, `npm run build`.
- **QA visuelle des deux thèmes** (navigateur, screenshots) sur : Dashboard, PIM, DAM (dont Création d'image), Workflows, Éditeur, Réglages, modales principales (onboarding, pickers). C'est la passe qui attrape les blancs véritables parent/enfant ratés par le grep et les problèmes de contraste résiduels.
- **CLAUDE.md** : remplacer « Dark mode obligatoire » par la convention de théming (tokens `background`/`surface`/`surface-2`, `white` = avant-plan thémable, `text-[#fff]` = blanc véritable, palette clair/sombre).
- Déploiement : commit master + `npm run build` + `firebase deploy --only hosting` (process habituel).

## Hors périmètre

- `/promo/` (site statique séparé, non thémé).
- `src/components/ui/**` (shadcn, intouchable — déjà sur variables CSS, bascule gratuitement).
- Exports/rendus offscreen (PDF, IDML, PPTX, merge) : indépendants du thème UI.
- Mode clair du contenu *documents* édités (le papier est déjà blanc).

## Risques connus

| Risque | Mitigation |
|---|---|
| Blanc véritable non détecté (parent/enfant) → texte invisible en clair | QA visuelle systématique des deux thèmes |
| Teinte pâle oubliée dans la passe de contraste | Inventaire grep exhaustif des `text-{couleur}-{100..400}` en début d'implémentation |
| Régression en mode sombre | Par construction quasi nulle (`:root` garde les valeurs actuelles) ; QA dark incluse |
| Flash de thème au chargement | Script inline anti-flash dans `index.html` |
| Écrasement de réglages Firestore | Reproduire le pattern corrigé des hooks de sync (`[uid]`, pas de push sur auth transitoire) |
