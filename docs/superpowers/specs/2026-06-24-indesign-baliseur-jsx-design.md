# Phase 2 — Baliseur InDesign (ExtendScript .jsx)

> Conception — 2026-06-24
> Phase 2 du balisage XML natif : voir `2026-06-24-idml-xml-tagging-design.md` (Phase 1 livrée).

## Problème

La Phase 1 a livré la **lecture** des balises XML natives InDesign (`<XMLElement MarkupTag>`)
dans l'app. Mais poser ces balises à la main dans InDesign (panneau Balises + glisser-déposer
dans la Structure) est fastidieux. La Phase 2 fournit un **outil de balisage 1-clic** côté
InDesign, alimenté par la liste des champs d'une base de l'app.

## Décisions validées (brainstorming)

- **Source des champs** : un **fichier exporté par l'app** (synchro garantie avec les colonnes
  réelles), pas de saisie manuelle.
- **Format** : un **`.txt` dédié** (pas de JSON — ExtendScript ne le parse pas nativement),
  une ligne par champ `ecFieldName<TAB>label`.
- **Périmètre** : **chaîne complète** = export côté app **+** script `.jsx`.
- **Outil** : un **script ExtendScript `.jsx`** (un fichier, dossier *Scripts* d'InDesign, zéro
  signature/distribution), pas un plugin UXP (reporté).
- **UX** : une **palette ScriptUI persistante** (reste ouverte pendant le travail).

## Architecture

Deux livrables indépendants reliés par un fichier texte :

```
App (React) ──[export .txt]──>  fichier de champs  ──[charge]──>  Script .jsx (InDesign)
  buildFieldsListText                                              palette → markup(tag)
```

### Composant 1 — Export texte (app, testable)

- **`src/features/easycatalog/buildFieldsListExport.ts`** :
  - `buildFieldsListText(descriptors: EcFieldDescriptor[], sourceName: string): string`
  - Produit :
    ```
    # Web2Print — champs pour InDesign — base: <sourceName>
    Prix_TTC	Prix TTC
    Description	Description
    Image	Image
    ```
  - Une ligne par champ : `ecFieldName` + TAB + `label`. Les noms (`ecFieldName`) sont **déjà
    sanitisés** par l'app (`sanitizeEcName`) → le `.jsx` n'a **aucune** normalisation à refaire.
  - Le `label` peut contenir des caractères quelconques **sauf** TAB et newline : les
    neutraliser (remplacer TAB et retours par une espace) pour garder le format ligne robuste.
- **Bouton dans `EasyCatalogExportModal.tsx`** : « Liste de champs (InDesign .txt) » →
  télécharge `<base>-champs-indesign.txt`. Réutilise `buildEcFieldNames(sheet.columns)` +
  `buildFieldDescriptors(...)` déjà calculés dans la modal (aucun recalcul).

### Composant 2 — Script `.jsx` (palette ScriptUI)

- **`indesign-scripts/web2print-baliseur.jsx`** :
  - **Palette** flottante (`new Window('palette', …)`) — reste ouverte pendant le balisage.
  - **« Charger la liste… »** : `File.openDialog` → lit le `.txt` (UTF-8) → parse ligne par
    ligne (ignore lignes vides et `#`) → remplit une **listbox** (affiche `label`, retient
    `ecFieldName`).
  - **« Appliquer à la sélection »** (+ double-clic sur un item) :
    1. garde : un document ouvert (`app.documents.length > 0`) et une sélection
       (`app.selection.length > 0`) ;
    2. tag : `var tag = doc.xmlTags.itemByName(name); if (!tag.isValid) tag = doc.xmlTags.add(name);`
    3. application : `app.selection[0].markup(tag)` — l'API InDesign qui associe un **texte**
       (Text/Range/InsertionPoint) **ou** un **cadre/image** (PageItem/Rectangle) à un
       `XMLElement` portant ce tag, dans la structure XML du document.
  - **Statut** : zone de texte « Balise `Prix_TTC` appliquée » ou message d'erreur clair.
  - **Robustesse** : tout dans un `try/catch` avec message ; pas de dialogue bloquant en boucle.
- **`indesign-scripts/README.md`** : installation (déposer le `.jsx` dans le dossier *Scripts*
  d'InDesign, ouvrir Fenêtre > Utilitaires > Scripts, double-cliquer) + usage pas-à-pas +
  rappel du workflow complet (baliser → exporter IDML → importer dans l'app).

## Flux de données (bout en bout)

1. **App** : ouvrir une base → modal EasyCatalog → « Liste de champs (InDesign .txt) » →
   télécharge le `.txt`.
2. **InDesign** : Fenêtre > Utilitaires > Scripts → lancer `web2print-baliseur` → palette →
   « Charger la liste… » → sélectionner le `.txt` → la listbox se remplit.
3. Sélectionner du **texte** ou un **cadre/image** dans la maquette → cliquer le champ voulu →
   « Appliquer » → la balise est créée (si besoin) et posée.
4. Répéter pour chaque champ. Puis **Fichier > Exporter > IDML**.
5. **App** : importer l'IDML → les balises sont lues (Phase 1, déjà livrée).

## Gestion d'erreurs / cas limites

- **Aucun document ouvert** → « Ouvrez un document InDesign d'abord ».
- **Aucune sélection** → « Sélectionnez du texte ou un bloc à baliser ».
- **Sélection incompatible** (`markup` indisponible sur le type) → message clair, pas de crash.
- **Tag déjà présent** → réutilisé via `itemByName` (pas de doublon ni d'erreur).
- **Fichier de champs mal formé** → lignes vides / `#` / sans TAB tolérées (le `ecFieldName`
  seul suffit ; le label tombe sur le `ecFieldName` si absent).
- **Aucun fichier chargé** → bouton « Appliquer » inactif tant que la liste est vide.

## Tests

- **App** : `buildFieldsListExport.test.ts` (Vitest, pur) :
  - format : en-tête `#` + une ligne `ecFieldName<TAB>label` par champ ;
  - neutralisation des TAB/newline dans le `label` ;
  - liste vide → en-tête seul ;
  - `sourceName` injecté dans l'en-tête.
- **Script `.jsx`** : **pas de CI ExtendScript** (InDesign requis). Validation **manuelle**
  documentée (checklist dans le README) sur un mini-document : baliser un texte + un cadre
  image, exporter l'IDML, vérifier `XML/Tags.xml` + les `<XMLElement MarkupTag>`. Le plan
  fournira cette checklist comme critère d'acceptation.

## Hors périmètre (évolutions ultérieures)

- **Plugin UXP** (panneau permanent signé, distribution Adobe Exchange).
- **Auto-détection** des champs depuis le contenu (le maquettiste choisit manuellement).
- **Structure `Root > Article > champs`** posée automatiquement (groupes répétables) — la
  Phase 1 lit l'arbre mais le balisage manuel suffit pour la v1.
- **Lien direct app↔InDesign** (sans fichier intermédiaire).
