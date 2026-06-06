# EasyCatalog ↔ Web2Print — Interopérabilité (design)

> Date : 2026-06-06
> Statut : moitié **DATA** spécifiée · moitié **DOCUMENT** spécifiée (verrou levé par échantillon réel, voir §2 + §11)

## 1. Contexte & objectif

EasyCatalog (65bit Software) est le plug-in InDesign de référence pour le publishing data-driven (catalogues, listes de prix). On veut deux ponts entre Web2Print et EasyCatalog :

1. **Import** : récupérer des maquettes/templates produits sous EasyCatalog (via IDML) comme templates éditables dans l'app, en reconnaissant les zones de champs.
2. **Export data** : sortir un workspace de données depuis l'app dans un format qu'EasyCatalog ingère directement.

L'intention globale est un **aller-retour** : Web2Print comme front web d'un workflow print piloté par EasyCatalog/InDesign.

## 2. Le verrou supposé — et sa levée par l'échantillon réel

**Hypothèse initiale (prudente, finalement infirmée)** : les liens de champs EasyCatalog seraient stockés comme données privées du plug-in et perdus à l'export IDML → texte statique côté Web2Print. Plan de repli : **Adopt Fields** (ré-adoption par motif contre une data source plate).

**Constat empirique sur `IMPORTS/EasyCatalog/test-easycatalog.idml` (InDesign 2026, DOMVersion 21.4)** : EasyCatalog sérialise **tout son modèle** dans l'IDML via des **attributs custom préservés** par l'export. Le verrou n'existe pas dans ce cas. Voir le format complet en §11.

- Champs **texte** : paire de marqueurs `ECTagData="$ID/4 <champ>"` (début) / `ECTagData="$ID/5 <champ>"` (fin) autour d'un run, sur des `CharacterStyleRange` ; le marqueur lui-même est un `<Content>﻿</Content>` (U+FEFF invisible). Une 2ᵉ paire `$ID/2`/`$ID/3` porte la référence pleinement qualifiée (data source + workspace + clé d'enregistrement + champ).
- Champs **image** : `ECPageItemData="2 2 <champ>"` sur le `Rectangle` du cadre image.
- Structure de pagination : `ECPaginationContainerData`, `ECPaginationPageItemData`, `ECParentRelationships`, `ECChildRelationships`, `ECAppliedRuleSetsData`.

**Conséquence design** : import **déterministe** (pas d'heuristique) et round-trip **preserve-and-patch** (on conserve les attributs `EC*` verbatim, on ne patche que le contenu visible) → EasyCatalog reconnaît ses champs **nativement, sans Adopt Fields**.

**Réserves** : preuve sur **un** échantillon ; la survie peut dépendre de la version InDesign/EasyCatalog. Adopt Fields (§ repli) reste pertinent pour les documents **créés ex nihilo dans Web2Print** (pas d'attributs EC à préserver) → on émet alors un texte de champ reconnaissable + la data source.

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

## 7. Moitié DOCUMENT — spécifiée (verrou levé)

Delta par rapport à l'import IDML existant (`src/features/idml/`), qui lit déjà spreads/stories/styles/anchored frames mais **ignore** toute notion de champ. Format de référence en §11.

### 7.1 Import — détection des champs (déterministe)

- **Champs texte** : pendant le parse des stories (`idmlParser.ts:parseStory`), repérer les `CharacterStyleRange` portant `ECTagData`. Une paire `$ID/4 <champ>` … `$ID/5 <champ>` délimite un champ ; le run de contenu entre les deux est sa valeur courante. Émettre le placeholder `{{ecFieldName(<champ>)}}` dans le `templateText` du Textbox (mécanisme merge existant, cf. `useDataMerge`), en mappant `<champ>` → `ecFieldName` (même contrat qu'en §5.1).
- **Champs image** : sur un `Rectangle`/cadre portant `ECPageItemData="… <champ>"`, poser `obj.data.bindings.src = ecFieldName(<champ>)`.
- **Marqueurs** : les `<Content>﻿</Content>` (U+FEFF) sont des marqueurs invisibles → ne pas les rendre comme texte (filtrage U+FEFF).
- **Préservation** : conserver l'`ECTagData`/`ECPageItemData`/pagination d'origine dans `obj.data.ec` (verbatim) pour le round-trip. On **n'interprète pas** la pagination (`ECPaginationContainerData`, parent/child) — on la transporte.

### 7.2 Export — preserve-and-patch (round-trip natif)

- **Cas document importé d'EasyCatalog** (chemin d'or) : repartir du **buffer IDML d'origine** (`idmlSource.ts`, déjà conservé) ; ne patcher que le **contenu visible** des runs de champ (texte entre marqueurs `$ID/4`/`$ID/5`, lien des cadres image), en **laissant tous les attributs `EC*` intacts**. EasyCatalog rouvre et reconnaît ses champs sans Adopt Fields. S'appuie sur `idmlExporter.ts` / `idmlPatcher.ts` (patch ciblé déjà en place).
- **Cas document créé dans Web2Print** (repli) : pas d'attributs EC à préserver → émettre un texte de champ = `ecFieldName` reconnaissable, + livrer la data source de §5 → ré-adoption via **Adopt Fields** côté EasyCatalog.

### 7.3 Hors interprétation (transport seulement)

Le moteur de pagination EasyCatalog (regroupement record→champs, rule sets) n'est **pas** reproduit dans Web2Print. On édite des champs et on round-trip ; la re-pagination reste l'affaire d'EasyCatalog côté print.

## 8. Hors scope (YAGNI)

- Téléchargement/rezippage des binaires images (sidecar `images.csv` suffit pour l'instant).
- Dossier data source natif (différé : EasyCatalog ingère CSV/XLSX directement ; à reverse-engineerer seulement sur demande + échantillon de dossier).
- **Interprétation** du moteur de pagination EasyCatalog (on transporte les attributs, on ne les reproduit pas).
- Connecteur live / ODBC vers EasyCatalog.

## 9. Plan d'implémentation

Deux plans séquençables. Recommandation : **data d'abord** (autonome, faible risque, fournit le contrat `ecFieldName` que la moitié document réutilise), puis **document** (import détection champs → édition/merge → export preserve-and-patch, à valider sur `IMPORTS/EasyCatalog/test-easycatalog.idml`).

### 9.A Moitié data

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

## 11. Annexe — format EasyCatalog dans l'IDML (relevé sur `IMPORTS/EasyCatalog/test-easycatalog.idml`)

InDesign 2026, `idPkg DOMVersion="21.4"`. Aucune trace `XML/Tags.xml` (doc non tagué XML) ; tout passe par des attributs custom `EC*`.

### Champs texte — dans `Stories/*.xml`, sur `CharacterStyleRange`
```xml
<CharacterStyleRange ... ECTagData="$ID/4 Description"><Content>﻿</Content></CharacterStyleRange>  <!-- début -->
<CharacterStyleRange ...><Content>Description</Content></CharacterStyleRange>                      <!-- valeur courante -->
<CharacterStyleRange ... ECTagData="$ID/5 Description"><Content>﻿</Content></CharacterStyleRange>  <!-- fin -->
```
- Codes marqueurs : `$ID/4` = début, `$ID/5` = fin (paire nom court). `$ID/2`/`$ID/3` = paire qualifiée : `$ID/<n> <dataSource> <workspace> <recordKey> <champ>`, ex. `…Trafic Z2524 Belgique Bazar Folder French_easycatWorkspace_20250516_115901 596756 Unité de vente`.
- Marqueur visible = `<Content>﻿</Content>` (U+FEFF, BOM/zero-width no-break space).
- Noms de champs **URL-encodés** dans l'attribut (`%20` espace, `%3a` `:`). À décoder.
- Champs relevés : `Name`, `Description`, `References_page`, `Disponibilité FR-NL`, `Price`, `Prix Malin`, `Plus Produit 1/2/3`, `Asterisque Promo`, `Astérisque Exclusion`, `Note de bas page`, `Exclusion produits`, `Meca GG`, `Remarque PAO`…

### Champs image — dans `Spreads/*.xml`, sur `Rectangle`
```xml
<Rectangle Self="ue2" ... ECPageItemData="2 2 Asset_001_page" ECPaginationContainerData="" ECParentRelationships="" ECChildRelationships="">
```
- `ECPageItemData="2 2 <champ>"`. Champs relevés : `Asset_001_page`…`Asset_020_page`, `Picto_1/2/3_Assets_page`, `Suppliers_01`…`Suppliers_04`.

### Pagination (transport seulement)
`ECPaginationContainerData`, `ECPaginationPageItemData` (ex. `1 1 5 Type 0x53500kInCatIsNameKey STUNT`), `ECParentRelationships`, `ECChildRelationships`, `ECAppliedRuleSetsData`.
