# Prompt-to-Flow — Design

> Date : 2026-05-25
> Module : `src/features/workflows/promptToFlow/`
> Statut : validé (design), prêt pour plan d'implémentation

## 1. Objectif

Permettre à l'utilisateur de décrire en langage naturel ce qu'il veut accomplir, et générer
automatiquement un **workflow complet** (nodes + connexions + config best-effort) à partir du
registre de nodes existant (`nodeRegistry`, 28 nodes), agencé logiquement.

Décisions produit retenues :
- **Cible** : nouveau workflow vierge. On remplace le contenu du canvas courant ; si le canvas
  contient déjà des nodes, on demande **confirmation** avant d'écraser. Pas de création d'entité
  Workflow sauvegardée séparée.
- **Aperçu** : étape d'aperçu obligatoire (résumé + étapes + chaînage + warnings) avec bouton
  *Accepter* avant injection sur le canvas.
- **Remplissage** : structure + **config best-effort** — le LLM câble les nodes ET pré-remplit les
  configs déductibles du prompt (URLs, colonnes, prompt d'image, colonnes d'export, expressions…).

## 2. Approche retenue

**Génération en un coup + validation/réparation déterministe.** Le LLM renvoie le graphe complet en
un appel. On valide localement (types, ports, compatibilité, cycles), avec **au plus 1 appel de
réparation** si invalide. Le layout est calculé déterministiquement (aucune nouvelle dépendance).

Approches écartées : (B) deux étapes plan-puis-mapping — 2 appels systématiques, gain marginal pour
28 nodes ; (C) matching mots-clés → sous-flux pré-construits — rigide et contraire à la règle
« pas de dico keyword figé ».

## 3. Infrastructure réutilisée (existant)

| Brique | Fichier | Usage |
|---|---|---|
| LLM JSON structuré | `src/features/ai/llmRouter.ts` → `generateJson<T>({ task, prompt, schema, schemaForLLM, version })` | Génération + réparation |
| Catalogue de nodes | `src/features/workflows/registry/index.ts` → `nodeRegistry.list()` | Contexte du prompt |
| Compatibilité ports | `src/features/workflows/runtime/ports.ts` → `isCompatible(src, tgt)` | Validation des edges |
| Détection de cycle | `src/features/workflows/runtime/topo.ts` → `topoSort(nodes, edges)` | Validation du graphe |
| Store | `src/features/workflows/persistence/workflow.store.ts` → `setNodes`, `setEdges`, `patch` | Injection |
| Éditeur | `src/features/workflows/editor/WorkflowEditorPage.tsx` (React Flow) | Point d'entrée UI |

Manquant à construire : la fonction de génération LLM, la validation de graphe dédiée, le layout
auto (pas de dagre installé), et l'UI d'entrée (modal).

## 4. Flux global

```
Prompt → generateJson (catalogue 28 nodes en contexte)
       → { title, summary, nodes[], edges[] }
       → validateGraph (types, ports, compatibilité, cycle, inputs requis)
       → [si issues] 1 appel de réparation → re-validation
       → layoutGraph (couches gauche→droite)
       → Aperçu (résumé + étapes + warnings)
       → Accepter → [confirmation si canvas non-vide] → setNodes/setEdges/patch
```

## 5. Schéma de sortie du LLM

Le modèle ne génère **ni ids ni positions** (assignés côté client). Il utilise des refs locales.

```jsonc
{
  "title": "Enrichir un CSV et exporter en PPTX",
  "summary": "Charge un CSV, enrichit via URL, exporte en PPTX.",
  "nodes": [
    { "ref": "n1", "type": "upload",     "config": {} },
    { "ref": "n2", "type": "import-csv", "config": { "headerRow": true } },
    { "ref": "n3", "type": "enrichment", "config": { "urlColumn": "url", "fields": "prix,description" } },
    { "ref": "n4", "type": "export-pptx","config": { "titleColumn": "nom" } }
  ],
  "edges": [
    { "from": "n1", "fromPort": "file",  "to": "n2", "toPort": "file" },
    { "from": "n2", "fromPort": "sheet", "to": "n3", "toPort": "sheet" },
    { "from": "n3", "fromPort": "sheet", "to": "n4", "toPort": "sheet" }
  ]
}
```

- Validation Zod stricte sur la forme ; `type` doit exister dans `nodeRegistry`.
- `config` mergé **par-dessus** `spec.defaultConfig` (clés manquantes → valeur par défaut conservée).
  Pas de validation de type fine par champ de config (best-effort) ; on conserve les chaînes telles
  quelles, le node validera à l'exécution.

## 6. Fichiers à créer (`src/features/workflows/promptToFlow/`)

- **`buildRegistryContext.ts`** — sérialise `nodeRegistry.list()` en catalogue compact pour le prompt :
  pour chaque node `type`, `category`, `description`, `inputs` (`name:type`), `outputs` (`name:type`),
  et champs `configSchema` (`name:kind:label[:help]`). Sortie : chaîne markdown/JSON déterministe.
- **`generateWorkflow.ts`** — construit le prompt système (rôle : architecte de workflow data),
  injecte le catalogue, définit le schéma Zod + JSON de sortie, appelle `generateJson`, mappe
  `ref → id` généré, merge config. Expose `generateWorkflow(prompt, opts?) : Promise<GeneratedGraph>`.
- **`validateGraph.ts`** — `validateGraph(raw) : { nodes, edges, issues[] }` :
  - type de node connu (sinon node écarté + issue),
  - `fromPort` présent dans `outputs` du node source, `toPort` présent dans `inputs` du node cible,
  - `isCompatible(srcPort.type, tgtPort.type)` (sinon edge écartée + issue),
  - pas de cycle (`topoSort`, capture le throw → issue),
  - ports `required` des inputs sans edge entrante → issue (warning, non bloquant).
- **`layoutGraph.ts`** — `layoutGraph(nodes, edges) : Record<id, {x,y}>`. Longest-path layering :
  couche(node) = max(couche(préd)) + 1 ; `x = couche * 320`, `y = rangDansCouche * 160`.
- **`usePromptToFlow.ts`** — hook d'orchestration : états `idle | generating | preview | error`,
  `generate(prompt, model?)`, `apply()`, `reset()`. Tient le `GeneratedGraph` + `issues`.
- **`PromptToFlowModal.tsx`** — textarea + exemples cliquables, sélecteur de modèle optionnel,
  bouton Générer, loading, aperçu (titre, résumé, liste ordonnée des étapes + chaînage, warnings),
  boutons *Accepter* / *Annuler*. Dark mode (`#0f0f0f` / `#1a1a1a` / accent `#6366f1`), ≤ 150 lignes
  (extraire un sous-composant `PromptToFlowPreview.tsx` si dépassement).

## 7. Intégration

- **Header** de `WorkflowEditorPage.tsx` : bouton **« Générer (IA) »** (icône `Sparkles`) à côté de
  *Run* → ouvre `PromptToFlowModal`.
- **`llmRouter`** : nouveau `LLMTask` `'workflow.generate'`.
  - Routing : primaire **gemini-3.1-pro-preview** (JSON fiable + disponible), fallback **claude
    opus-4-7** (raisonnement de graphe). Température basse.
  - Sélecteur de modèle optionnel dans le modal via `forceProvider` (pattern déjà présent sur
    `scrape-url`).

## 8. Application (Accepter)

1. Si `store.nodes.length > 0` → confirmation « Remplacer le workflow courant ? ». Annulation → no-op.
2. Génération des ids : `n_${Date.now()}_${i}_${rand}` par node (map `ref → id`), `e_${src}_${srcPort}_${tgt}_${tgtPort}` par edge.
3. `setNodes(generatedNodes)` + `setEdges(generatedEdges)` + `patch({ name: title })`.
4. Fermer le modal ; le canvas affiche le graphe layouté.

## 9. Gestion d'erreurs

- Prompt vide → bouton Générer désactivé.
- LLM ne renvoie aucun node → message d'erreur dans le modal.
- Edges invalides → écartées et **signalées** dans l'aperçu (l'utilisateur peut Accepter quand même).
- Cycle détecté → 1 réparation ; si persistant → warning, Accepter possible (les edges fautives sont
  déjà écartées par la validation).
- Clé API manquante / quota → message clair (l'erreur `generateJson` est capturée et reformulée).
- Réparation plafonnée à **1 retry** (borne coût/latence).

## 10. Tests (unitaires, Vitest)

- `validateGraph` : type inconnu, port absent, ports incompatibles, cycle, input requis non connecté.
- `layoutGraph` : positions déterministes, couches correctes sur un graphe linéaire et un graphe en
  diamant.
- `buildRegistryContext` : snapshot du catalogue (détecte toute dérive du registre).
- `generateWorkflow` : `generateJson` mocké → vérifie mapping `ref → id`, merge config sur defaults,
  rejet d'un `type` inconnu.

## 11. Hors périmètre (YAGNI)

- Pas d'exécution automatique du workflow après génération (l'utilisateur lance *Run* lui-même).
- Pas de génération multi-workflow ni de versions/historique de prompts.
- Pas de connaissance des données réelles (colonnes d'un CSV non encore importé) : les configs sont
  déduites du prompt uniquement.
- Pas d'auto-layout générique réutilisable ailleurs (le layout vit dans le module).
