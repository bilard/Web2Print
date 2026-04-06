# IDML Re-Merge — Design Spec

## Objectif

Permettre un Data Merge fidèle en ré-injectant les données directement dans le XML IDML source, puis en re-parsant pour obtenir un canvas fidèle à InDesign. Deux livrables : preview temps réel dans l'éditeur et export IDML multi-pages (un spread par ligne de données).

## Contexte

Le Data Merge actuel substitue les `{{variables}}` dans Fabric.js, ce qui perd la fidélité typographique InDesign (tracking, crénage, césures, reflow). Le re-merge IDML résout ce problème en travaillant directement sur le XML source.

## Hypothèses

- Volume typique : 5-15 variables, 50-500 lignes de données
- Variables touchent : texte, images, couleurs/propriétés visuelles
- Réactivité navigation : <500ms par changement de ligne (spinner accepté)
- Export : un seul `.idml` multi-pages (un spread par ligne)

---

## Architecture

### Approche retenue : Re-parse complet par ligne

Pour chaque ligne de données :
1. Cloner le XML IDML en mémoire
2. Patcher les variables (texte, images, couleurs) dans le XML
3. Re-parser avec `parseIdml()` existant
4. Convertir avec `idmlToFabricObjects()` existant
5. Swapper les objets du canvas

Cache LRU (5 entrées) pour les lignes récemment visitées. Pré-fetch de la ligne suivante en background.

### Flux de données

```
IDML Source (globalIdmlSource)
  → Clone XML
    → idmlPatcher(xml, row, formulas, bindings)
      → XML patché (stories + spreads + images)
        → parseIdml() → IdmlDocument
          → idmlToFabricObjects() → FabricObject[]
            → Canvas preview (swap objets)
        → assembleMultiPageIdml() → ZIP export
```

---

## Section 1 : Patching XML IDML

Fonction pure : XML IDML brut + ligne de données → XML patché.

### Texte

Travail direct dans les fichiers `Stories/*.xml`. Pour chaque `<Content>` contenant `{{variable}}` :
- Remplacement du placeholder par la valeur résolue
- Préservation des `CharacterStyleRange` englobants (styles InDesign intacts)
- Si valeur vide et `hideLineIfEmpty` actif → suppression du `ParagraphStyleRange` entier

Les formules (`UPPER`, `LOWER`, `TRIM`, etc.) du merge store sont appliquées avant injection via `resolveText()` existant.

### Images

Éléments `<Image>` dont le lien est référencé par une variable :
- Valeur commence par `http` → téléchargement + injection dans le ZIP `Links/`
- Sinon → recherche dans les assets du projet (Storage `projects/{id}/links/`)
- Mise à jour du `<Link StorePath="...">` et `LinkResourceURI` dans le XML

### Couleurs (fill, stroke, opacity)

Pour les objets avec binding `fill` ou `stroke` :
- Création d'un swatch dans `Resources/Graphic.xml` (format `Color/Web2Print_{hex}`)
- Patch de l'attribut `FillColor` ou `StrokeColor` dans le spread XML
- Pour `opacity` : patch de `Transparency > Blending > Opacity`

---

## Section 2 : Preview canvas fidèle

### Flux de navigation

Quand l'utilisateur clique ▶/◀ dans le DataMergePanel :

1. Patch XML IDML avec ligne N
2. `parseIdml(patchedXml)` → IdmlDocument
3. `idmlToFabricObjects(idmlDoc)` → FabricObject[]
4. Swap objets canvas (remove anciens, add nouveaux)
5. Mise à jour `currentRowIndex` dans le store

### Swap canvas intelligent

On ne détruit pas le canvas Fabric.js. On remplace les objets :
- `canvas.remove()` tous les objets sauf `isGrid` et `isPageBg`
- `canvas.add()` les nouveaux objets issus du re-parse
- `canvas.requestRenderAll()`

Préserve le zoom/pan de l'utilisateur.

### Cache LRU (5 entrées)

```typescript
type CacheEntry = {
  rowIndex: number
  fabricObjects: FabricObject[]  // Objets prêts à injecter
  patchedXml: PatchedIdmlXml     // XML pour export
}
```

- **Hit cache** : swap instantané (<50ms)
- **Miss cache** : parse complet (~300-500ms), spinner affiché
- **Pré-fetch** : quand on affiche ligne N, on pré-parse N+1 en background (idle callback)

### Mode template (index = -1)

Canvas affiche le template original avec les `{{variables}}` visibles. XML IDML non patché, parsé une seule fois à la connexion.

### Édition en mode preview

Désactivée. Objets en lecture seule (`selectable: false`). Pour modifier le template, retour au mode template (index -1). Le re-parse écrase tout le canvas — autoriser l'édition serait confus.

### Images dynamiques

- Le patching XML injecte le fichier dans le ZIP mémoire
- Le parser le retrouve via `assemblyLoader`
- Cache des images téléchargées (Map URL → Blob) entre lignes

---

## Section 3 : Export IDML multi-pages

### Principe

Un spread par ligne de données, assemblés dans un seul ZIP IDML.

### Flux d'export

1. Pour chaque ligne (1..N) :
   - Patch XML avec ligne i
   - Stocker spread patché + stories patchées
2. Assembler le ZIP final :
   - Copier structure IDML de base (Graphic.xml, Styles.xml, Fonts.xml, etc.)
   - Injecter tous les spreads (`Spreads/Spread_row_N.xml`)
   - Injecter toutes les stories (dédupliquées si identiques)
   - Injecter toutes les images (dédupliquées par hash)
   - Mettre à jour `designmap.xml` pour référencer tous les spreads
3. Générer ZIP → téléchargement

### designmap.xml

Fichier index de l'IDML. Chaque spread ajouté :

```xml
<idPkg:Spread src="Spreads/Spread_row_1.xml"/>
<idPkg:Spread src="Spreads/Spread_row_2.xml"/>
<!-- ... -->
<idPkg:Spread src="Spreads/Spread_row_500.xml"/>
```

### Déduplication

- **Images** : même URL → un seul fichier dans `Links/`, référencé N fois
- **Stories identiques** : texte résolu identique → même fichier story
- **Couleurs** : swatchs mutualisés dans un seul `Graphic.xml`

### Unicité des Self IDs

Suffixe `_rowN` sur chaque ID pour éviter les collisions :
- `Self="u13b"` → `Self="u13b_row1"`
- Appliqué aux références croisées (`ParentStory`, `TextFrame Self`, etc.)
- Stories aussi suffixées : `Story Self="u156_row1"`

### Progression et annulation

- `cancelledRef.current` vérifié entre chaque ligne
- Barre de progression : `ligne 42 / 500`
- Estimation temps restant basée sur temps moyen par ligne

### Modale d'export

Option IDML ajoutée dans l'ExportModal existante :

```
Format : [PDF] [PPTX] [PNG] [IDML]
  → Si IDML sélectionné :
    Mode : IDML multi-pages (un spread par ligne)
    Lignes : Toutes | Plage (ex: 1-50)
    Nommage : pattern pour le fichier (ex: catalogue_{{client}}.idml)
```

Conditionné à `globalIdmlSource != null`.

---

## Section 4 : Intégration avec l'existant

### Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/features/merge/idmlPatcher.ts` | Fonction pure : XML IDML + ligne → XML patché |
| `src/features/merge/useIdmlMerge.ts` | Hook : navigation preview avec re-parse, cache LRU, pré-fetch |
| `src/features/merge/useIdmlBatchExport.ts` | Hook : export IDML multi-pages (itération, assembly ZIP, progression) |

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `DataMergePanel.tsx` | Détecter source IDML → basculer sur useIdmlMerge pour la navigation |
| `ExportModal.tsx` | Ajouter format "IDML" conditionné à `globalIdmlSource != null` |
| `mergeEngine.ts` | Extraire `resolveText()` / `applyFormulas()` pour réutilisation |
| `merge.store.ts` | Ajouter `mergeMode: 'fabric' \| 'idml'` |

### Aucune modification sur

- `idmlParser.ts`, `idmlToFabric.ts`, `idmlSource.ts`, `assemblyLoader.ts` — réutilisés tels quels

### Logique de bascule automatique

```
Connexion source de données :
  Si globalIdmlSource disponible (mémoire ou Storage) :
    → mergeMode = 'idml'
    → Navigation via useIdmlMerge
    → Export IDML disponible
  Sinon :
    → mergeMode = 'fabric'
    → Navigation via useDataMerge
    → Pas d'export IDML
```

Bascule automatique, pas de choix utilisateur. Badge discret dans le DataMergePanel : `IDML` ou `Fabric`.

### Coexistence des deux modes

Le mode `fabric` reste pour :
- Templates créés directement dans l'éditeur (sans import IDML)
- Projets dont le fichier IDML source a été perdu

---

## Section 5 : Gestion des erreurs et edge cases

### Variables manquantes

Variable `{{x}}` sans colonne correspondante :
- Preview : placeholder reste affiché
- Export : idem
- Alerte : badge warning dans le panneau

### Valeurs vides

- Texte : placeholder disparaît. `hideLineIfEmpty` → suppression ligne XML
- Image : pas de remplacement, image template reste
- Couleur : pas de remplacement, couleur template reste

### Images introuvables

- URL invalide/404 → image template conservée
- Log warning + compteur d'erreurs dans la progression
- Export ne s'arrête pas

### IDML source perdu

- `getIdmlBuffer()` retourne `null` → fallback `mergeMode = 'fabric'`
- Toast : "Source IDML indisponible, mode aperçu simplifié"

### Timeout re-parse

- Parse > 2s : spinner reste visible, pas d'interruption
- 3 lignes consécutives > 2s → toast suggérant de réduire la plage

### Mémoire (export 500 lignes)

- Spreads écrits dans le ZIP au fur et à mesure (streaming)
- Cache LRU vidé au début de l'export batch
- Images en cache partagé (pas dupliquées par ligne)

---

## Hors périmètre (YAGNI)

- Export d'un `.idml` par ligne (ZIP de fichiers individuels)
- Édition du canvas en mode preview merge
- Re-parse parallèle (Web Workers) — optimisation future si nécessaire
- Support IDML multi-spreads dans le template source (un spread = une page)
- Conversion InDesign → PDF côté serveur
