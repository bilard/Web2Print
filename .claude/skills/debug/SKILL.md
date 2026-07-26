---
name: debug
description: Diagnostiquer et corriger un bug dans Web2Print
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Agent
---

# Diagnostiquer un bug

Bug signalé : $ARGUMENTS

## Processus de diagnostic

1. **Collecter le contexte** :
   - Vérifier les erreurs TypeScript : `npx tsc -b 2>&1 | head -50`
   - Vérifier que le build passe : `npm run build 2>&1 | tail -30`
   - Identifier les fichiers impliqués selon la description du bug

2. **Analyser** :
   - Lire les fichiers suspects en priorité
   - Tracer le flux de données : composant → hook → store → Fabric/Firebase
   - Vérifier les types et les interfaces
   - Chercher les patterns connus problématiques (listeners non nettoyés, refs stale, race conditions)

3. **Identifier la cause racine** :
   - Ne PAS proposer de fix sans comprendre la cause
   - Expliquer clairement pourquoi le bug se produit

4. **Corriger** :
   - Appliquer le fix minimal
   - Vérifier `npx tsc -b` puis `npm run test:run` après correction (un test de non-régression sur le bug est un plus)
   - Expliquer ce qui a été changé et pourquoi

## Points d'attention Web2Print
- Fabric.js v6 : events = `TPointerEventInfo<TPointerEvent>`, pas `{ e: MouseEvent }`
- `globalFabricCanvas` peut être null, toujours vérifier
- `syncToStore()` doit être appelé après toute modification d'objet Fabric
- Les listeners Fabric doivent être nettoyés dans le cleanup du useEffect
