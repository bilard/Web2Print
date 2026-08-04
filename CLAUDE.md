# CLAUDE.md — Web2Print
> Éditeur web type Canva avec import PDF/IDML et export multi-format

## Stack
React 18, Vite 8, TypeScript strict (cible ES2022), Fabric.js v7, Zustand v4, React Query v5, Firebase 12 (Auth+Firestore+Storage), shadcn/ui + Tailwind v3, pdfjs-dist, pdf-lib, PptxGenJS, @dnd-kit v6, Lucide React, Sonner, React Router v6

## Conventions
- Composants : `PascalCase.tsx`, max 150 lignes
- Hooks : `useCamelCase.ts`
- Stores : `camelCase.store.ts` (un par domaine)
- Pas de logique métier dans les composants UI
- Typer explicitement les props (pas d'`any`)
- Fabric.js : logique d'édition centralisée dans `features/editor/`. Les modules d'import/export (`features/idml`, `features/pptx`, `features/export`, `features/merge`) et les panneaux d'édition (`components/panels`, `components/canvas`) peuvent importer Fabric directement pour le parsing et le rendu.
- Firebase : accès uniquement via hooks de `features/`
- **Théming clair/sombre par tokens** (défaut : sombre) : utiliser `bg-background` / `bg-surface` / `bg-surface-2` / `bg-well` — jamais d'hex sombre en dur. Convention : `white` = couleur d'avant-plan THÉMABLE (blanc en sombre, quasi-noir en clair) ; pour du blanc véritable (texte sur bouton/fond coloré, overlay `bg-black/50+`), utiliser `text-[#fff]`. Les crans pâles 100-400 des couleurs d'accent et des gris basculent automatiquement vers 600-900 en clair (variables CSS, cf. `tailwind.config.ts` + `src/index.css`). Couleurs programmatiques (Fabric, ReactFlow) : lire `useThemeStore` (`resolvedTheme`). Préférence : `stores/theme.store.ts` + synchro `users/{uid}.uiSettings.theme`. Accent : `#6366f1`.
- Répondre toujours en **français**

## Fichiers à ne jamais modifier
- `src/components/ui/**` (shadcn/ui)
- `src/lib/firebase/config.ts` (credentials)
- `public/fonts/`

## Firebase
- Project ID : `web2print-6fe5a`
- Config dans `.env.local` (gitignored) et `src/lib/firebase/config.ts`

## Commandes & vérification
- Dev : `npm run dev` (Vite)
- Build : `npm run build` (= `tsc -b && vite build`)
- **Audit complet : `npm run audit`** (`--fast` sans la duplication) — types, lint, tests, code mort, cycles + indicateurs de dette. Skill `/clean` pour traiter ce qu'il révèle.
- **Types : `npx tsc -b`** — ⚠️ le projet utilise des *project references* ; `tsc --noEmit` seul ne vérifie RIEN (`tsconfig.json` racine a `files: []` + `references`). Toujours utiliser `tsc -b`.
- Lint : `npm run lint` — baseline **0 warning** depuis 2026-07-26, à maintenir.
- **Traduction : skill `/translate`** — porte au catalogue les textes encore en dur, puis met à jour EN (anglais **britannique**) et ES. `node scripts/i18n-scan-literals.mjs` mesure ce qui reste.
- Tests : `npm run test:run` (Vitest)
- Code mort : `npm run dead` (knip) — baseline **exit 0** depuis 2026-06-09 ; toute nouvelle sortie = vrai code mort à traiter. Le faux positif connu (`@types/chrome` de `extension/`) est déclaré dans `knip.json` (`ignoreDependencies`). Convention : un symbole utilisé seulement dans son fichier ne doit PAS être exporté (les nodes de workflow s'enregistrent par effet de bord sans export).
- Dépendances circulaires : `npm run cycles` (madge) — baseline **0** depuis 2026-07-26. Cause récurrente : un type ou un état exporté depuis un module de composant. Les sortir dans un module `*Types.ts` dédié.
- Duplication : `npm run dup` (jscpd, blocs ≥ 30 lignes) et `npm run dup:symbols` (fonctions identiques entre modules, y compris courtes). ⚠️ Toujours `diff` les deux fichiers avant de fusionner : certains « doublons » sont des **forks divergents** (`ai-enrichment/relatedUrls.ts` vs `scraping/core/relatedUrls.ts`), les fusionner change le comportement du scraping.

## Logs
- Traces de debug (scraping, enrichissement, export) : `debugLog` de `src/lib/debugLog.ts`, jamais `console.log` — actif en dev, ou en prod via `localStorage.setItem('debug','1')` puis rechargement. `console.warn`/`error`/`info` restent libres (vraies anomalies). La règle eslint `no-console` ne vise que `src/**` : Cloud Functions et scripts Node gardent `console` comme canal de log légitime.
- Run à conserver côté serveur : `recordPipelineRun` (`src/lib/pipelineLog.ts`).
