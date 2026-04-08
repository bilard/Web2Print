# CLAUDE.md — Web2Print
> Éditeur web type Canva avec import PDF/IDML et export multi-format

## Stack
React 18, Vite 5, TypeScript strict, Fabric.js v6, Zustand v4, React Query v5, Firebase 10 (Auth+Firestore+Storage), shadcn/ui + Tailwind v3, pdfjs-dist, pdf-lib, PptxGenJS, @dnd-kit v6, Lucide React, Sonner, React Router v6

## Conventions
- Composants : `PascalCase.tsx`, max 150 lignes
- Hooks : `useCamelCase.ts`
- Stores : `camelCase.store.ts` (un par domaine)
- Pas de logique métier dans les composants UI
- Typer explicitement les props (pas d'`any`)
- Fabric.js : logique d'édition centralisée dans `features/editor/`. Les modules d'import/export (`features/idml`, `features/pptx`, `features/export`, `features/merge`) et les panneaux d'édition (`components/panels`, `components/canvas`) peuvent importer Fabric directement pour le parsing et le rendu.
- Firebase : accès uniquement via hooks de `features/`
- **Dark mode obligatoire** : fond `#0f0f0f`, surfaces `#1a1a1a`, accents `#6366f1`
- Répondre toujours en **français**

## Fichiers à ne jamais modifier
- `src/components/ui/**` (shadcn/ui)
- `src/lib/firebase/config.ts` (credentials)
- `public/fonts/`

## Firebase
- Project ID : `web2print-6fe5a`
- Config dans `.env.local` (gitignored) et `src/lib/firebase/config.ts`
