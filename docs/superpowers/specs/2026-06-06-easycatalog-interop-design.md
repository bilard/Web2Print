# EasyCatalog ↔ Web2Print — Interopérabilité (design)

> Date : 2026-06-06
> Statut : moitié **DATA** spécifiée (prête à planifier) · moitié **DOCUMENT** gelée (en attente d'échantillons + test)

## 1. Contexte & objectif

EasyCatalog (65bit Software) est le plug-in InDesign de référence pour le publishing data-driven (catalogues, listes de prix). On veut deux ponts entre Web2Print et EasyCatalog :

1. **Import** : récupérer des maquettes/templates produits sous EasyCatalog (via IDML) comme templates éditables dans l'app, en reconnaissant les zones de champs.
2. **Export data** : sortir un workspace de données depuis l'app dans un format qu'EasyCatalog ingère directement.

L'intention globale est un **aller-retour** : Web2Print comme front web d'un workflow print piloté par EasyCatalog/InDesign.

## 2. Le verrou technique & sa résolution

Les liens de champs EasyCatalog (« field specifiers », crochets verts) sont stockés comme **données privées du plug-in** dans le document InDesign, pas dans le modèle natif. **L'export IDML ne préserve pas de façon fiable les données privées d'un plug-in tiers** → le texte des champs risque d'arriver dans Web2Print comme du texte statique (dernière valeur fusionnée).

**Résolution : ne pas dépendre de la préservation des données privées.** Le pont de retour est **Adopt Fields** — EasyCatalog ré-adopte des champs en faisant correspondre, par motif/regex, le **texte du document** à une **data source plate** (CSV/XLSX). Le levier qu'on contrôle est donc le **nommage des champs + une convention de texte reconnaissable**, pas la donnée privée.

Réf. : [EasyCatalog – 65bit](https://www.65bit.com/docs/easycatalog-documentation/easycatalog/) · [Convert XML tags ↔ EasyCatalog](https://www.65bit.com/docs/converting-xml-tags-easycatalog-tags/) · [Exporting custom fields to data source](https://www.65bit.com/docs/exporting-custom-fields-easycatalog-data-source/) · [Supported data sources](https://easycatalog.nousmedis.com/setting-up-your-data/2.-importing-your-data/supported-data-sources)

## 3. Définition honnête du « round-trip »

Un aller-retour **100 % automatique et sans perte n'est pas réaliste**. Forme atteignable :

> **Import** (récupération best-effort des zones de champs) → **édition + merge dans l'app** → **export IDML + data source** → **étape de ré-adoption dans EasyCatalog** (scriptable, mais action délibérée).

## 4. Architecture

Nouveau module **`src/features/easycatalog/`**, qui hébergera les deux moitiés. Il consomme le pivot existant `ExcelSheet` (`src/features/excel/types.ts`) — pas de nouvelle source de vérité. Conventions du repo respectées (hooks `useCamelCase.ts`, pas de logique métier dans l'UI, typage explicite).

```
src/features/easycatalog/
  ecFieldName.ts        # contrat de nommage : ExcelColumn → ecFieldName stable/unique
  ecExport.ts           # sérialisation CSV / XLSX / fields.json / images.csv (pur, testable)
  useEasyCatalogExport.ts  # hook : assemble le zip + déclenche le download
  EasyCatalogExportModal.tsx  # UI : choix délimiteur, clé, périmètre colonnes/lignes
  (différé) ecDataSourceFolder.ts  # dossier natif, reverse-engineeré sur échantillon
  (gelé)    ecIdmlImport.ts / ecIdmlExport.ts  # moitié document
```

## 5. Moitié DATA — spécifiée (livrable maintenant)

### 5.1 Contrat de nommage (`ecFieldName`)

Pièce maîtresse : **relie la moitié data et la moitié document**.

- Chaque `ExcelColumn` → un `ecFieldName` : identifiant **stable, unique, assaini** (alphanumérique + `_`, dérivé de `label`, collisions suffixées `_2`, `_3`…).
- Côté **data** : `ecFieldName` = en-tête de colonne du CSV/XLSX.
- Côté **document** (plus tard) : `ecFieldName` = texte/balise du champ dans l'IDML exporté.
- Adopt Fields fait correspondre les deux → le lien se reforme côté EasyCatalog.
- Fonction pure `buildEcFieldNames(columns: ExcelColumn[]): Map<colKey, ecFieldName>`, déterministe (testable).

### 5.2 Champ-clé

EasyCatalog exige un champ-clé unique pour re-synchroniser/adopter.

- Si la colonne `isPrimary` a des valeurs **uniques et non vides** → c'est la clé.
- Sinon → synthèse d'une colonne `_ec_key` (séquence stable basée sur `row._id`), placée en première position, signalée dans `fields.json`.

### 5.3 Export CSV

- Délimiteur **tab par défaut** (option **virgule**) — tab plus sûr vu les contenus FR riches en virgules.
- Encodage **UTF-8 + BOM**.
- Échappement : champs entre guillemets si délimiteur / `"` / retour-ligne présents ; `"` doublés.
- En-têtes = `ecFieldName`.
- Valeurs : sérialisation brute (pas de formatage devise/nombre — EasyCatalog applique ses propres Field Options).

### 5.4 Export XLSX

- Variante de l'`exportToXlsx` existant (`src/features/excel/useExcelImport.ts:100`) mais en-têtes = `ecFieldName` (pas `label`).
- Une feuille par `ExcelSheet` exporté (périmètre choisi dans l'UI).

### 5.5 Champs image

- Valeur de cellule actuelle = URL Firebase. EasyCatalog veut un **chemin/nom de fichier**.
- La colonne image émet le **nom de fichier** dérivé de l'URL (assaini, dédupliqué).
- Sidecar **`images.csv`** : `ecFieldName,row_key,url,filename` → permet de rapatrier les visuels dans un dossier image EasyCatalog (téléchargement manuel ou étape ultérieure).
- Pas de téléchargement/rezippage des binaires images dans cette itération (YAGNI ; gros volume Firebase). À réévaluer après retour terrain.

### 5.6 Sidecar `fields.json`

Mappe chaque colonne exportée :
```json
{ "ecFieldName": "prix_ttc", "sourceKey": "col_3", "label": "Prix TTC",
  "ecType": "numeric", "isKey": false }
```
- `ecType` : `numeric` (number / currency / percent / rating), `image` (image), sinon `alphanumeric`.
- Sert l'UX maintenant et le dossier natif différé.

### 5.7 Conditionnement

Tout dans un zip **`EasyCatalog_<source>.zip`** : `data.csv` (ou `.xlsx`), `fields.json`, `images.csv` (si champs image), `README.txt` (mode d'emploi : importer comme flat-file data source, désigner le champ-clé, Adopt Fields).

### 5.8 UI

`EasyCatalogExportModal` déclenché depuis le data workspace (à côté de l'export XLSX existant) :
- choix du/des onglet(s) à exporter,
- format (CSV tab / CSV virgule / XLSX),
- choix/aperçu du champ-clé,
- aperçu des `ecFieldName` (table colonne → nom EC, éditable si collision gênante).

## 6. Différé (gelé sur échantillon) — dossier data source natif

La config interne d'un dossier data source EasyCatalog est **propriétaire** ([FAQ 65bit](https://www.65bit.com/docs/easycatalog-documentation/easycatalog-faqs/)). Mais EasyCatalog **importe directement CSV/XLSX** et fabrique le dossier lui-même → le natif est un *nice-to-have*. À reverse-engineerer **sur un échantillon réel** (`ecDataSourceFolder.ts`), jamais à l'aveugle. CSV/XLSX couvre le besoin data du round-trip.

## 7. Moitié DOCUMENT — GELÉE (ne pas planifier avant levée de blocage)

Bloquée sur un test + deux échantillons à fournir par l'utilisateur.

**Test décisif (le SI)** : doc EasyCatalog → export IDML → réouverture de l'IDML → **les champs se mettent-ils encore à jour** contre la data source ? Répond oui/non à « le lien survit-il à l'IDML ». L'inspection XML dira seulement *comment*.

**Échantillons** :
1. un `.idml` exporté depuis un doc piloté EasyCatalog (avec **un champ image**),
2. un dossier data source natif EasyCatalog (pour 5.6 différé).

**Questions ouvertes (à trancher sur le factuel)** :
- Que contient réellement l'IDML : données privées EC ? structure XML InDesign (`<XMLElement>`) ? texte nu ?
- Stratégie d'import : si XML présent → mapping `<XMLElement>` → `{{ecFieldName}}` + `obj.data.bindings` (ton merge sait déjà consommer ça). Sinon → heuristique Adopt-like (regex sur le texte) côté import.
- Stratégie d'export document : émettre dans l'IDML (via ton `idmlExporter.ts` / `idmlPatcher.ts`) un texte de champ = `ecFieldName` reconnaissable par Adopt Fields, + livrer la data source de §5.

L'import existant (`src/features/idml/`) lit déjà spreads/stories/styles/anchored frames mais **aucune** notion de champ lié — c'est exactement le delta à concevoir une fois les échantillons en main.

## 8. Hors scope (YAGNI)

- Téléchargement/rezippage des binaires images (sidecar `images.csv` suffit pour l'instant).
- Dossier data source natif (différé sur échantillon).
- Toute la moitié document (gelée).
- Connecteur live / ODBC vers EasyCatalog.

## 9. Plan d'implémentation (moitié data uniquement)

1. `ecFieldName.ts` + tests (déterminisme, collisions, assainissement).
2. `ecExport.ts` : CSV (délimiteurs, échappement, BOM), XLSX, `fields.json`, `images.csv`, champ-clé + tests.
3. `useEasyCatalogExport.ts` : assemble le zip (JSZip déjà au projet), download.
4. `EasyCatalogExportModal.tsx` + point d'entrée dans le data workspace.
5. Vérif : `npx tsc -b`, `npm run lint`, `npm run test:run`.

## 10. Tests

- `ecFieldName` : labels dupliqués → suffixes ; caractères spéciaux/accents → assainis ; stabilité (même entrée → même sortie).
- `ecExport` CSV : échappement guillemets/retours-ligne/délimiteur ; BOM présent ; en-têtes = ecFieldName.
- Champ-clé : isPrimary unique → utilisée ; non-unique → `_ec_key` synthétisée.
- `fields.json` : mapping des types corrects.
- Champs image : filename dérivé, `images.csv` cohérent.
