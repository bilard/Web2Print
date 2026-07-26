---
name: review
description: Revue de code qualité, performance et sécurité
allowed-tools: Read, Glob, Grep, Bash, Agent
---

# Revue de code

Revue demandée : $ARGUMENTS

## Checklist de revue

### Architecture
- [ ] Logique métier séparée des composants UI
- [ ] Fabric.js encapsulé dans `features/editor/` uniquement
- [ ] Firebase accédé via hooks de `features/` uniquement
- [ ] Stores Zustand : un par domaine, pas de store fourre-tout
- [ ] Composants < 150 lignes

### TypeScript
- [ ] Pas de `any` ni `as any`
- [ ] Props et retours typés explicitement
- [ ] Interfaces/types dans `src/types/` si partagés

### Performance
- [ ] Pas de re-renders inutiles (memo, useMemo, useCallback si pertinent)
- [ ] Listeners Fabric.js nettoyés dans cleanup useEffect
- [ ] Pas de boucles synchrones lourdes bloquant le main thread
- [ ] Images/assets : lazy loading si applicable

### Sécurité
- [ ] Pas de credentials hardcodées
- [ ] Inputs utilisateur validés (Zod si formulaire)
- [ ] Pas d'injection XSS dans le rendu dynamique

### UX
- [ ] Dark mode respecté (pas de couleurs hardcodées claires)
- [ ] Feedback utilisateur (toasts Sonner, loading states)
- [ ] Accessibilité basique (aria-labels, focus management)

Lancer `npx tsc -b`, `npm run lint`, `npm run test:run` et `npm run build` pour validation finale.
