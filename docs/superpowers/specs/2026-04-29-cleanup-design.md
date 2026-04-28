---
title: Nettoyage complet du projet Web2Print
date: 2026-04-29
status: approved
---

# Nettoyage complet du projet

## Contexte

Le commit `549ab39` (chore: remove ai-design feature and cleanup project) a fait
un premier passage de nettoyage. Il reste vraisemblablement :

- des fichiers/exports orphelins (résidus AI design, expérimentations β1/Option C)
- des dépendances npm inutilisées (`imagetracerjs` mentionné en mémoire)
- des warnings lint et imports morts
- des fichiers > 150 lignes (convention CLAUDE.md)

## Scope

Quatre catégories, exécutées **séquentiellement** dans l'ordre de risque
croissant. Un commit par phase pour faciliter review et revert.

### Phase 0 — Audit (read-only)

Outils :

- `npx knip` — fichiers + exports orphelins
- `npx depcheck` — dépendances npm inutilisées
- `npx eslint . --max-warnings 0` — bruit lint
- `find src -name '*.ts*' | xargs wc -l | sort -rn` — fichiers > 150 lignes

Sortie : rapport markdown en `docs/superpowers/specs/2026-04-29-cleanup-audit.md`.
Aucun changement de code en Phase 0.

### Phase A — Suppression code mort

- Fichiers / exports jamais importés (depuis le rapport knip)
- Imports inutilisés
- Variables inutilisées
- Blocs commentés > 5 lignes (sauf workarounds explicitement documentés)

**Vérifications** : `tsc --noEmit` + `npm test` doivent passer.

### Phase D — Dépendances

- Suppression des packages confirmés inutilisés
- Vérification manuelle de chaque suspect (chargements dynamiques, peer deps,
  scripts) avant suppression
- **Vérifications** : `npm install && npm run build` OK

### Phase B — Lint & types

- `eslint --fix` automatique
- Élimination des `any` implicites quand triviaux
- **Aucun changement de comportement**
- **Vérifications** : `npm test`

### Phase C — Refactor fichiers > 150 lignes

⚠️ Phase la plus risquée. Pour chaque fichier candidat :

1. Proposition de split au user **avant toute modification**
2. Validation à l'unité
3. Modification + vérif build/tests/smoke éditeur

Exclusions par défaut : Fabric/IDML/PPTX critiques sauf accord explicite.

## Garde-fous globaux

- `git status` clean entre chaque phase
- Si un test casse, **stop** + diagnostic avant de continuer
- Aucune modification :
  - `src/components/ui/**` (shadcn)
  - `src/lib/firebase/config.ts`
  - `public/fonts/`
  - (per CLAUDE.md)

## Hors scope

- Mise à jour des versions de packages (`npm outdated`)
- Réécriture de stores Zustand
- Changement de conventions de nommage existantes
- Modifications de logique métier
