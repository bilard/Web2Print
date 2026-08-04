---
name: build-check
description: Vérifier la santé du build (types, lint, tests, bundle, code mort)
allowed-tools: Read, Glob, Grep, Bash
---

# Vérification build

Vérifie la santé du projet Web2Print.

## Étapes

1. **Audit** : `npm run audit` — enchaîne types, lint, tests, code mort et
   dépendances circulaires, puis affiche les indicateurs de dette. Toutes les
   barrières sont à zéro : une seule qui saute est bloquante.
   (`npm run audit:fast` saute la détection de duplication, la plus lente.)
2. **Build Vite** : `npm run build`
3. **Taille des chunks** : analyser la sortie build pour repérer les chunks > 200Ko
4. **Dépendances** : `npm ls --depth=0` pour vérifier les versions

Pour cibler une seule vérification :
`npx tsc -b` · `npm run lint` · `npm run test:run` · `npm run dead` · `npm run cycles`

⚠️ `tsc --noEmit` seul ne vérifie RIEN (project references, `files: []` à la
racine). Toujours `tsc -b`.

## En cas d'erreur
- Lister toutes les erreurs trouvées
- Les classer par priorité (bloquant build > warning type > optimisation)
- Proposer les corrections
- Appliquer les fixes si confirmé

## Seuils d'alerte
- Chunk > 200Ko : signaler, proposer du code splitting
- Erreurs TS : toutes bloquantes, corriger immédiatement
- Warnings Vite : évaluer au cas par cas

Pour *traiter* la dette révélée par les indicateurs (fichiers obèses, `any`,
duplication), utiliser le skill `/clean`.
