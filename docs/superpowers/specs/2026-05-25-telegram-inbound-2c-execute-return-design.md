# Design — Telegram entrant, étape 2c : exécution + retour du fichier

> Date : 2026-05-25
> Statut : validé (« fait au mieux » + choix onglet dédié + exécution auto)
> Périmètre : étape **2c** (finale) de la Phase 2. Suite de 2b.

## Contexte

2b génère + sauvegarde un workflow depuis un message. 2c **l'exécute** et renvoie le fichier
produit sur Telegram. Voir [[project_telegram_phased]]. Découverte de l'exploration : les
nodes n'utilisent pas `globalFabricCanvas` pendant `executeWorkflow` (rendus offscreen), donc
le vrai point de contention n'est pas le canvas mais le **store de run singleton**
`useRunContext` (un run à la fois par onglet).

## Décisions actées

- **Onglet worker dédié** : le worker passe d'`AuthProvider` (tous les onglets) à la **page
  Telegram** (`TelegramInboxView`). Le bot ne traite que lorsque cette page est ouverte. Tu
  travailles dans un autre onglet → store de run isolé, zéro collision.
- **Génération + exécution automatiques** : chaque message génère ET exécute le workflow, sans
  étape de confirmation.

## Architecture

```
page Telegram ouverte → worker actif (cet onglet)
message pending → [FILE SÉRIALISÉE tab-locale] → process(message) :
  1. generateAndSaveWorkflow(text, uid)            → { wf, name, nodeCount }   (2b)
  2. executeWorkflowAndCollect(wf)                 → { nodeCount, errorCount, file? }
        executeWorkflow(wf)  [moteur client, store de run de cet onglet]
        → lit useRunContext.nodeStates → 1er ExportResult { url, filename } (via findExportResult)
        → fetch(url) → Blob → URL.revokeObjectURL(url)
  3. file ? sendTelegramDocument(blob, caption)   sinon  sendTelegramMessage(résumé)
  → markDone (+ generatedWorkflowName)
```

## Point critique : sérialisation (anti-écrasement de run)

`executeWorkflow` écrit dans le **singleton** `useRunContext` (`startRun()` + `nodeStates`).
Le worker reçoit les `pending` via `onSnapshot.docChanges()` ; à l'ouverture de la page avec
N messages en file, N changements `added` arrivent dans le **même** snapshot. Un traitement
*fire-and-forget* lancerait N `executeWorkflow` en parallèle sur le même store → états écrasés,
mauvais fichier renvoyé. Le claim transactionnel ne protège pas (N `update_id` distincts).

**Obligation** : traiter les messages **séquentiellement**. Implémentation : une chaîne de
promesses tab-locale (`useRef<Promise<void>>`), chaque `change added` s'enchaîne via
`queue.current = queue.current.then(() => processInboxMessage(deps, data)).catch(log)`. Un seul
`executeWorkflow` à la fois.

## Composants

1. **`useTelegramInboxWorker.ts`** (modifié) — (a) sérialisation des `docChanges` (file de
   promesses) ; (b) `process` = générer → exécuter → répondre fichier/résumé.
2. **`AuthProvider.tsx`** (modifié) — retirer `useTelegramInboxWorker()`.
3. **`TelegramInboxView.tsx`** (modifié) — appeler `useTelegramInboxWorker()` (worker actif sur
   cette page) + badge « ● worker actif » reflétant l'état réel (`uid && botToken &&
   document.visibilityState === 'visible'`), sinon « ○ token manquant » / « ○ onglet en
   arrière-plan ».
4. **`generateWorkflowFromInbox.ts`** (modifié) — retourner aussi le `wf` complet
   (`{ workflow, name, nodeCount }`) pour l'enchaîner à l'exécution.
5. **`src/features/workflows/runtime/exportResult.ts`** (nouveau) — extraire `findExportResult`
   + type `ExportPayload` de `RunPanel.tsx` ; `RunPanel` importe désormais d'ici (pas de
   duplication).
6. **`src/features/telegram/executeWorkflowAndCollect.ts`** (nouveau) —
   `executeWorkflowAndCollect(wf): Promise<{ nodeCount; errorCount; firstError?; file? }>` :
   exécute, lit `useRunContext.getState().nodeStates`, récupère le 1er `ExportResult`,
   `fetch(url)` → Blob, `revokeObjectURL`. Testable (mock `executeWorkflow`/`useRunContext`/
   `fetch`).

## Réponses Telegram

- Succès avec fichier : `sendTelegramDocument(blob, filename)`, caption
  « ✅ "\<titre\>" — exécuté (N nodes) ».
- Succès sans fichier : « ✅ "\<titre\>" généré et exécuté — N nodes, aucun fichier produit ».
- **Génération OK mais exécution échouée** : le workflow **reste sauvegardé** (pas de rollback) ;
  réponse « ⚠️ "\<titre\>" généré mais exécution échouée : \<1ère erreur\> ».
- Génération échouée : « ❌ Génération échouée : … » (comme 2b).

## Gestion des erreurs

- `executeWorkflow` rejette → exécution échouée (message ⚠️ ci-dessus) ; `markError`.
- Aucun node en succès et ≥1 en erreur → exécution échouée.
- `fetch(url)` échoue → pas de fichier, on renvoie le résumé texte.
- Token jamais loggé (réutilise `maskToken`).

## Tests

- **`executeWorkflowAndCollect`** (mock `executeWorkflow`, `useRunContext.getState`, `fetch`,
  `findExportResult`) : node export en succès → `file` récupéré + `revokeObjectURL` appelé ;
  aucun export → `file` undefined ; node en erreur → `errorCount`/`firstError` renseignés.
- **`findExportResult`** (déplacé) : reconnaît `{ url, filename }`, ignore le reste.
- **Manuel** : « crée un workflow qui exporte un Excel des données X » au bot → recevoir le
  fichier .xlsx ; envoyer 3 messages d'un coup (page fermée puis rouverte) → 3 réponses
  cohérentes, traitées une par une (sérialisation).

## Hors périmètre

Timeout d'exécution, exécution 100% serveur sans onglet, multi-fichiers (1er export renvoyé),
parallélisme inter-messages (volontairement sérialisé).
