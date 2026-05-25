# Design — Telegram entrant, étape 2b : génération de workflow par IA

> Date : 2026-05-25
> Statut : validé (« fait au mieux »), implémentation directe
> Périmètre : étape **2b** de la Phase 2 (Telegram → App). Suite de 2a.

## Contexte

2a (déployé + validé) achemine les messages Telegram jusqu'à un worker qui répond « reçu ».
Voir [[project_telegram_phased]]. 2b remplace cet accusé par une **génération de workflow** :
le worker passe le texte du message au générateur **Prompt-to-Flow** existant
(`src/features/workflows/promptToFlow/`), entièrement découplé de l'UI, sauvegarde le
workflow, et répond le résultat.

## Objectif (2b)

Tout message texte reçu → un workflow généré par IA, sauvegardé dans
`users/{uid}/workflows`, avec une réponse Telegram « ✅ Workflow "\<titre\>" généré — N node(s) ».
**Déclencheur** : tous les messages texte (choix utilisateur). Garde : un message qui ne
produit aucun node renvoie une erreur claire, sans sauvegarder de workflow vide.

## Architecture

```
message pending → worker claim → process(message) :
  generateWorkflow(texte)                      [LLM, découplé]
  → validateGraph → (1 réparation si erreurs) → layoutGraph
  → newWorkflow(uid) + saveWorkflow(uid, wf)
  → sendTelegramMessage(« ✅ Workflow "<titre>" généré — N node(s) »)
  → updateDoc(message, { generatedWorkflowId, generatedWorkflowName })
→ markDone   (sur erreur : réponse « ❌ Génération échouée : … » puis markError)
```

## Composants

1. **`src/features/telegram/generateWorkflowFromInbox.ts`** (nouveau) —
   `generateAndSaveWorkflow(text, uid): Promise<{ workflowId, name, nodeCount }>`. Orchestre le
   pipeline existant ; lève une `Error` si 0 node après réparation. Pur (testable en mockant
   `generateWorkflow`/`saveWorkflow`).
2. **`src/features/telegram/inboxWorker.ts`** (refactor) — `processInboxMessage` devient
   générique : `claim → deps.process(doc) → markDone/markError`. Le `process` (au lieu de
   l'ack figé) porte la logique métier. Prépare aussi 2c. `buildAckText` retiré (l'accusé
   « reçu » n'existe plus).
3. **`src/features/telegram/useTelegramInboxWorker.ts`** — `process` = `generateAndSaveWorkflow`
   (avec l'`uid` de session) puis réponse Telegram (succès ou échec). Sur échec : envoyer le
   message d'erreur Telegram puis relancer pour que `markError` enregistre la cause.
4. **`useTelegramInbox.ts` + `InboxItem.tsx`** — champ optionnel `generatedWorkflowName` sur le
   message, affiché sous le texte (« → workflow : \<titre\> »).

## Données

Le doc `telegramInbox/{updateId}` gagne deux champs optionnels après traitement :
`generatedWorkflowId: string`, `generatedWorkflowName: string`.

## Modèle IA / clé

`generateWorkflow` utilise le routage LLM existant (`workflow.generate` → Gemini puis fallback
Claude) et la clé API issue des settings de l'utilisateur. Le worker tournant dans la session
de l'utilisateur connecté, il y a accès. Clé absente → erreur explicite renvoyée sur Telegram.

## Gestion des erreurs

- LLM échoue / JSON invalide même après 1 réparation / 0 node → `error` + réponse
  « ❌ Génération échouée : \<raison\> ».
- Le `process` qui rejette déclenche `markError` (statut `error` + message, token masqué).

## Tests

- **`generateWorkflowFromInbox`** (mock `generateWorkflow`/`validateGraph`/`saveWorkflow`/
  `newWorkflow`) : succès → `saveWorkflow` appelé + `{ name, nodeCount }` ; réparation
  déclenchée si erreurs au 1er passage ; 0 node → lève une Error.
- **`inboxWorker`** (refactor) : `claim` gagné → `process` appelé → `markDone` ; `claim` perdu →
  `process` non appelé ; `process` rejette → `markError`.
- **Manuel** : écrire une vraie demande au bot → recevoir « ✅ Workflow … généré » et le
  retrouver dans le module Workflows.

## Hors périmètre 2b

L'**exécution** du workflow généré + retour du fichier produit = **2c** (avec la question de la
collision canvas). En 2b, le bot génère et sauvegarde ; l'utilisateur lance le workflow dans l'app.
