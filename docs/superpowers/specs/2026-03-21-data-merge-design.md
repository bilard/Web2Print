# Data Merge Excel → Template Canvas — Design Spec

## Objectif

Permettre aux utilisateurs de lier un dataset Excel (stocké dans Firestore ou importé directement) aux objets du canvas pour générer des variantes en masse. Deux modes : prévisualisation interactive (navigation ligne par ligne) et export batch (PDF multi-pages, ZIP de fichiers individuels en PDF/PPTX/PNG).

## Stack & Dépendances

- React 18, Zustand, Fabric.js v6 (existants)
- `useExcelImport` / `excel.store` (existants — import et stockage Excel)
- `useExcelFirebase` (existant — persistance Excel vers Firestore collection `excel_data`)
- `useExportPdf`, `useExportPptx` (existants — export unitaire)
- `JSZip` (nouveau — génération ZIP pour export batch)
- `pdf-lib` (existant — PDF multi-pages)

### Données Excel dans Firestore

Les données Excel sont persistées dans la collection Firestore `excel_data` par le hook `useExcelFirebase`. Structure d'un document :

```typescript
// Collection: excel_data/{userId}_{docId}
{
  userId: string
  fileName: string
  sheets: ExcelSheet[]  // colonnes (name, type, values) + rows (Record<string, unknown>[])
  sheetCount: number
  totalRows: number
  totalColumns: number
  updatedAt: Timestamp
}
```

Le Data Merge lit directement ces documents — il n'a pas besoin de re-parser les fichiers Excel. Pour un import direct dans l'éditeur, on réutilise `useExcelImport` (parse) + `useExcelFirebase` (persistance) puis on connecte le nouveau document.

---

## Architecture

### Concepts clés

| Concept | Description | Stockage |
|---------|-------------|----------|
| **DataSource** | Référence vers un dataset Excel dans Firestore | `projects/{id}.dataSource: { excelDocId, sheetIndex }` |
| **Binding** | Liaison objet canvas ↔ colonne Excel | `FabricObject.data.bindings: Record<string, string>` |
| **TemplateText** | Texte original contenant `{{variables}}` | `FabricObject.data.templateText: string` |
| **MergeEngine** | Résout les bindings pour une ligne donnée | Fonction pure, pas de state |

### Flux de données

```
Excel (Firestore excel_data)
  → DataSource (référence dans le projet)
    → Bindings sur objets canvas
      → MergeEngine + ligne N
        → Canvas résolu (preview)
        → Export unitaire ou batch
```

---

## Binding : liaison données ↔ canvas

### Texte : syntaxe `{{variable}}`

- L'utilisateur tape `{{nom}}` ou `Bonjour {{nom}}, {{poste}}` dans un Textbox Fabric.js
- Le MergeEngine détecte les placeholders via regex `/\{\{(\w+)\}\}/g`
- Le texte original est sauvegardé dans `obj.data.templateText`
- Le texte affiché est le résultat résolu avec la ligne courante
- Quand on quitte le mode merge ou déconnecte la source, le texte template est restauré

**Cycle de vie de `templateText` :**
1. **Capture** : à la connexion d'une source de données, le MergeEngine scanne tous les Textbox du canvas. Si le texte contient au moins un `{{...}}`, il est copié dans `obj.data.templateText`.
2. **Édition en mode merge** : quand l'utilisateur double-clique un Textbox résolu, Fabric passe en mode édition. Un listener sur `text:changed` intercepte la modification et l'applique à `templateText` (pas au texte résolu). À la sortie du mode édition (`editing:exited`), le texte est re-résolu avec la ligne courante.
3. **Persistance** : `templateText` est dans `obj.data` — Fabric.js inclut `data` dans `toJSON()` si on déclare `data` dans les `propertiesToInclude` du `canvas.toJSON(['data'])`. Le canvas existant utilise déjà `toJSON(['data'])` (vérifié dans `useAutoSave`), donc les bindings et templates survivent à la sérialisation.
4. **Restauration** : à la déconnexion de la source, chaque Textbox avec `templateText` voit son texte Fabric remis à la valeur template (les `{{}}` réapparaissent).

### Propriétés : dropdown explicite

- Quand un objet est sélectionné et qu'une source est connectée, le panneau Données propose "Lier une propriété"
- Propriétés liables selon le type d'objet :
  - **Image** : `src` (source image)
  - **Tout objet** : `fill` (couleur CSS simple uniquement, pas de gradient), `stroke`, `opacity`
  - **Texte** : détection auto via `{{}}`, pas besoin de dropdown
- Stockage : `obj.data.bindings = { src: 'photo_url', fill: 'couleur_fond' }`

### Images dynamiques

- Si la valeur de la colonne commence par `http` → téléchargement URL
- Sinon → recherche par nom de fichier dans les assets du projet (`projects/{id}/links/`)
- Fallback : placeholder gris si image introuvable
- Cache des images déjà téléchargées pendant l'export batch

---

## UI : Panneau accordéon "Données"

### Emplacement

Nouveau panneau accordéon dans le `RightPanelStack`, ajouté à la liste `rightPanels` du UI store. Même mécanique que Calques, Images, Palette, etc. (CollapsiblePanel + @dnd-kit).

### États du panneau

**1. Aucune source connectée :**
- Message "Aucune source de données"
- Bouton "Connecter des données" → deux options :
  - Choisir un dataset existant (liste des `excel_data` Firestore de l'utilisateur)
  - Importer un fichier Excel/CSV (réutilise `useExcelImport`)

**2. Source connectée, mode template :**
- Header : nom du fichier + nombre de lignes
- Navigation : boutons ◀ ▶ + indicateur "Ligne N / Total"
- Prévisualisation temps réel : chaque changement de ligne résout les bindings et met à jour le canvas
- Liste des liaisons actives avec type (texte, image, fill) et statut
- Section "Lier une propriété" (visible quand un objet est sélectionné)
- Bouton "Exporter tout" → ouvre la modale d'export
- Bouton déconnecter (⚙️) pour retirer la source

### Interaction avec le canvas

- La navigation entre lignes met à jour le canvas en temps réel
- Les objets avec bindings sont visuellement identifiables (bordure ou badge subtil)
- Le texte template `{{nom}}` est remplacé par la valeur de la ligne courante pendant la preview
- L'édition du texte en mode merge édite le template (les `{{}}` restent)

---

## Export en masse

### Modale d'export

Déclenchée par le bouton "Exporter tout" du panneau Données.

**Options :**
- **Format** : PDF, PPTX, PNG (sélection unique)
- **Mode** :
  - PDF multi-pages : toutes les lignes dans un seul PDF (disponible uniquement si format = PDF)
  - ZIP de fichiers individuels : un fichier par ligne
- **Lignes** : Toutes ou plage personnalisée (ex: 1-50)
- **Nommage** : pattern avec variables, ex: `carte_{{nom}}_{{poste}}` → `carte_Dupont_Designer.pdf`

### Moteur d'export

- Itération séquentielle sur les lignes sélectionnées (pas de parallélisme — Fabric.js single-canvas)
- Pour chaque ligne :
  1. MergeEngine résout les bindings sur le canvas
  2. Reset viewport transform (même logique que les exports existants)
  3. Capture via `canvas.toDataURL()` (PNG) ou génération PDF/PPTX
- **PDF multi-pages** : ajoute une page par ligne dans le même `PDFDocument` (pdf-lib)
- **ZIP** : `JSZip` regroupe les fichiers individuels, téléchargement `.zip`
- Cache des images URL pour éviter les téléchargements répétés
- Barre de progression avec annulation : un `React.useRef<boolean>` (`cancelledRef`) est vérifié entre chaque itération de ligne. Le bouton "Annuler" dans la modale met `cancelledRef.current = true`, et la boucle s'interrompt au prochain check (pas d'interruption mid-render — on attend que la capture de la ligne courante finisse)
- Nommage des fichiers : les caractères invalides dans les valeurs de variables (`/`, `\`, `"`, etc.) sont remplacés par `_`

---

## Source de données

### Connexion

- **Dataset existant** : liste les documents `excel_data` de l'utilisateur depuis Firestore, affiche nom + nombre de lignes + colonnes
- **Import direct** : upload Excel/CSV → réutilise `useExcelImport` (parse, détection types, stockage Firestore) → connecte automatiquement le nouveau dataset

### Stockage de la référence

Nouveau champ dans le document Firestore du projet :

```typescript
// Dans ProjectData (Firestore projects/{id})
dataSource?: {
  excelDocId: string    // ID du document excel_data
  sheetIndex: number    // Index de la feuille sélectionnée
}
```

Chargé au mount de l'éditeur avec le reste des données projet.

### Déconnexion

- Retire la référence `dataSource` du projet
- Restaure les textes template (remplace les valeurs résolues par les `{{variables}}`)
- Les bindings dans `obj.data.bindings` restent en place (réactivables si on reconnecte)

---

## Structure des fichiers

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `src/features/merge/mergeEngine.ts` | Résolution des bindings (fonction pure) |
| Créer | `src/stores/merge.store.ts` | Store Zustand : `currentRowIndex`, `dataSourceRef`, `isConnected` |
| Créer | `src/features/merge/useDataMerge.ts` | Hook principal : connexion source, navigation lignes, résolution canvas |
| Créer | `src/features/merge/useBatchExport.ts` | Hook d'export batch (itération + génération) |
| Créer | `src/features/merge/DataMergePanel.tsx` | Panneau accordéon UI (source, navigation, bindings) |
| Créer | `src/features/merge/ExportModal.tsx` | Modale de configuration export batch |
| Créer | `src/features/merge/DataSourcePicker.tsx` | Sélecteur de source (existant ou import) |
| Modifier | `src/stores/ui.store.ts` | Ajouter panneau "data" dans `rightPanels` |
| Modifier | `src/components/panels/RightPanelStack.tsx` | Enregistrer le panneau DataMergePanel |
| Modifier | `src/features/editor/useAutoSave.ts` | Sauvegarder `dataSource` dans le document projet Firestore |
| Modifier | `src/features/editor/useLoadCanvas.ts` | Charger `dataSource` et restaurer la connexion au mount |
| Ajouter | `jszip` | Dépendance npm pour export ZIP |

---

## Hors périmètre (YAGNI)

- Filtrage avancé des lignes (tri, filtre par colonne) — la page `/data` le fait déjà
- Formules conditionnelles dans les bindings (if/else)
- Binding sur des propriétés de mise en page (position, taille, rotation)
- Multi-source (plusieurs Excel sur un même template)
- Édition des données Excel dans le panneau (lecture seule)
