# Web2Print — Le Guide Complet

> Transformer une URL produit en catalogue imprimable, en 5 étapes.

---

## 1. La promesse en 30 secondes

Web2Print fait **une seule chose**, mais bout-en-bout :

> Prends N URLs produits → en sors un PDF/IDML/PPTX prêt à imprimer, sans Excel manuel, sans graphiste, sans copier-coller.

Le pitch en 3 angles :

| Angle | Avant Web2Print | Avec Web2Print |
|---|---|---|
| **Marketing produit** | 4h à copier-coller des fiches dans InDesign | 1 clic, le catalogue se construit seul |
| **Imprimeur / atelier** | Recevoir 200 références par mail, refaire la maquette | Recevoir un IDML déjà personnalisé par produit |
| **E-commerçant** | Exporter manuellement chaque page produit | Pipeline auto : URL → BDD → template → export |

La force : **un seul pipeline** scrape → enrichit → merge → exporte. Pas d'outil silo.

---

## 2. Le Wizard — 5 étapes, un exemple réel

> **Cas concret** : tu vends des caniveaux Nicoll. Tu veux un catalogue PDF de 50 références à donner à tes commerciaux. Voici comment.

### Étape 1 — Scraper les données

**Objectif** : récupérer les fiches produit depuis le site fournisseur, sans saisir une seule donnée à la main.

#### Choix du mode (3 options selon le contexte)

| Tu as… | Utilise | Route |
|---|---|---|
| Une page catégorie (liste de produits) | **Map + Extract** | Dashboard → PIM → Scraper le web |
| Une seule URL à découvrir + sa structure | **Scrape simple** | Idem |
| Un site entier à indexer (docs, blog) | **Crawl** | Idem |
| Un fournisseur récurrent (Nicoll, Milwaukee…) | **Template scraping** ⭐ | Dashboard → Templates scraping |

**Recommandation** : pour un fournisseur que tu vas scraper plus de 2 fois, **crée un Template**. C'est la voie royale :
- 0 hallucination (CSS selectors déterministes vs LLM)
- 0 token consommé
- Réutilisable sur des centaines d'URLs

#### Créer un template (path : `/scraping-templates`)

1. **Nouveau** → entre nom (`Nicoll`), domaine (`nicoll.fr`), pattern d'URL (`.*` ou plus restrictif)
2. **Charger une URL produit** → la page s'affiche en iframe
3. **Pointer & cliquer** : double-clique sur titre, prix, description, etc. → un sélecteur CSS s'auto-génère
4. Vérifie en bas : **« Tester sur une URL »** → score ≥ 20 = OK
5. **Enregistrer**

Le template vit dans Firestore et matche automatiquement les futures URLs `nicoll.fr` que tu importes.

#### Limites à connaître
- **Sites e-commerce protégés** (Darty, Boulanger, Mr-Bricolage…) : Jina utilise Chromium headless mais DataDome/Akamai peut quand même servir une page challenge. Vérifie le contenu scrapé (champ `content` ne doit pas être `Nope` ou vide).
- **Pages SPA** : dépend du `X-Wait-For-Selector` côté Jina — déjà tuné pour les patterns retail FR mais ajustable dans `useJina.ts`.

---

### Étape 2 — Structurer la BDD produits

**Objectif** : avoir un PIM léger qui sert de source de vérité pour le merge.

#### Trois façons d'alimenter une BDD

1. **Import Excel/CSV** (Dashboard → PIM → Importer un fichier)
   Formats : `.xlsx`, `.xls`, `.csv`, `.json`, Google Sheets (OAuth)
2. **Scraping direct** (Dashboard → PIM → Scraper le web → Map + Extract → Importer N lignes)
3. **Création vide** + ajout manuel ligne par ligne

#### Enrichissement IA par ligne

C'est la killer feature. Tu cliques sur une ligne → panneau « Enrichi par IA » à droite.

**Deux modes** :
- **Mode AUTO** (violet) : si la ligne a un `title` / `brand` / `ref` → recherche Google + LLM trouve l'URL puis extrait
- **Mode TEMPLATE** (vert) : si l'URL est connue ET un template matche le domaine → extraction déterministe via CSS selectors + LLM pour la synthèse rédactionnelle uniquement

**Astuce critique (récente)** : si ta ligne a **uniquement une URL** (colonne nommée `url`, `URL`, `product_url`, `fiche_url`…), le pipeline détecte la colonne, matche le template, et lance Mode TEMPLATE sans avoir besoin de title/brand. Workflow type : tu colles 1000 URLs Nicoll dans une feuille → un clic par ligne (ou batch) → BDD complète.

#### Champs structurés stockés
- Texte simple, nombre, booléen, date
- **Formules Excel** (évaluation native, types primitifs)
- **Spécifications** : `[{group, name, value}]` (ex: `[{group:"Dimensions", name:"Longueur", value:"100mm"}]`)
- **Documents** : liens PDF/vidéo
- **Variants** : tableau de variantes (ref, label, propriétés)
- **Images** : URLs ou Storage (DAM)

#### Taxonomies (classification)
Path : `/taxonomies`. Crée une hiérarchie (`Outillage > Électroportatif > Perceuses`) et assigne tes lignes pour filtrer/grouper.

---

### Étape 3 — Préparer le template graphique

**Objectif** : avoir une maquette éditable qui contient des **placeholders** que le merge va remplir.

#### Trois sources possibles

| Format | Provenance type | Parser | Fidélité |
|---|---|---|---|
| **IDML** | Export InDesign CC+ | `idmlParser.ts` + `idmlToFabric.ts` | Très haute (textes, formes, fonts, gradients, ombres) |
| **SVG** | Illustrator / Figma export / autre tool | `svgToFabric.ts` | Haute (textes en runs stylés, paths) |
| **Création vide** | Direct dans l'éditeur Fabric.js | — | Liberté totale, pas d'import |

#### Workflow type

1. **Dashboard → Bibliothèque → Nouveau document** (ou import IDML/SVG)
2. **Éditeur Fabric.js** s'ouvre (`/editor/:id`) :
   - Canvas WYSIWYG (drag, resize, rotate, edit text)
   - Panneau Layers (hiérarchie objets, lock/hide/rename)
   - Outils : texte, formes, images depuis DAM, formes vectorielles
3. **Ajouter des placeholders** dans tes textes : `{{title}}`, `{{price}}`, `{{description}}`
   → ces tokens seront remplacés par les valeurs de chaque ligne au merge
4. **Print marks** : option dans Export PDF — crop marks 4 coins, bleed configurable (en mm)

#### Limites connues
- Masters InDesign (pasteboard global) non supportés → utilise des artboards
- Fonts custom : si non installées localement → fallback (souvent Arial)
- Gradients radiaux/coniques → simplifiés en linéaires

---

### Étape 4 — Lier données et template (merge)

**Objectif** : produire **une variante du template par ligne** de la BDD.

#### Le panneau Data Merge (dans l'éditeur)

1. **Source** : sélectionne la BDD + la feuille
2. **Mapping** : pour chaque placeholder du template, choisis la colonne BDD correspondante
   - `{{title}}` → colonne `Titre`
   - `{{price}}` → colonne `Prix HT` (formule Excel évaluée live)
   - `{{image}}` → colonne `URL Image` (téléchargée et placée)
3. **Aperçu** : navigue ligne par ligne pour vérifier la cohérence
4. **Batch export** (étape 5)

#### Cas particuliers
- **Champ absent** : fallback texte vide (pas d'erreur bloquante)
- **Image** : URL → cache mémoire `Map<url, dataURL>` → placement Fabric
- **Image masking** : support `useImageMask.ts` pour clip à une forme du template

---

### Étape 5 — Exporter

**Objectif** : sortir un fichier livrable, en série si nécessaire.

#### Formats disponibles

| Format | Use case | Hook |
|---|---|---|
| **PDF** | Catalogue, BAT, fichier imprimeur | `useExportPdf.ts` |
| **IDML** | Retour à InDesign pour finalisation graphiste | `useExportIdml.ts` (65 KB de code) |
| **PPTX** | Présentation commerciale, démo client | `useExportPptx.ts` |
| **SVG** | Web, intégration site | `useExportSvg.ts` |
| **PNG** | Réseaux sociaux, miniatures | `useExportPng.ts` |

#### Single vs Batch
- **Single** : la maquette courante telle qu'éditée → 1 fichier
- **Batch** (avec data merge actif) : N variantes → ZIP (`useBatchExport.ts` ou `useIdmlBatchExport.ts`)
  Streaming progressif, abandon possible.

#### PDF : options imprimeur
- `withPrintMarks` : crop marks L aux 4 coins
- `bleed` (mm) : surimpression configurable
- DPI : conversion auto pour rasterisation

---

## 3. Personas et cas d'usage type

### Persona 1 — Le chef de produit / marketing manager
**Besoin** : catalogue trimestriel de 300 références, mise à jour rapide quand le tarif change.

**Workflow** :
- BDD Excel maintenue (prix, dispos, descriptions)
- Template IDML construit une fois par la graphiste interne
- Web2Print : `Excel + IDML → PDF batch` à chaque cycle
- **Gain** : passe de 3 jours d'intégration manuelle à 30 minutes de validation

### Persona 2 — L'imprimeur / atelier print-on-demand
**Besoin** : recevoir des commandes hétérogènes (cartes de visite, flyers, étiquettes) et livrer un fichier prêt à plaque.

**Workflow** :
- Le client uploade ses données (CSV)
- Web2Print sert de portail : import → template selectionné → preview → BAT PDF
- Validation client puis **export IDML** pour finition graphiste interne
- **Gain** : pas de re-saisie, pas d'erreur de prix/référence

### Persona 3 — L'e-commerçant multi-fournisseurs
**Besoin** : démarrer une nouvelle catégorie produits sans refaire 200 fiches à la main.

**Workflow** :
- Crée un Template scraping pour chaque fournisseur (3 templates pour 3 fournisseurs)
- Import CSV des 200 URLs ventilées par fournisseur
- BDD enrichie en mode TEMPLATE en batch (1 nuit)
- Export PPTX pour présenter le catalogue à son réseau de distribution
- **Gain** : passe d'un go-to-market de 3 mois à 2 semaines

### Persona 4 — La graphiste freelance
**Besoin** : décliner une mise en page validée sur 20 marchés/langues.

**Workflow** :
- Maquette IDML créée dans InDesign
- Importée dans Web2Print
- BDD = 20 lignes (1 par marché) avec colonnes `title_fr`, `title_en`, `title_es`…
- Mapping placeholders → colonne par langue
- Batch export IDML → 20 fichiers prêts à finalisation
- **Gain** : pas de duplication manuelle de calques, intégrité du design

---

## 4. Comment vendre Web2Print

### Argumentaire selon l'audience

#### Au directeur marketing
> « Combien de temps perdent vos chefs de produit à recopier des fiches dans InDesign chaque trimestre ? On industrialise ce flux. La donnée vit dans Web2Print, le design vit dans Web2Print, l'export sort à la demande — y compris pour vos imprimeurs si vous voulez qu'ils repartent du IDML. »

#### Au directeur achat / IT
> « C'est une stack standard : Firebase + React. Aucun lock-in propriétaire. Vous récupérez vos données en JSON, vos templates en IDML, vos exports en PDF/PPTX/SVG. Si demain vous changez d'outil, vous partez avec tout. »

#### Au DAF
> « Sur un cycle catalogue de 4×/an avec 200 produits, comptez 5 jours-homme/cycle d'intégration manuelle. Web2Print les ramène à 0,5 jour. ROI sur le premier trimestre. »

### Démo en 10 minutes (script)

1. **Minute 0-2** : montrer la BDD et l'enrichissement IA en mode TEMPLATE sur une URL Nicoll réelle → "regarde, en 30 secondes la fiche est complète"
2. **Minute 2-4** : ouvrir un template IDML existant (préparé) → "voilà la maquette, ces `{{title}}` `{{price}}` sont les variables"
3. **Minute 4-6** : ouvrir le panneau Data Merge → mapping → preview live ligne par ligne → "tu vois, à chaque clic on charge un produit différent dans la maquette"
4. **Minute 6-8** : Export PDF batch → 5 PDF générés en parallèle
5. **Minute 8-10** : Q&A sur le cas spécifique du prospect

### Objections fréquentes et réponses

| Objection | Réponse |
|---|---|
| « On a déjà InDesign » | Web2Print **ne remplace pas** InDesign, il l'industrialise. La graphiste continue dans InDesign, exporte en IDML, et le fichier devient un template alimenté par Web2Print. |
| « Et la qualité ? » | Le path IDML→Fabric→IDML préserve les fonts, gradients, transparence. La rasterisation PDF est en 2× pour la finesse. |
| « Notre fournisseur change son site » | Le template scraping prend 10 min à mettre à jour (sélecteurs CSS). Le pire cas : 2h. À comparer aux semaines de re-saisie sinon. |
| « C'est cher » | Compare au coût d'un graphiste interne ou d'une agence sur 4 cycles/an. ROI documenté en démo. |

---

## 5. Annexe technique

### Stack résumée
- **Front** : React 18 + Vite 5 + TypeScript strict
- **Canvas éditable** : Fabric.js v6
- **State** : Zustand v4 (par domaine) + React Query v5 (server state)
- **UI** : shadcn/ui + Tailwind v3, dark mode obligatoire
- **Imports** : `pdfjs-dist`, `pdf-lib`, `PptxGenJS`, parser IDML maison
- **Backend** : Firebase (Auth Google + Firestore + Storage)
- **Cloud Functions** : `extractBreadcrumb` (Puppeteer, region `europe-west1`) — contourne anti-bot pour breadcrumbs précis

### Dépendances API externes
| Service | Usage | Clé requise |
|---|---|---|
| **Jina** (`r.jina.ai`) | Reader (markdown) + Search | ✅ |
| **Anthropic Claude** | Enrichissement IA primaire (`claude-opus-4-7`) | ✅ |
| **Google Gemini** | Fallback IA + génération image (`gemini-3.1-pro-preview`) | ✅ |
| **Firebase** | Auth + Firestore + Storage | Config dans `.env.local` |

### Routes actives
```
/                     → redirect vers /dashboard
/login                → Google OAuth
/dashboard            → projets récents
/data                 → PIM (BDD + scraping)
/taxonomies           → classification
/editor/:id           → éditeur graphique + merge
/scraping-templates   → templates de scraping
```

### Conventions de code (CLAUDE.md)
- Composants : `PascalCase.tsx`, max 150 lignes
- Hooks : `useCamelCase.ts`
- Stores : `camelCase.store.ts` (un par domaine)
- Pas de logique métier dans l'UI
- Fabric.js v6 : imports ESM, events `TPointerEventInfo<TPointerEvent>`
- Firebase : accès uniquement via hooks de `features/`

### Limites connues à dire honnêtement
- ⚠️ **Sites e-commerce hostiles** (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer même via Chromium headless. Solution : créer un template par fournisseur sur une URL produit qui passe, puis batcher.
- ⚠️ **PPTX export** : infrastructure présente, round-trip PPTX→Fabric→PPTX à valider sur cas complexes
- ⚠️ **Masters InDesign** non supportés → utiliser des artboards
- ⚠️ **Fonts custom** : si non installées localement → fallback Arial
- ⚠️ **Gradients radiaux/coniques** : simplifiés en linéaires

### Prochaines évolutions logiques (priorisation)
1. **Template scraping pour Mr-Bricolage / Darty / Boulanger** : créer 3 templates de référence pour débloquer les 3 plus gros fournisseurs FR
2. **Round-trip PPTX complet** : valider sur un cas réel commercial
3. **Merge depuis URL list directement** : shortcut « 100 URLs → 100 PDFs » sans passer par BDD intermédiaire (workflow simplifié pour les power users)
4. **Connecteurs DAM stock** : intégrer Unsplash/Pexels pour les fiches produit sans image fournisseur

---

## 6. FAQ

**Q : Faut-il être graphiste pour utiliser Web2Print ?**
Non. Si tu importes un IDML déjà fait par un graphiste, tu n'as plus qu'à mapper les colonnes BDD aux placeholders. Le scraping et la BDD sont accessibles à n'importe quel chef de produit.

**Q : Combien d'URLs je peux scraper en batch ?**
Pas de limite côté Web2Print. Côté Jina, c'est selon ton plan (rate limit). En pratique : 1000 URLs en mode TEMPLATE = 30 min sans LLM, 2-3h avec synthèse LLM.

**Q : Mes données sont-elles sécurisées ?**
Oui. Firestore + Storage avec règles d'accès par utilisateur (auth Google). Aucune donnée n'est partagée avec d'autres tenants.

**Q : Puis-je connecter mon ERP / Shopify / WooCommerce ?**
Pas de connecteur natif aujourd'hui. Mais l'import JSON est ouvert : tout export ERP au format `{ sheets: [{ columns, rows }] }` est ingérable.

**Q : C'est multilingue ?**
L'interface est en français. Les données scrapées et les exports respectent la langue du contenu source. Pour faire du multilingue, mets une colonne par langue dans ta BDD.

**Q : Et si le site fournisseur change demain ?**
Tu mets à jour le template (10-30 min). Le pipeline reprend tel quel. C'est exactement pour ça que les templates sont déclaratifs (CSS selectors) et pas codés en dur.

---

## 7. Tu démarres maintenant

**Premier réflexe** : ne lis plus, fais. Voici le parcours conseillé pour le tout premier projet :

1. **`/scraping-templates`** → crée un template sur ton fournisseur principal (15 min)
2. **`/data`** → crée une BDD vide → colle 3 URLs de test → enrichis-les en mode TEMPLATE (5 min)
3. **`/dashboard`** → nouveau document → importe ton IDML existant ou crée un canvas vide (15 min)
4. **Ajoute 3 placeholders** dans le template (`{{title}}`, `{{price}}`, `{{description}}`)
5. **Data Merge** → mappe les 3 placeholders → preview → export PDF (5 min)

**Si tu y arrives en moins d'une heure**, tu as compris la philosophie. Le reste est de la mise à l'échelle : plus de fournisseurs, plus d'URLs, plus de templates, plus de formats d'export. Mais le pipeline reste le même.

**Bonne route.**
