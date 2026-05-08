# Workflow Orchestration Studio — Design

**Date** : 2026-05-08
**Statut** : Spec validée, en attente du plan d'implémentation
**Audience** : interne / power-users (pas d'exposition client final au MVP)

## 1. Objectif

DesignStudio possède 25 features puissantes mais isolées (imports IDML/SVG/CSV/PPTX, scraping, enrichissement IA, PIM, DAM, Nano Banana, Merge, Taxonomy, Brief, Export…). Il manque une couche d'**orchestration visuelle** permettant de chaîner ces briques en workflows reproductibles, à l'image de Make.com / n8n / Zapier.

Premier workflow cible : *"Import IDML → enrichissement scraping+AI → Save PIM → Export PPTX"* en un clic.

## 2. Approche retenue

**React Flow (`@xyflow/react`) + runtime client.** La même lib qu'utilise n8n pour son éditeur visuel. Stack alignée (React, TS, Zustand), zéro nouveau service, exécution live avec résultats visibles à chaque étape.

Approches écartées :
- **n8n self-hosted en iframe** : service séparé à maintenir, double identité utilisateur, look&feel hors charte.
- **Tout maison sans lib graphique** : 4–6 semaines pour égaler ce que xyflow donne en 2 jours.

## 3. Arborescence

```
src/features/workflows/
├── types.ts                    # WorkflowNode, Edge, NodeSpec, PortType, RunContext
├── registry/
│   ├── index.ts                # nodeRegistry: Record<NodeType, NodeSpec>
│   ├── importNodes.ts          # IDML, SVG, CSV/Excel, PPTX
│   ├── enrichmentNodes.ts      # Scraping + AI
│   ├── persistenceNodes.ts     # Save PIM, Save DAM
│   └── exportNodes.ts          # Export Excel, PPTX, PDF
├── runtime/
│   ├── executor.ts             # Topological exec async + AbortSignal + middleware chain
│   ├── runContext.ts           # State par node (status/logs/durée/output preview)
│   ├── ports.ts                # portTypeRegistry + validation typage edge
│   └── middleware/             # telemetry, retry, caching, audit (extensible)
├── editor/
│   ├── WorkflowEditor.tsx      # Page éditeur (React Flow canvas)
│   ├── NodePalette.tsx         # Sidebar gauche, drag&drop
│   ├── NodeConfigPanel.tsx     # Sidebar droite, formulaire config du node sélectionné
│   ├── RunPanel.tsx            # Panneau bas : Run ▶ + logs + previews intermédiaires
│   ├── configFields/           # Renderers déclaratifs (text/select/number/expression…)
│   └── nodes/
│       ├── BaseNode.tsx        # Composant React Flow générique (icône + ports + badge statut)
│       └── *.node.tsx          # Surcharges visuelles si besoin
├── persistence/
│   ├── workflow.store.ts       # Zustand : workflow courant + dirty + autosave debouncé
│   ├── workflowsApi.ts         # CRUD Firestore
│   └── migrations.ts           # migrate(wf, fromVersion, toVersion)
└── WorkflowsPage.tsx           # Liste workflows + bouton "Nouveau" + ouverture éditeur
```

Routes : `/workflows` (liste) et `/workflows/:id` (éditeur). Entrée ajoutée dans la nav principale.

## 4. Modèle de données

```ts
type PortType = string  // validé par portTypeRegistry, ouvert à l'extension

interface PortTypeSpec {
  type: PortType
  label: string
  validator: (value: unknown) => boolean
  Previewer: ComponentType<{ value: unknown }>      // rendu de l'output dans RunPanel
  converter?: (value: unknown, target: PortType) => unknown  // auto-cast optionnel
}

interface ConfigField {
  name: string
  kind: 'text' | 'select' | 'number' | 'checkbox' | 'textarea' | 'expression' | 'columnRef'
  label: string
  required?: boolean
  options?: { value: string; label: string }[]    // pour select
  default?: unknown
}

interface NodeSpec<C = unknown, I = unknown, O = unknown> {
  type: string                                    // identifiant unique, ex: 'import-idml'
  category: 'import' | 'enrichment' | 'persistence' | 'export' | 'utility'
  label: string
  description: string
  icon: LucideIcon
  inputs:  { name: string; type: PortType; required: boolean }[]
  outputs: { name: string; type: PortType }[]
  configSchema: ConfigField[]
  defaultConfig: C
  runtime: 'client' | 'server' | 'any'           // routage exécution (server = phase 2)
  run: (ctx: RunContext, config: C, inputs: I) => Promise<O>
  ConfigComponent?: ComponentType<{ config: C; onChange: (c: C) => void }>
}

interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  config: unknown
}

interface WorkflowEdge {
  id: string
  source: string         // nodeId
  sourceHandle: string   // portName
  target: string
  targetHandle: string
}

interface Workflow {
  id: string
  schemaVersion: number  // commence à 1
  name: string
  description: string
  ownerId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}
```

### Types de ports MVP

| `PortType`         | Donnée portée                            |
|--------------------|------------------------------------------|
| `file`             | `File` brut (upload utilisateur)         |
| `sheet`            | `Sheet` (type pivot tabulaire existant)  |
| `product[]`        | `Product[]`                              |
| `asset[]`          | `Asset[]` (DAM)                          |
| `pim-products`     | Résultat Save PIM                        |
| `export-result`    | `{ url, mime, filename }`                |

## 5. Runtime d'exécution

- Tri topologique du DAG. Exécution **séquentielle** au MVP, parallèle en phase 2.
- Chaque node :
  1. Résout ses inputs depuis les edges entrantes (clé `nodeId.portName`)
  2. Valide les types via `portTypeRegistry`
  3. Appelle `run(ctx, config, inputs)` avec un `AbortSignal`
  4. Stocke ses outputs et son status (`pending|running|success|error|skipped`)
  5. Met à jour le `RunContext` (Zustand) → l'UI réagit live (badges, previews)
- **Erreur** : branche aval marquée `skipped`, log dans RunPanel, exécution continue sur les branches indépendantes.
- **Cancellation** : bouton Stop ▣ → `AbortController.abort()` propagé à tous les nodes en cours.
- **Pas de retry auto** au MVP (manuel via "Run from here" sur un node).

### Middleware chain

```ts
type Middleware = (
  ctx: RunContext,
  node: WorkflowNode,
  next: () => Promise<void>
) => Promise<void>
```

Permet d'ajouter telemetry, retry policy, caching, throttling, audit log sans modifier le core. Branchements conditionnels et templating phase 2 implémentés comme middleware.

## 6. UI éditeur (dark mode `#0f0f0f` / surfaces `#1a1a1a` / accent `#6366f1`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [← Workflows]  [Nom du workflow]  [Save]  [▶ Run]  [Stop ▣]      │
├────────────┬───────────────────────────────────────┬─────────────┤
│ Palette    │                                       │  Config     │
│ ─────────  │                                       │  ─────────  │
│ ▾ Import   │   ┌─[IDML]──┐                         │  Node:      │
│   IDML     │   │  in: ●  │       ┌─[Enrich]──┐     │  Enrich     │
│   SVG      │   │  out:●──┼──────►│ in:  ●    │     │             │
│   CSV/XLSX │   └─────────┘       │ out: ●────┼──►  │  URL col:   │
│ ▾ Enrich   │                     └───────────┘     │  [...]      │
│ ▾ Save     │                                       │  Model:     │
│ ▾ Export   │                                       │  [opus-4-7] │
│            │                                       │             │
├────────────┴───────────────────────────────────────┴─────────────┤
│ ▶ Logs  │  ▾ Outputs intermédiaires (sheet preview, file blob…)  │
└──────────────────────────────────────────────────────────────────┘
```

- **Palette** : drag d'un type → drop sur canvas crée un node.
- **Canvas** : React Flow, `connectionMode=Strict`, validation des types à la connexion (rouge si incompatible).
- **Config panel** : form déclaratif depuis `configSchema` via `configFields/` renderers, auto-save dans le node.
- **Run panel** : log par node (timestamp, message, niveau), preview cliquable de l'output (table pour `sheet`, miniatures pour `asset[]`, lien blob pour `export-result`).

## 7. Persistance

- Firestore : `users/{uid}/workflows/{workflowId}` avec `nodes`, `edges`, `metadata`, `schemaVersion`.
- `workflow.store.ts` : workflow courant + flag `dirty` + autosave debouncé (mêmes patterns que `editor.store.ts`).
- Export/import JSON pour partage entre comptes.
- `migrations.ts` au load : `migrate(wf, fromVersion, currentVersion)`.

## 8. Catalogue MVP — 8 nodes

| Catégorie       | Node          | Inputs    | Outputs            | Config principale                          |
|-----------------|---------------|-----------|--------------------|--------------------------------------------|
| Import          | IDML          | `file`    | `sheet`            | mapping champs                             |
| Import          | SVG           | `file`    | `sheet`            | scale, dpi                                 |
| Import          | CSV/Excel     | `file`    | `sheet`            | delimiter, header row                      |
| Enrichissement  | Scraping+AI   | `sheet`   | `sheet` + `asset[]` | colonne URL, champs à enrichir, modèle LLM |
| Persistence     | Save PIM      | `sheet`   | `pim-products`     | collection cible, clé dedupe               |
| Persistence     | Save DAM      | `asset[]` | `asset[]`          | dossier DAM                                |
| Export          | Excel         | `sheet`   | `export-result`    | colonnes                                   |
| Export          | PPTX          | `sheet`   | `export-result`    | template                                   |

## 9. Intégration avec l'existant

Chaque `run()` est un **adaptateur fin** appelant le code déjà en place :

| Node           | Code réutilisé                                              |
|----------------|-------------------------------------------------------------|
| Import IDML    | parser de `features/idml/`                                  |
| Import SVG     | `features/svg/` + parser                                    |
| Import CSV/XLSX| logique d'`features/excel/`                                 |
| Enrichment     | core de `useProductEnrichment` extrait en fonction pure     |
| Save PIM       | actions de `pim.store.ts`                                   |
| Save DAM       | actions de `dam.store.ts`                                   |
| Export Excel   | `features/excel/`                                           |
| Export PPTX    | `features/pptx/`                                            |

**Coût refacto attendu** : extraire 3-4 hooks (`useProductEnrichment`, `useSaveEnrichedProduct`, etc.) en fonctions pures appelables hors React. Le reste est déjà du code agnostique.

## 10. Évolutivité (objectif first-class)

Le module est conçu pour absorber des évolutions sans refonte structurelle.

### Catalogue ouvert
Chaque node = 1 fichier `*.node.ts` qui s'auto-enregistre via `nodeRegistry.register(spec)`. Aucune référence en dur dans runtime/UI. Ajouter un node = 1 fichier sans toucher au core.

### Types de ports extensibles
`PortType` est une string validée par `portTypeRegistry`. Chaque type fournit : `validator`, `Previewer` (composant React rendant l'output), `converter?` (auto-cast `sheet`↔`product[]` par exemple).

### Config schema déclaratif
Union de types de champs (`text|select|number|checkbox|textarea|expression|columnRef|…`). Ajouter un type = 1 renderer dans `configFields/`. Échappatoire `NodeSpec.ConfigComponent` pour cas non couverts.

### Runtime avec middleware
`executor` chaîne de middleware `(ctx, node, next) => Promise`. Permet telemetry/retry/caching/audit/throttling/templating sans toucher le core.

### Persistance versionnée
`Workflow.schemaVersion: number` (commence à 1). `migrate(wf, fromVersion, toVersion)` chargé au load. Toute évolution breaking = bump + migration.

### Exécution serveur (phase 2)
`NodeSpec.runtime: 'client'|'server'|'any'`. Un futur `serverExecutor.ts` (Firebase Function) réutilise la même registry pour exécuter cron/webhook/jobs longs.

### Évolutions anticipées sans refonte

- **Nouveaux nodes** : Nano Banana, Merge, Taxonomy, Brief, Slack, Webhook, HTTP, Filter, Map, Reduce, GoogleDrive… → 1 fichier chacun
- **Nouveaux types de données** : `pdf`, `svg-doc`, `palette`, `taxonomy`, `brief` → 1 enregistrement dans `portTypeRegistry`
- **Branchements conditionnels** : nodes `If`/`Switch` qui muent les edges actives
- **Boucles `forEach`** : node spécial qui itère sur un input collection et exécute son sous-graphe
- **Templating `{{prevNode.output.field}}`** : middleware d'interpolation appliqué à `config` avant `run()`
- **Templates de workflows** : workflows JSON livrés en seed, importables
- **Permissions/partage** : champ `Workflow.sharedWith: uid[]` + règles Firestore
- **Triggers** : cron, file drop, webhook (nodes spéciaux + Firebase Functions)
- **Versioning workflows** : historique des révisions

## 11. Hors-périmètre MVP (notés pour phase 2)

- Triggers automatiques (cron, file drop, webhook) → nécessite Firebase Functions
- Branchements conditionnels (`If`/`Switch`)
- Boucles `forEach`
- Variables globales et templating dans la config
- Versioning des workflows
- Bibliothèque de templates de workflows
- Permissions partagées
- Exécution parallèle des branches indépendantes

## 12. Tests

- **Unit** : `executor.test.ts` (DAG simple, cycle détecté, erreur dans une branche, cancellation, types invalides)
- **Unit** : `migrations.test.ts` (workflow v1 → vN)
- **Unit** : un test par node avec inputs mockés et output attendu
- **Integration** : workflow IDML→Enrich→PIM→PPTX bout-en-bout avec fixtures

## 13. Estimation

- **Phase 1 — squelette + 4 catégories de nodes** : ~2 semaines
  - Semaine 1 : types, registry, runtime + middleware, éditeur React Flow basique, persistance + migrations
  - Semaine 2 : 8 nodes MVP + RunPanel + tests + intégration nav
- **Phase 2 — industrialisation** : selon priorités issues du retour utilisateur (triggers, conditions, boucles, templating, partage, exécution serveur)
