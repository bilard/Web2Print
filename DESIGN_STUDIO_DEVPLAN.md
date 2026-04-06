# 🚀 DesignStudio — Plan de développement complet
## Prompts structurés pour Claude Code · Token-efficient · Professionnel

---

> **Règle d'or :** Ne jamais passer à l'étape N+1 sans avoir validé l'étape N.
> **Commande de démarrage :** `claude` dans le terminal du projet.

---

## 🗺️ Roadmap globale

```
PHASE 0   →  PHASE 1  →  PHASE 2  →  PHASE 3  →  PHASE 4  →  PHASE 5
Setup        Auth         Layout       Éditeur      Import       Export
(1x)         (1x)         (1x)         (6 étapes)   (4 étapes)   (3 étapes)
```

| Phase | Feature | Étapes | Complexité |
|-------|---------|--------|------------|
| 0 | Setup projet | 1 | ⭐ |
| 1 | Auth Firebase | 2 | ⭐⭐ |
| 2 | Layout UI | 3 | ⭐⭐ |
| 3 | Éditeur Canvas | 6 | ⭐⭐⭐⭐⭐ |
| 4 | Import PDF/IDML | 4 | ⭐⭐⭐⭐⭐ |
| 5 | Export | 3 | ⭐⭐⭐ |

---

## ═══ PHASE 0 — Setup ═══

### Prompt P0 — Initialisation projet

```
Initialise le projet DesignStudio avec la stack définie dans CLAUDE.md.

Crée UNIQUEMENT :
1. Projet Vite + React 18 + TypeScript strict
2. Installe : tailwindcss shadcn/ui fabric zustand @tanstack/react-query
   react-router-dom lucide-react sonner @dnd-kit/core
   firebase pdfjs-dist pdf-lib jszip opentype.js pptxgenjs
3. Configure tailwind.config.ts avec dark mode "class"
4. Initialise shadcn/ui (thème slate, dark)
5. Crée la structure de dossiers src/ exactement comme dans CLAUDE.md
6. Crée src/app/App.tsx avec un <h1>DesignStudio</h1> en dark mode

Hors scope : aucune logique métier, aucun composant fonctionnel.

Valide avec : `npm run build` sans erreur.
Confirme avec l'arbre src/ créé.
```

---

## ═══ PHASE 1 — Authentification Firebase ═══

### Prompt P1.1 — Config Firebase + Auth

```
@planner

Feature : Authentification Firebase

Besoin : 
- Login/logout Google OAuth
- État utilisateur global (Zustand)
- Route /login et protection des routes privées

Contraintes :
- Firebase v10 (modular API)
- Variables d'env VITE_FIREBASE_*
- Suivre @firebase

Hors scope : profil utilisateur, gestion des plans/quotas
```

**→ Valider le plan, puis :**

```
@coder

Implémente le plan validé pour l'auth Firebase.
Stack : @stack @firebase

Critères de validation :
- [ ] Login Google popup fonctionne
- [ ] État user persisté dans Zustand (useAuthStore)
- [ ] Route /login redirige vers /dashboard si déjà connecté
- [ ] Routes privées redirigent vers /login si non connecté
- [ ] Dark mode : bouton "Se connecter avec Google" visible
```

---

### Prompt P1.2 — Dashboard projets

```
## Étape 2/2 — Dashboard projets (liste + création)

Prérequis : P1.1 Auth ✅

@coder

Implémente UNIQUEMENT :
- src/features/projects/useProjects.ts : React Query, fetch Firestore collection
- src/features/projects/useCreateProject.ts : mutation création
- src/pages/DashboardPage.tsx : grille de cartes projets + bouton "Nouveau projet"
- src/components/shared/ProjectCard.tsx : carte projet (titre, thumbnail, date)

Stack : @stack @firebase

Hors scope : éditeur, upload assets, partage

Critères :
- [ ] Liste vide affiche un état "Aucun projet" avec CTA
- [ ] Clic "Nouveau projet" → crée dans Firestore + redirige /editor/:id
- [ ] Grille responsive 3 colonnes desktop / 1 colonne mobile
```

---

## ═══ PHASE 2 — Layout UI ═══

### Prompt P2.1 — Shell layout éditeur

```
## Étape 1/3 — Shell layout éditeur

Prérequis : Dashboard ✅

@planner

Feature : Layout complet de l'éditeur

Besoin :
- Header fixe en haut (logo, nom projet éditable, undo/redo, export, user avatar)
- Sidebar gauche fixe 64px d'icônes + panel extensible 280px
- Panel droit 300px (propriétés objet sélectionné, collapsible)
- Zone canvas centrale (100% espace restant)
- Footer barre d'état (zoom, dimensions, grille, snap)
- Bouton ⚙️ en bas de la sidebar gauche (paramètres)
- Mode dark obligatoire

Contraintes : shadcn/ui uniquement, Tailwind, pas de CSS externe

Hors scope : logique canvas, propriétés réelles des objets
```

**→ Valider le plan, puis :**

```
@coder

Implémente le layout shell.
Stack : @stack

Hors scope : toute logique fonctionnelle.
Le canvas = simple div grise pour l'instant.
Les panels = placeholders avec titres.

Critères :
- [ ] Layout stable sur 1440px et 1280px
- [ ] Sidebar gauche : icônes Layers/Type/Image/Shapes/Templates
- [ ] Panel droit : collapsible avec animation
- [ ] Footer affiche "Zoom: 100% | 1200 × 900"
- [ ] Dark mode cohérent (bg-background partout)
- [ ] Aucune erreur console
```

---

### Prompt P2.2 — Sidebar navigation

```
## Étape 2/3 — Sidebar gauche fonctionnelle

Prérequis : Shell layout ✅

@coder

Implémente UNIQUEMENT :
- src/components/panels/LeftSidebar.tsx :
  tabs Éléments | Textes | Images | Formes | Calques | Templates
- src/components/panels/ElementsPanel.tsx : formes basiques (rect, ellipse, ligne, texte)
- src/components/panels/LayersPanel.tsx : liste vide pour l'instant (structure)
- src/stores/ui.store.ts : état activeLeftPanel (string)

Stack : @stack

Critères :
- [ ] Tab actif visuellement distinct
- [ ] Panel s'ouvre/ferme au clic sur l'icône active (toggle)
- [ ] Animations fluides (transition 200ms)
- [ ] Bouton ⚙️ en bas → ouvre sheet "Paramètres" (contenu vide pour l'instant)
```

---

### Prompt P2.3 — Panel propriétés droit

```
## Étape 3/3 — Panel propriétés objet (structure)

Prérequis : Sidebar ✅

@coder

Implémente UNIQUEMENT la structure du panel droit.
PAS de connexion Fabric.js encore.

- src/components/panels/PropertiesPanel.tsx :
  sections Position (x, y, w, h), Apparence (fill, stroke, opacity),
  Texte (font, size, bold, italic, align), visible si objet sélectionné

- src/stores/editor.store.ts : selectedObjectId, canvasObjects[]

Stack : @stack

Critères :
- [ ] Panel affiche "Sélectionnez un objet" quand rien n'est sélectionné
- [ ] Inputs numériques avec flèches haut/bas
- [ ] Color picker shadcn pour fill/stroke
```

---

## ═══ PHASE 3 — Éditeur Canvas Fabric.js ═══

> **C'est la phase la plus complexe. Chaque étape est un commit.**

### Prompt P3.1 — Init Fabric.js

```
## Étape 1/6 — Initialisation Fabric.js

Prérequis : Layout complet ✅

@planner

Feature : Canvas Fabric.js dans la zone centrale

Besoin :
- Canvas Fabric.js qui remplit la zone centrale dynamiquement
- Resize automatique quand la fenêtre change
- Zoom in/out avec molette souris + boutons footer
- Pan avec espace + drag
- Grille visuelle optionnelle (toggle footer)
- Snap to grid (toggle footer)

Skill référence : @canvas
```

**→ Valider, puis :**

```
@coder

Implémente l'init Fabric.js.
Stack : @stack @canvas

- src/features/editor/useCanvas.ts : hook init + cleanup + resize
- src/features/editor/CanvasContainer.tsx : composant wrapper canvas
- src/features/editor/useZoom.ts : zoom molette + boutons

Critères :
- [ ] Canvas blanc centré dans la zone centrale
- [ ] Redimensionnement window → canvas se readapte sans bug
- [ ] Zoom 10%-400% avec indicateur footer
- [ ] Pan fluide espace+drag
- [ ] Console sans erreur Fabric
```

---

### Prompt P3.2 — Outils de création

```
## Étape 2/6 — Outils création d'objets

Prérequis : Canvas init ✅

@coder

Implémente UNIQUEMENT la création d'objets depuis la sidebar.
Stack : @stack @canvas

- src/features/editor/useAddObject.ts : fonctions addText / addRect / addEllipse / addImage
- src/features/editor/tools/ : un fichier par type d'objet
- Connecter à ElementsPanel : clic → ajoute objet centré sur canvas

Critères :
- [ ] Ajouter Texte → IText éditable double-clic
- [ ] Ajouter Rect/Ellipse → objet sélectionnable
- [ ] Sélection → bordure bleue Fabric standard
- [ ] Chaque objet a data: { id: uuid, type }
```

---

### Prompt P3.3 — Connexion panel propriétés

```
## Étape 3/6 — Propriétés objet en temps réel

Prérequis : Outils création ✅

@coder

Connecte le PropertiesPanel au canvas Fabric.js.
Stack : @stack @canvas

- src/features/editor/useSelectedObject.ts :
  écoute selection:created/cleared → met à jour editor.store
- Modifier PropertiesPanel : lire depuis store, appliquer via canvas
- Position x/y/w/h en temps réel
- Fill/stroke color avec aperçu live
- Opacity slider

Critères :
- [ ] Sélectionner objet → panel se peuple automatiquement
- [ ] Modifier position → objet bouge sur canvas
- [ ] Modifier color → objet change de couleur sans sélectionner à nouveau
- [ ] Désélectionner → panel affiche "Sélectionnez un objet"
```

---

### Prompt P3.4 — Calques et z-index

```
## Étape 4/6 — Panel calques

Prérequis : Propriétés ✅

@coder

Implémente UNIQUEMENT :
- src/features/editor/useLayers.ts : 
  liste des objets canvas synchronisée, up/down/delete
- Connecter LayersPanel : liste avec icône type + nom + visibilité
- Drag & drop pour réordonner (@dnd-kit)

Critères :
- [ ] Ajouter objet → apparaît dans calques
- [ ] Clic calque → sélectionne l'objet sur canvas
- [ ] Bouton trash → supprime objet + calque
- [ ] Toggle œil → masque/affiche objet
- [ ] Drag & drop → change z-order sur canvas
```

---

### Prompt P3.5 — Undo/Redo + sauvegarde auto

```
## Étape 5/6 — Historique undo/redo + auto-save Firebase

Prérequis : Calques ✅

@coder

Stack : @stack @canvas @firebase

- src/features/editor/useHistory.ts :
  stack de states JSON canvas, max 50 entrées
- src/features/editor/useAutoSave.ts :
  debounce 2s après object:modified → save Firestore
- Header : Ctrl+Z / Ctrl+Y fonctionnels

Critères :
- [ ] Undo annule dernière action (ajout, déplacement, style)
- [ ] Redo restaure
- [ ] Indicateur "Sauvegardé ✓" / "Sauvegarde..." dans header
- [ ] Rechargement page → canvas restauré depuis Firestore
```

---

### Prompt P3.6 — Texte riche + fonts

```
## Étape 6/6 — Texte riche + chargement fonts

Prérequis : Auto-save ✅

@coder

Stack : @stack @canvas

- src/features/editor/useTextEditor.ts :
  toolbar texte (gras, italic, align, size, color) visible quand IText sélectionné
- src/features/assets/useFonts.ts :
  chargement dynamique fonts depuis Storage Firebase (ou Google Fonts API)
- Dropdown font dans PropertiesPanel

Critères :
- [ ] Double-clic texte → mode édition + toolbar visible
- [ ] Toolbar modifie le texte sélectionné dans IText
- [ ] Changement font → appliqué immédiatement
- [ ] Min 10 fonts disponibles
```

---

## ═══ PHASE 4 — Import PDF & IDML ═══

### Prompt P4.1 — Import PDF → éléments éditables

```
## Étape 1/4 — Import PDF

Prérequis : Éditeur complet ✅

@planner

Feature : Import PDF avec extraction d'éléments éditables

Besoin :
- Upload PDF → parsing pdfjs-dist
- Chaque page → image de fond sur canvas + objets textes superposés
- Textes avec positions correctes, cliquables et éditables
- Multi-pages → créer autant de "pages" dans le projet

Skill référence : @pdf
Contrainte : pdfjs-dist worker en mode Vite (import ?url)

Hors scope : images extraites du PDF, gestion vectorielle
```

**→ Valider, puis :**

```
@coder

Implémente import PDF.
Stack : @stack @pdf @canvas

- src/features/pdf/usePdfImport.ts
- src/features/pdf/PdfImportModal.tsx : drop zone + progress
- src/features/pdf/pdfToCanvas.ts : transformation éléments → objets Fabric

Critères :
- [ ] Drag & drop PDF sur l'appli → modal d'import
- [ ] Progress bar pendant parsing
- [ ] Fond PDF affiché comme image non-éditable
- [ ] Textes du PDF superposés comme IText éditables
- [ ] Positions textes proches de l'original PDF (±5px)
```

---

### Prompt P4.2 — Upload Assembly InDesign

```
## Étape 2/4 — Upload Assembly InDesign (IDML + fonts + PDF)

Prérequis : Import PDF ✅

@planner

Feature : Import d'un "Assembly" InDesign complet

Besoin :
- Uploader un dossier contenant :
  MonDoc.idml + MonDoc.pdf + Document Fonts/*.otf/ttf
- Dézipper le IDML avec JSZip
- Charger les fonts du dossier Document Fonts
- Utiliser le PDF comme référence visuelle de validation

Skill référence : @idml

Note : utiliser input type="file" avec webkitdirectory
pour sélectionner tout le dossier
```

**→ Valider, puis :**

```
@idml-expert

Implémente l'upload et la détection de l'Assembly.
Stack : @stack @idml

- src/features/idml/useIdmlUpload.ts : détection fichiers (idml + pdf + fonts)
- src/features/idml/IdmlUploadModal.tsx : interface drag dossier
- src/features/idml/assemblyLoader.ts : chargement JSZip + fonts opentype.js

Critères :
- [ ] Drag dossier → détecte automatiquement .idml / .pdf / fonts
- [ ] Valide que les 3 composants sont présents
- [ ] Charge les fonts en mémoire (FontFace API)
- [ ] Affiche liste des fonts détectées
```

---

### Prompt P4.3 — Parser IDML → objets Fabric

```
## Étape 3/4 — Parsing IDML → canvas

Prérequis : Upload Assembly ✅

@idml-expert

Implémente le parser IDML complet.
Skill : @idml

- src/features/idml/idmlParser.ts :
  parse Spreads XML → liste IdmlObject[]
- src/features/idml/idmlToFabric.ts :
  convertit IdmlObject[] → fabric.Object[]
  TextFrame → fabric.IText (avec bonne font + taille + couleur)
  Rectangle/Oval → fabric.Rect / fabric.Ellipse
  PathGeometry → fabric.Path (SVG)
  Coordonnées : convertir pt → px, Y-flip

Critères :
- [ ] TextFrames positionnés comme dans le PDF de référence
- [ ] Couleurs CMYK converties correctement (comparer PDF)
- [ ] Rectangles et ellipses aux bonnes dimensions
- [ ] Formes complexes PathGeometry rendues en SVG
- [ ] Aucune perte d'élément vs PDF de référence
```

---

### Prompt P4.4 — Validation visuelle IDML

```
## Étape 4/4 — Mode comparaison IDML vs Canvas

Prérequis : Parser IDML ✅

@coder

Implémente UNIQUEMENT :
- src/features/idml/IdmlCompareView.tsx :
  split view : PDF de référence (gauche) | canvas résultat (droite)
- Slider pour ajuster la proportion
- Overlay toggle : superposer PDF à 30% d'opacité sur canvas pour validation

Stack : @stack

Critères :
- [ ] Split view fluide avec resize
- [ ] Overlay PDF visible/masquable
- [ ] Bouton "Valider import" ferme la vue et garde le canvas
```

---

## ═══ PHASE 5 — Export ═══

### Prompt P5.1 — Export PNG + PDF

```
## Étape 1/3 — Export PNG et PDF

Prérequis : Import fonctionnel ✅

@planner

Feature : Export PNG haute résolution et PDF

Besoin :
- PNG : canvas.toDataURL 2x (haute résolution)
- PDF : recréer le document avec pdf-lib depuis les objets Fabric
  (textes, images, formes basiques)
- Modal export avec options : format, résolution, page(s)

Skill référence : @pdf @canvas
```

**→ Valider, puis :**

```
@coder

Stack : @stack @pdf @canvas

- src/features/export/useExportPng.ts
- src/features/export/useExportPdf.ts
- src/features/export/ExportModal.tsx

Critères :
- [ ] Export PNG 72dpi et 300dpi (options)
- [ ] Export PDF page courante ou toutes les pages
- [ ] Progress pendant génération
- [ ] Téléchargement automatique
```

---

### Prompt P5.2 — Export PPTX

```
## Étape 2/3 — Export PowerPoint

Prérequis : Export PNG/PDF ✅

@coder

Stack : @stack

- src/features/export/useExportPptx.ts :
  PptxGenJS → une slide par page canvas
  Textes → pptx textBox avec font/size/color
  Images → pptx addImage (dataURL)
  Formes → pptx addShape

Critères :
- [ ] PPTX valide ouvrable dans PowerPoint/LibreOffice
- [ ] Textes conservent font et couleur
- [ ] Images intégrées (pas de liens externes)
- [ ] Dimensions slide = dimensions canvas
```

---

### Prompt P5.3 — Panel paramètres ⚙️

```
## Étape 3/3 — Panel paramètres complet

Prérequis : Export ✅

@coder

Implémente le panel ⚙️ (bas sidebar gauche).
Stack : @stack @firebase

Sections :
- Connexion : profil user Firebase, plan actif
- Connecteurs : liens vers intégrations (placeholder pour l'instant)
- Statistiques :
  src/features/stats/useUsageStats.ts :
  - Nb projets, nb assets, Storage utilisé (Firebase Storage API)
  - Exports réalisés ce mois
- Thème : toggle dark/light (optionnel)

Critères :
- [ ] Stats Firebase affichées en temps réel
- [ ] Taille Storage en MB avec barre de progression
- [ ] Section connecteurs affiche "Bientôt disponible"
- [ ] Logout accessible depuis ce panel
```

---

## 🔁 Templates de prompts récurrents

### Review après une étape

```
@reviewer

Review l'étape [X] — fichiers : [liste des chemins]
Focus : [TypeScript / perf Fabric / sécurité Firebase / accessibilité]
```

### Debug rapide

```
@debugger

Erreur : [coller erreur EXACTE]
Fichier : [chemin]
Contexte : [ce que tu faisais]
```

### Question Context7

```
use context7

Quelle est la syntaxe exacte de [API Fabric.js v6 / pdf-lib / Firebase v10]
pour [fonctionnalité précise] ?
```

### Refactoring ciblé

```
Refactore UNIQUEMENT [fichier].
Objectif : [lisibilité / perf / types]
Ne pas changer le comportement observable.
Montre le diff avant d'appliquer.
```

---

## 🧮 Économie de tokens — Règles projet

| ❌ Éviter | ✅ Faire |
|-----------|---------|
| "Fais l'import PDF" | Prompt P4.1 complet avec scope précis |
| Répéter la stack à chaque prompt | CLAUDE.md + @stack |
| "Ça marche pas" | @debugger + erreur exacte |
| Review + code en même temps | @coder puis @reviewer séparés |
| "Fais tout l'éditeur" | 6 étapes P3.1→P3.6 |
| Décrire Fabric.js à chaque fois | @canvas |

---

## 📋 Checklist de démarrage

```
□ CLAUDE.md à la racine du projet
□ .claude/skills/ (stack / canvas / pdf / idml / firebase)
□ .claude/agents/ (planner / coder / reviewer / debugger / idml-expert)
□ Variables Firebase dans .env.local
□ Projet Firebase créé (Firestore + Storage + Auth Google activé)
□ Phase 0 validée (npm run build ✅)
□ claude agents → liste les 5 agents
```
