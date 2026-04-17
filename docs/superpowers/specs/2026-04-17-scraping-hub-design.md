# Scraping Hub — règles centralisées, prompts fournisseur, améliorations éditeur visuel

**Date** : 2026-04-17
**Statut** : Design validé, en attente de plan d'implémentation
**Contexte** : Évolution de `src/features/scraping-templates/` + `src/features/excel/ai-enrichment/`

---

## 1. Problème

Quatre manques dans le flux de scraping actuel :

1. **Aucune vue centralisée** des règles, conventions et requêtes exécutées. Les pièges connus (mass-click Puppeteer, cascade styles IDML, « jamais de parser par marque »…) vivent uniquement dans `MEMORY.md` ; les requêtes Jina et prompts LLM ne sont visibles qu'en console.
2. **Prompts uniquement au niveau template**. Un fournisseur qui a plusieurs templates (page produit, page listing) doit redéfinir les mêmes instructions dans chaque template. Pas de prompt « commun fournisseur ».
3. **Surbrillance éditeur limitée à un seul champ**. Dans le Visual Template Builder, on ne voit qu'un seul bloc surligné à la fois (celui dont le nom est cliqué dans la liste). Impossible de visualiser d'un coup d'œil tout ce qui est déjà tagué sur la page.
4. **Simple-clic capture = navigation bloquée**. Le clic est intercepté par le mode capture, ce qui empêche d'ouvrir accordéons / onglets du site avant de tagger leur contenu.

## 2. Objectif

- Ajouter un écran **Scraping Hub** (`/scraping-hub`) avec 3 onglets markdown-first : règles projet, fournisseurs & templates, debug Jina/LLM.
- Introduire un champ **`vendorPrompt`** au niveau du template, propagé automatiquement à tous les templates du même `vendorDomain`.
- Rendre la **surbrillance persistante et multiple** dans l'éditeur visuel : chaque field tagué est surligné en permanence avec son nom.
- Basculer la **capture sur double-clic** pour libérer le simple-clic (navigation native du site dans l'iframe).

## 3. Non-objectifs

- Pas de nouvelle entité Firestore « Fournisseur ». On étend le template existant (choix validé par l'utilisateur).
- Pas de migration des templates existants : `vendorPrompt` est optionnel.
- Pas de refonte de l'éditeur visuel : on modifie `overlayScript.ts` et `VisualTemplateBuilder.tsx` en place.
- Pas de changement du pipeline d'enrichissement LLM (`useProductEnrichment`) au-delà de l'injection des deux prompts.
- Pas de persistance backend du debug log : `localStorage` côté navigateur suffit.

## 4. Architecture

### 4.1 Nouvel écran `/scraping-hub`

```
src/features/scraping-hub/
├── ScrapingHubPage.tsx       # Page racine, gère les onglets
├── RulesTab.tsx              # Onglet 1 — Markdown rédactionnel éditable
├── VendorsTab.tsx            # Onglet 2 — Arbre fournisseurs → templates
├── DebugTab.tsx              # Onglet 3 — Dernières requêtes Jina + LLM
├── rulesStore.ts             # CRUD Firestore doc `scrapingRules/global`
└── debugLog.ts               # localStorage rolling buffer (30 entrées)
```

Route ajoutée dans `src/app/router.tsx` : `<Route path="/scraping-hub" element={<ScrapingHubPage />} />`.

Sidebar nav : nouveau lien **Scraping Hub** (icône `BookOpen` ou `ListFilter`).

### 4.2 Onglet 1 — Règles

- Document Firestore unique : `scrapingRules/global` avec `{ content: string, updatedAt: number, updatedBy: string }`.
- UI : split view 50/50 — éditeur `<textarea>` à gauche, rendu `react-markdown` (avec `remark-gfm` pour tables/checkboxes) à droite.
- Bouton « Sauver » explicite (pas d'autosave — risque d'écraser).
- Le contenu sert aussi de **contexte optionnel injecté au LLM** si l'utilisateur coche « Utiliser ces règles comme contexte système » (v2, pas dans cette livraison).

### 4.3 Onglet 2 — Fournisseurs & Templates

- Groupement en mémoire côté client : `templates.reduce((acc, t) => acc[t.vendorDomain].push(t), {})`.
- Affichage arbre :
  ```
  fr.milwaukeetool.eu (3 templates)
    📝 Prompt fournisseur [édition inline textarea]
    ├─ Milwaukee fiche produit (42 champs)
    ├─ Milwaukee page catégorie (8 champs)
    └─ Milwaukee accessoires (12 champs)
  nicoll.fr (1 template)
    ...
  ```
- Clic sur un template → ouvre `/scraping-templates?id=X` (éditeur existant inchangé).
- Édition du **prompt fournisseur** propagée par batch Firestore aux templates du même domaine (cf. §4.5).

### 4.4 Onglet 3 — Debug Jina/LLM

- `debugLog.ts` : `localStorage` key `scraping.debugLog` avec schéma :
  ```ts
  type DebugEntry = {
    id: string              // uuid
    timestamp: number
    kind: 'jina' | 'llm'
    url?: string            // pour jina
    method?: string         // GET/POST
    headers?: Record<string, string>
    body?: unknown          // payload pour llm
    response?: string       // tronqué à 50 Ko
    durationMs: number
    error?: string
  }
  ```
- Hook `useDebugLog()` : retourne les entrées, `appendDebugEntry(entry)` pour écrire.
- Capacité fixe 30 entrées (FIFO).
- UI : liste chronologique (plus récent en haut), expand/collapse chaque entrée, rendu markdown de la réponse Jina, coloration JSON pour le payload LLM.
- **Instrumentation** : wrapper `requestLogger.ts` qui décore `useJina.jinaRead()` et les appels LLM dans `useProductEnrichment.ts` — append automatique à chaque requête.

### 4.5 Extension du schéma `ScrapingTemplate`

Dans `src/features/scraping-templates/types.ts` :

```ts
export const scrapingTemplateSchema = z.object({
  // ... champs existants
  globalPrompt: z.string().optional(),   // (conservé, rôle = prompt template)
  vendorPrompt: z.string().optional(),   // NOUVEAU
  // ... reste
})
```

**Pas de rename** de `globalPrompt` — risque de migration inutile. On documente en commentaire Zod que `globalPrompt` = template-level, `vendorPrompt` = vendor-level.

### 4.6 Propagation `vendorPrompt`

Nouvelle fonction dans `templatesStore.ts` :

```ts
saveTemplateWithVendorSync(template: ScrapingTemplate): Promise<void>
```

Algorithme :
1. Lire les autres templates du même `vendorDomain` (query Firestore).
2. Si leur `vendorPrompt` diffère de `template.vendorPrompt` → batch update (Firestore `writeBatch`, jusqu'à 500 docs par batch).
3. Écrire le template principal en dernier pour garantir l'atomicité côté lecture.

**UI** : badge informatif dans `TemplateEditor.tsx` :
> ⓘ Ce prompt fournisseur sera appliqué à **3 autres templates** de `fr.milwaukeetool.eu`.

### 4.7 Injection prompts dans le LLM

Ordre fixe de composition du prompt dans `useProductEnrichment.ts` (et autres appelants LLM) :

```
[system de base]
[vendorPrompt si présent]
[globalPrompt si présent]
[markdown Jina + instructions extraction]
```

Pas de cache entre les deux prompts — on les concatène à chaque appel, avec séparateur `\n---\n`.

### 4.8 Surbrillance multi-blocs persistante

`src/features/scraping-templates/overlayScript.ts` :

- Remplacer `window.__pimPersistentNodes` (array unique) par `window.__pimPersistentTags: Array<{selector, label, color, nodes: Element[]}>`.
- Nouvelle action message :
  ```ts
  { type: 'pim-set-persistent-tags', tags: Array<{selector: string, label: string}> }
  ```
- `renderPersistentOverlays()` : dessine pour chaque tag :
  - Bordure + fond colorés (couleurs cycliques depuis une palette fixe, ex: 10 couleurs distinctes)
  - Label flottant positionné au coin haut-gauche du bloc (`position: absolute`, `z-index: 2147483644`)
- Repositionnement au scroll/resize déjà géré.
- Le `pim-preview-selector` (clic sur un field dans la liste) continue de fonctionner **en plus** : teinte plus vive pour le field actif.

`VisualTemplateBuilder.tsx` :
- Au chargement du template et à chaque modif des fields, envoyer à l'iframe :
  ```ts
  sendToIframe({ type: 'pim-set-persistent-tags', tags: template.fields.map(f => ({
    selector: f.strategies[0].expression,
    label: f.field,
  })) })
  ```
- Toolbar : bouton toggle « Afficher/Masquer surbrillance » (state local, envoie `pim-clear-preview` ou ré-envoie les tags).

### 4.9 Capture sur double-clic

`overlayScript.ts` :
- Supprimer la capture dans `onClick`. Garder `e.preventDefault()` uniquement si le clic navigue vers une ancre externe (cible `_blank` / domaine différent).
- Nouveau `onDblClick` : mêmes actions que l'ancien `onClick` (génération selectors + postMessage).
- Hover highlight inchangé (pour guider l'utilisateur).

`VisualTemplateBuilder.tsx` :
- Toolbar : renommer « Activer capture » → « Activer capture (double-clic) ».
- Modal de mappage : ajouter note en bas « Double-clic pour capturer · simple-clic = navigation ».

## 5. Données & migrations

- Aucune migration Firestore obligatoire. `vendorPrompt` est optionnel, défaut absent.
- Document `scrapingRules/global` créé au premier save (branche « create if not exists » dans `rulesStore.ts`).
- `localStorage` debugLog initialisé à vide au premier usage.

## 6. Points de vigilance

- **Batch Firestore `vendorPrompt`** : si un fournisseur a 100+ templates, chunker en lots de 500. Afficher un toast pendant la propagation.
- **Palette de couleurs overlay** : tester la lisibilité sur fond blanc (pages e-commerce) et sombre (pages produits tech). Utiliser une saturation modérée (~60%) + bordure franche pour rester visible.
- **Double-clic sur mobile** : pas un cas d'usage pour l'instant (éditeur desktop only) — mais noter que le fallback (`touchstart` long-press) serait une évolution future.
- **Taille localStorage** : 30 entrées × ~50 Ko max = ~1,5 Mo. Sous la limite 5 Mo navigateur.
- **`react-markdown` + `remark-gfm`** : +40 Ko gzipped. Acceptable vs gain de lecture de la doc.

## 7. Plan de livraison

| Étape | Fichiers | Risque |
|-------|----------|--------|
| 1. Schéma + prop `vendorPrompt` | `types.ts`, `TemplateEditor.tsx` | Faible |
| 2. Propagation Firestore | `templatesStore.ts` | Moyen (batch writes) |
| 3. Injection prompts LLM | `useProductEnrichment.ts`, sites d'appel | Faible |
| 4. `debugLog.ts` + `requestLogger.ts` | Nouveaux + hooks `useJina.ts` | Faible |
| 5. Route + page hub + 3 onglets | Nouveaux `scraping-hub/*` | Moyen |
| 6. Overlay multi-blocs | `overlayScript.ts`, `VisualTemplateBuilder.tsx` | Moyen (tests cross-site) |
| 7. Capture double-clic | `overlayScript.ts`, libellé toolbar | Faible |

Chaque étape est indépendante (sauf 5 dépend de 1 pour afficher `vendorPrompt` dans l'arbre). Commit séparé par étape.

## 8. Validation

- Manuel : créer un template Milwaukee avec `vendorPrompt`, créer un 2e template même domaine, vérifier propagation.
- Manuel : ouvrir un template avec ≥ 5 fields, vérifier toutes surbrillances visibles + labels.
- Manuel : sur page à onglets, double-cliquer un élément dans un onglet fermé → ne capture pas ; simple-clic ouvre l'onglet ; double-clic dans l'onglet ouvert → capture.
- Manuel : enrichir un produit, ouvrir onglet Debug, voir requête Jina + prompt LLM listés.
- Pas de tests automatisés dans cette livraison (cohérent avec le reste du repo).
