# Moteur de scraping générique multi-URL (Jina)

**Date** : 2026-04-14
**Statut** : Design validé, en attente de plan d'implémentation
**Contexte** : Évolution du moteur d'enrichissement IA produit (`src/features/excel/ai-enrichment/`)

---

## 1. Problème

Le scraping actuel via Jina récupère **une seule URL** par produit. Il fonctionne très bien pour les sites mono-page (Milwaukee, Nicoll), mais échoue à capturer la totalité des contenus produit sur les sites SPA à **onglets routés** ou à **pages liées multiples**.

**Cas de référence — Grundfos**

URL source : `https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?pumpsystemid=2848327458&tab=variant-curves`

Onglets exposés en UI mais accessibles via paramètre `?tab=` :
- Vue d'ensemble, Variantes, Description, Spécifications, Courbes, Pièces détachées, DAO, Schémas, Documentations

Le scraping actuel ne récupère que l'onglet présent dans l'URL fournie. Les autres restent invisibles.

## 2. Objectif

Concevoir un **moteur de scraping générique** (sans profils par site) capable de :

1. Charger les pages SPA avec rendu JS complet (récupère le DOM des accordéons cachés CSS)
2. Détecter automatiquement les **URLs liées** d'un même produit (onglets routés, sous-pages)
3. Récupérer les **PDFs liés** (datasheets, manuels, certifications)
4. Fusionner intelligemment toutes ces sources en un payload unique pour le LLM
5. **Préserver à 100% le comportement actuel** sur les sites déjà éprouvés (Milwaukee, Nicoll…)

## 3. Non-objectifs

- Pas de profils de scraping par site (`grundfos.ts`, `schneider.ts`…)
- Pas de backend Node/Playwright (rester full client + Jina)
- Pas de modification du flux LLM en aval (`generateJson`, schémas zod, post-processing)
- Pas de remise en cause des heuristiques de parsing markdown existantes (`mergeGroupsIntoAdvantages`, etc.)

## 4. Architecture

Le pipeline d'enrichissement passe de :

```
search → scrapeOne(url) → extractSpecs → LLM → enrichedProduct
```

à :

```
search → scrapeBundle(url) → mergeAll → extractSpecs → LLM → enrichedProduct
                  │
                  ├── pass1: Jina browser mode → htmlPrincipal
                  ├── pass2: discoverRelatedUrls(htmlPrincipal) → [tabs, pdfs, subpages]
                  └── pass3: scrape parallèle des liens (≤ N) → fusion markdown
```

### 4.1 Passe 1 — Scraping navigateur

Modification de `jinaScrapeMarkdown()` (`useProductEnrichment.ts:~645`) :

**Headers Jina ajoutés** :
- `X-Engine: browser` — rendu Chrome headless (les onglets cachés CSS sont dans le DOM)
- `X-Return-Format: html` — HTML brut (pour la passe 2 de découverte) **+** appel parallèle markdown classique pour le contenu lisible
- `X-With-Iframe: true`
- `X-With-Shadow-Dom: true`
- `X-Wait-For-Selector: body`
- `X-Timeout: 30`
- `X-With-Links-Summary: true` (déjà présent)

**Fallback** : si `X-Engine: browser` échoue/timeout → retombe sur `X-Engine: direct` (comportement actuel). Le résultat reste exploitable.

### 4.2 Passe 2 — Découverte d'URLs liées

Nouvelle fonction `discoverRelatedUrls(html: string, baseUrl: URL): RelatedUrls`.

Analyse le HTML rendu et retourne 3 buckets :

```ts
type RelatedUrls = {
  tabs: string[];      // même chemin, query/hash différent (tab, section, view…)
  pdfs: string[];      // tous les <a href*=".pdf">
  subpages: string[];  // même domaine, même slug racine, profondeur +1
};
```

**Heuristiques génériques** (aucun profil par site) :

- **Onglets routés** : tous les `<a>` ou `<button>` dont `href` ou `data-href` partage le `pathname` exact de `baseUrl` mais diffère par `search` ou `hash`. Critère renforcé : présence du parent dans un conteneur `[role="tablist"]`, `nav`, `[class*="tab"]`, `[class*="menu"]`.
- **PDFs** : `a[href]` se terminant par `.pdf` (case-insensitive), même domaine ou domaine de CDN documentaire (heuristique : URL contient `/documents/`, `/downloads/`, `/datasheet/`, `/pdf/`).
- **Sous-pages** : `a[href]` même domaine, `pathname` qui démarre par `dirname(baseUrl.pathname)` et profondeur ≤ +1. Filtrage exclusion : liens de navigation principale (header, footer, breadcrumb, menu burger), liens vers d'autres produits/catégories.

**Filtres anti-bruit** :
- Exclure les liens dont l'ancêtre est `<header>`, `<footer>`, `<nav role="navigation">` racine, `[class*="breadcrumb"]`, `[class*="sidebar"]`
- Exclure les liens utilitaires : `mailto:`, `tel:`, `javascript:`, `#` seul, `?lang=`, `?currency=`
- Dédupliquer par URL normalisée (tri params query, retrait fragments inutiles)

**Plafond** : max 8 URLs additionnelles scrapées par produit (configurable). Priorité : tabs > pdfs > subpages.

### 4.3 Passe 3 — Scraping parallèle et fusion

Nouvelle fonction `scrapeProductBundle(url: string): Promise<ScrapedBundle>`.

```ts
type ScrapedBundle = {
  primary: { url: string; markdown: string; html: string };
  tabs: Array<{ url: string; markdown: string; label?: string }>;
  pdfs: Array<{ url: string; markdown: string; filename: string }>;
  subpages: Array<{ url: string; markdown: string }>;
  mergedMarkdown: string;       // input final pour extractSpecs + LLM
  scrapeMethod: 'browser' | 'direct' | 'mixed';
  errors: Array<{ url: string; error: string }>;
};
```

**Stratégie de fusion** (`mergedMarkdown`) :
- Section par source avec en-tête `## [Source: <label ou URL>]`
- Déduplication par hash de paragraphes (évite la répétition des blocs nav/footer présents sur chaque onglet)
- PDFs en bloc final `## Documentations PDF` listant filename + premiers paragraphes

**Parallélisation** : `Promise.allSettled` sur toutes les URLs additionnelles. Échec partiel n'interrompt pas le bundle.

### 4.4 Cache

Extension du `ScrapeCache` existant dans `enrichmentStore.ts` :
- Clé : URL normalisée (pas seulement URL produit principale)
- Granularité par sous-URL → re-générer un produit ne re-scrape pas les PDFs déjà connus

### 4.5 Toggle de désactivation

Ajout dans `enrichmentStore.ts` :
```ts
multiUrlEnabled: boolean; // default true
setMultiUrlEnabled(v: boolean): void;
```

Si `false` → `scrapeProductBundle` court-circuite la passe 2/3 et se comporte exactement comme `jinaScrapeMarkdown` aujourd'hui. Filet de sécurité instantané si une régression apparaît.

## 5. Intégration dans le code existant

| Fichier | Modification |
|---|---|
| `useProductEnrichment.ts` | `jinaScrapeMarkdown()` : ajout headers browser + retour HTML. Nouvelle `discoverRelatedUrls()`. Nouvelle `scrapeProductBundle()`. Branchement dans le flux principal (remplace l'appel single par le bundle). |
| `enrichmentStore.ts` | `ScrapeCache` clé par URL normalisée. Ajout `multiUrlEnabled` toggle. `addLog` étendu pour tracer chaque URL scrapée. |
| `EnrichmentPanel.tsx` | Affichage de la liste des URLs scrapées (collapsible, dans le bloc logs). Toggle UI "Multi-URL" optionnel. |
| `types.ts` | Ajout `ScrapedBundle`, `RelatedUrls`. Pas de modification d'`EnrichedProduct` (le LLM reçoit toujours le même format en entrée). |

## 6. Garanties de non-régression

**Critère bloquant avant merge** : le `EnrichedProduct` JSON produit pour un panier de référence doit être **identique ou enrichi** (jamais dégradé) par rapport à l'état actuel.

**Panier de tests de régression** :
- 1 produit Milwaukee (référence éprouvée)
- 1 produit Nicoll (référence éprouvée)
- 1 produit Grundfos (cas cible — doit s'enrichir significativement)

**Procédure** :
1. Avant merge : exécuter l'enrichissement sur les 3 produits avec `git stash` (état actuel) → snapshot JSON
2. Appliquer la branche → ré-exécuter → snapshot JSON
3. Diff structurel : Milwaukee/Nicoll → keys identiques, valeurs identiques ou strictement enrichies. Grundfos → enrichissement net (specs, courbes, PDFs documentations).

**Mécanismes de sécurité runtime** :
- Toggle `multiUrlEnabled` pour kill-switch immédiat
- Fallback `X-Engine: direct` si le mode `browser` échoue
- Plafond 8 URLs additionnelles (évite explosion coût Jina)
- Timeouts par URL (30s) avec `Promise.allSettled` (échec partiel toléré)

## 7. Coût et performance

- **Avant** : 1 appel Jina Reader par produit
- **Après cas mono-page** (Milwaukee, Nicoll) : 1 appel (passe 2 ne trouve rien → identique)
- **Après cas multi-onglets** (Grundfos) : ~1 + 4-8 appels (onglets + 1-2 PDFs)
- **Latence** : passe 3 en parallèle → ajoute ~le temps du plus long appel (~3-5s typique)
- **Coût Jina** : multiplié par ~5 sur les sites complexes — acceptable vu le gain qualitatif. Le cache par URL amortit les re-générations.

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Sur-collecte de liens nav (footer, sidebar, autres produits) | Filtres anti-bruit stricts par ancêtres + plafond 8 URLs |
| `X-Engine: browser` plus lent ou indisponible | Fallback automatique sur `direct` |
| Coût Jina × N | Plafond URLs + cache par URL + toggle |
| Rupture sur sites éprouvés | Toggle kill-switch + tests de régression bloquants |
| HTML rendu massif (Mo) → parsing lent | Limite taille HTML 5 Mo, abandon discovery au-delà |
| Onglets routés non détectés (UI sans `?tab=` ni `#`) | Acceptable — ces sites resteront mono-page comme aujourd'hui (pas de régression) |

## 9. Hors scope (futurs travaux)

- Injection JS pour cliquer sur les accordéons purement client (sans changement d'URL)
- Profils de scraping fins par domaine si certains sites majeurs résistent
- OCR sur images de specs (datasheets scannés)
- Extraction structurée des PDFs (tables, courbes) au-delà du markdown
