---
name: feature
description: Implémenter une nouvelle feature selon les conventions Web2Print
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Agent
---

# Implémenter une feature

Implémente la feature suivante : $ARGUMENTS

## Processus

1. **Analyse** : Identifie les fichiers existants concernés (stores, hooks, composants)
2. **Plan** : Propose un plan d'implémentation avant de coder, avec les fichiers à créer/modifier
3. **Implémentation** : Respecte strictement les conventions :
   - Fabric.js uniquement dans `src/features/editor/`
   - Firebase uniquement via hooks dans `src/features/`
   - Composants max 150 lignes, extraire en sous-composants si besoin
   - Dark mode obligatoire (#0f0f0f fond, #1a1a1a surfaces, #6366f1 accent)
   - TypeScript strict, pas de `any`
   - Store Zustand par domaine fonctionnel
4. **Vérification** : Lance `npx tsc -b` (types), `npm run lint` (eslint) et `npm run test:run` (tests)
5. **Résumé** : Liste les fichiers créés/modifiés et les points d'attention

## Structure attendue
- Hook : `src/features/<domain>/use<Feature>.ts`
- Composant : `src/components/<section>/<Feature>.tsx`
- Store (si besoin) : `src/stores/<domain>.store.ts`
- Types : `src/types/<domain>.ts`
