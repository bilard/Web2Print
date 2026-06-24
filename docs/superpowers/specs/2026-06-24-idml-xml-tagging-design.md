# Balisage XML InDesign → champs de données (IDML natif)

> Conception — 2026-06-24
> Jumeau natif (gratuit) du chemin EasyCatalog : voir `2026-06-06-easycatalog-interop-design.md`

## Problème

Le maquettiste doit relier des morceaux de contenu InDesign à des champs de données pour
la fusion (data merge) de l'app. La syntaxe `{{champ}}` tapée **à la main** dans InDesign
est non fiable : InDesign découpe fréquemment le texte en plusieurs
`<CharacterStyleRange>` / `<Content>` (correction, style de caractère, césure), si bien que
`{{prix}}` devient `{{pr` + `ix}}` sur deux runs et la regex `/\{\{([^}]+)\}\}/g` ne
retrouve plus le motif. C'est le talon d'Achille de **toute** syntaxe basée sur du texte
littéral.

## Décision : balisage **structurel** via les balises XML natives d'InDesign

InDesign offre nativement (Fenêtre > Utilitaires > Balises + panneau Structure) un balisage
XML qui **enveloppe** le contenu au lieu de l'insérer dans le texte. À l'export IDML, cela
produit des `<XMLElement MarkupTag="…">` autour des runs — immunisés au découpage.

### Preuve sur fichier réel (sample Monoprix `Snipet_PROMO_converted.idml`)

Le prix « 22€,99 » est éclaté en **4** `<CharacterStyleRange>` (styles différents sur
`22` / `€` / `,` / `99`) — exactement le run-splitting qui casse `{{}}` — mais **tous
enveloppés** dans un seul `<XMLElement MarkupTag="XMLTag/Prix">`. La balise capte le champ
entier malgré le découpage. C'est la démonstration empirique que la voie structurelle
résout le problème.

## Format constaté (vérifié, pas reconstitué de mémoire)

| Élément | Emplacement | Forme |
|---|---|---|
| Déclaration des tags | `XML/Tags.xml` | `<XMLTag Self="XMLTag/Prix" Name="Prix">` — noms **non** URL-encodés (accents conservés : `Réduction`) |
| Champ **texte** | dans la `Story` (inline) | `<XMLElement MarkupTag="XMLTag/Prix">` enveloppant 1..n `<CharacterStyleRange>` |
| Champ **image / cadre** | `XML/BackingStory.xml` uniquement | `<XMLElement MarkupTag="XMLTag/Image" XMLContent="u1c4">` + `<XMLAttribute Name="href" Value="file:///…">`, où `u1c4` est le `Self` de l'`<Image>`/`<Rectangle>` du Spread |
| Conteneurs | partout | `Root`, `Article` enveloppent des sous-champs |

**Faits structurels du sample :**

- Les `<XMLElement>` **n'apparaissent pas** dans le `Spread`. Le texte est balisé inline
  dans les `Stories` ; l'image n'est balisée **que** dans `XML/BackingStory.xml`.
- **Un cadre peut contenir plusieurs champs** : `Story_u156` = un seul `TextFrame` portant
  `Libelle_Article` + `Marques` + `Description`.
- **Champ et texte statique mêlés** : `Story_u183` = `{{Réduction}}`(« 30 ») + un `%`
  littéral hors balise + un paragraphe « d'économie » non balisé.
- **Conteneur vs feuille** : `Article`/`Root` regroupent des sous-champs ; les **feuilles**
  (XMLElement sans XMLElement enfant, contenant du `<Content>`) sont les champs réels.
- Nom du champ = `MarkupTag` privé du préfixe `XMLTag/` (`XMLTag/Réduction` → `Réduction`).
- Le sample est un gabarit **pour un seul produit** : le tag `Article` y enveloppe 3 cadres
  du même article — ce n'est **pas** 3 produits (important pour les groupes répétables).

## Architecture : réutiliser le pipeline de fusion existant

Décision validée : **représentation interne canonique `{{Champ}}`**, mais **générée par le
parser** à partir de la structure XML — jamais tapée dans InDesign, donc jamais découpée.
Cela réutilise l'intégralité du moteur de fusion déjà éprouvé (`mergeEngine.resolveText`,
`remapStyles`, `useDataMerge`, `idmlPatcher`) **sans le toucher**, et reste cohérent avec
le chemin EasyCatalog qui canonicalise déjà vers `{{}}` (`ecTemplatizer`).

Le codebase fait **déjà** « token texte `{{}}` + propriété `data` pour les images »
(`ECPageItemData` → `data.mergeImageField`). On suit ce pattern établi, on n'en introduit
pas un nouveau.

```
IDML balisé XML ─┐
                 ├─→ [NOUVEAU] reconnaissance XMLElement → {{Champ}} (texte)
IDML EasyCatalog ┘                                     → data.mergeImageField (image)
IDML {{}} legacy ─→ (inchangé)
                          │
                          └─→ pipeline merge EXISTANT (résolveur, UI, export) — inchangé
```

### Pourquoi `{{}}` interne et pas une propriété `data.fieldName`

Une propriété unique par objet ne peut pas représenter « 1 cadre = 3 champs » ; elle
forcerait un modèle de **spans caractère** `[{field,start,len}]` **+ un nouveau résolveur
de merge**, donc **deux représentations internes incompatibles** et une réécriture du code
le mieux testé du projet. `{{}}` gère nativement le multi-champ par cadre
(`"{{Libelle_Article}}\n{{Marques}}\n{{Description}}"`) et le mélange champ/statique
(`"{{Réduction}}%\nd'économie"`). La crainte initiale (« `{{}}` illisible ») visait la
**saisie manuelle** ; ici le `{{}}` est fabriqué proprement par le parser → problème dissous.

## Composants — Phase 1 (format + lecture app + groupes répétables)

### 1. Reconnaissance des balises au parsing — `src/features/idml/`

- **`idmlParser.ts`** : lors du parsing des stories, détecter les `<XMLElement MarkupTag>`
  **feuilles** et injecter `{{Nom}}` à la place de leur contenu, sur le modèle exact des
  lignes 982-999 déjà en place pour EasyCatalog. Une feuille = XMLElement sans descendant
  XMLElement, contenant des `<CharacterStyleRange>`/`<Content>`.
- **Nouveau parseur `XML/BackingStory.xml`** : construire la map `XMLContent(Self) → champ`
  pour les éléments non-texte → poser `data.mergeImageField` sur l'objet Fabric
  correspondant (jumeau de `ECPageItemData`, déjà consommé par `idmlToFabric.ts:245-259`).
- **Helper de balisage** (jumeau de `parseEcTag`) : `MarkupTag → nom de champ`
  (strip `XMLTag/`, pas de `decodeURIComponent` — noms non encodés, accents conservés).

### 2. Hiérarchie des balises (métadonnée) — capturée dès la Phase 1

Construire `tagTree` à partir de l'imbrication des `<XMLElement>` (BackingStory + stories) :
arbre `conteneur → [feuilles]` avec, pour chaque nœud, son `MarkupTag`, son `XMLContent`
(objet cible) et l'ordre. Stocké au niveau document (et/ou `data.tagPath` par objet). En
Phase 1 cette métadonnée **alimente les groupes répétables** (ci-dessous) ; elle reste
disponible pour des usages futurs (validation de schéma, navigation).

### 3. Groupes répétables — deux niveaux explicites

- **Niveau page (record = gabarit entier)** : déjà couvert par `buildMultiPageIdml` /
  `patchIdmlForRow` (1 page par ligne du dataset). Phase 1 = **garantir** que ce chemin
  fonctionne avec les balises XML (réinjection des valeurs dans les `<Content>` des
  XMLElement, préservation de la structure XML pour le round-trip).
- **Niveau groupe intra-page (record = conteneur balisé répété)** : un conteneur désigné
  comme répétable (par convention : conteneur de plus haut niveau sous `Root` portant des
  feuilles, ou nom d'entité dédié) est **dupliqué pour N lignes** et disposé selon un
  layout simple (flux/grille à pas constant dérivé du bbox du groupe). Le merge applique
  chaque ligne à une instance.

  ⚠️ **À valider à la revue** : le sample ne contient pas de groupe répétable homogène
  (un seul produit). Le layout intra-page (pas de grille, débordement, pagination) est la
  partie la plus incertaine ; si on veut dérisquer, on livre d'abord le **niveau page**
  (robuste, existant) et le **niveau groupe** sur un sample multi-produits fourni ensuite.

### 4. Export / round-trip — `src/features/merge/idmlPatcher.ts`

- Réinjecter les valeurs fusionnées dans le `<Content>` **à l'intérieur** des `<XMLElement>`
  (et non plus seulement dans des `<Content>` nus), en **préservant** les `<XMLElement>` et
  `XML/Tags.xml` / `XML/BackingStory.xml` pour que le fichier ré-exporté reste un IDML
  balisé valide (round-trip InDesign + relecture par l'app).
- Images : réinjecter le `href` (`<XMLAttribute Name="href">` + le lien du Spread) depuis
  `data.mergeImageField`, comme le fait déjà le binding image EC.

### 5. Tests

Fixture dérivé du sample Monoprix :
- `Prix` éclaté en 4 runs → un seul `{{Prix}}` (non-régression run-splitting).
- `Story_u156` (1 cadre, 3 feuilles) → `{{Libelle_Article}}\n{{Marques}}\n{{Description}}`.
- `Story_u183` (champ + statique) → `{{Réduction}}%\nd'économie`.
- Image via BackingStory `XMLContent=u1c4` → `data.mergeImageField = "Image"` + href.
- Round-trip : merge d'une ligne → IDML ré-exporté contient toujours `XMLElement`/`Tags.xml`.

## Composants — Phase 2 (outil de balisage InDesign)

ExtendScript **`.jsx`** (un seul fichier, déposé dans le dossier *Scripts* d'InDesign, zéro
signature, zéro distribution) :

- lit la liste des champs (depuis un fichier exporté par l'app, ou saisie) ;
- pour la sélection courante (texte ou cadre), crée le `XMLTag` si absent et l'applique en
  1 clic (équivalent du glisser-déposer du panneau Structure, automatisé) ;
- option : poser la structure `Root > Article > champs` pour les groupes répétables.

UXP (plugin signé, panneau persistant) **réservé** à un besoin ultérieur de panneau permanent.

## Hors périmètre (phases ultérieures)

- Layout intra-page avancé pour groupes répétables (grille multi-colonnes, pagination,
  débordement) au-delà du flux simple.
- Modèle de binding unifié (texte + image + groupes) en propriété structurée — possible
  plus tard **sans** jeter `{{}}` ; non payé d'avance (YAGNI).
- Import de DTD pour imposer le vocabulaire des champs côté InDesign.

## Risques

- **Le niveau groupe intra-page est la zone incertaine** (layout). Atténuation : livrer le
  niveau page d'abord, valider le niveau groupe sur un sample multi-produits réel.
- Variantes de sérialisation InDesign non vues dans ce sample (ex. balise sur un groupe
  d'objets, cadres chaînés). Atténuation : le parser tolère les conteneurs inconnus
  (ignorés comme champs, conservés dans `tagTree`).
