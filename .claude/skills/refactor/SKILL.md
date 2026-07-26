---
name: refactor
description: Refactoring ciblé selon les conventions Web2Print
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Agent
---

# Refactoring

Refactoring demandé : $ARGUMENTS

## Règles

1. **Lire avant de modifier** : toujours lire le code existant en entier avant de proposer des changements
2. **Minimal et ciblé** : ne refactorer que ce qui est demandé, pas le code voisin
3. **Pas de régression** : vérifier `npx tsc -b` puis `npm run test:run` après chaque modification
4. **Préserver le comportement** : le refactoring ne change pas la fonctionnalité

## Patterns à appliquer
- Composant > 150 lignes → extraire sous-composants
- Logique métier dans un composant → extraire dans un hook `use<X>`
- Code dupliqué → extraire dans `src/lib/utils/` ou hook partagé
- Types inline → extraire dans `src/types/`
- Store trop gros → découper par domaine

## Ne PAS faire
- Ajouter des abstractions pour un seul usage
- Ajouter des commentaires/docs non demandés
- Modifier `src/components/ui/**` (shadcn)
- Renommer pour le plaisir de renommer
