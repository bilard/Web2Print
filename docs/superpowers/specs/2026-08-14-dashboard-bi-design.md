# Module « Dashboard BI » — studio de tableaux de bord sur les données de l'application

> Spec — 2026-08-14

## Le problème

L'application produit des données que personne ne peut interroger librement. Chaque écran
d'analyse existant — le cockpit de la veille, les Finances, le Suivi, le tableau de bord de
trafic — répond à **une** question, décidée à l'écriture du code. Une question voisine
(« la complétude par marque », « le poids des visuels par famille », « l'évolution de mon
écart de prix sur trois mois ») exige un développement.

L'objectif : un module où chaque société construit ses propres tableaux de bord sur ses
propres données, avec la logique d'un vrai outil décisionnel — mesures, dimensions, filtres
croisés, forage, mise en page libre, diffusion.

## Volumétrie mesurée (production, 2026-08-14)

Relevée directement en base, parce qu'elle décide de l'architecture :

| Source | Volume |
|---|---|
| Index catalogues concurrents (`competitors/*/pages`) | **33 088 documents ≈ 1,3 M lignes produit** |
| Textes réécrits (`textRevisions`) | 56 352 documents |
| Jeux de données PIM / Excel (`excel_data` + `excel_data_payload`) | 15 jeux, payload en blocs |
| Concurrents suivis (`competitors`) | 67 |
| Workflows / runs / runs de pipeline | 18 / 120 / 381 |
| Assets DAM en base (`dam_assets`) | 8 — le gros du DAM vit sur Google Drive |
| Événements de trafic (`analyticsEvents`) | 361 |
| Projets / utilisateurs | 3 / 11 |

**Une seule source est massive : la veille.** Tout le reste tient sans effort dans le
navigateur — le PIM y charge déjà son catalogue entier (`pim.store.products`). Cette
asymétrie gouverne toute l'architecture : elle interdit une usine à cubes généralisée, et
elle rend le « vraiment live » tenable partout sauf sur la veille.

## Décisions d'architecture

### D1 — Un contrat de spec, trois moteurs derrière

Le cœur du module n'est pas un composant, c'est **un objet sérialisable** : la spec d'une
tuile. Elle décrit *ce qu'on veut savoir*, jamais *comment le calculer*.

C'est le précédent de `chartSpec.ts`, qui sert déjà à la fois l'aperçu React et le rendu PNG
hors écran depuis le node « Graphique ». Ici, la même spec est produite par le constructeur
**ou** par le prompt IA, exécutée par l'un des trois moteurs, et réutilisée telle quelle
pour l'export, le mail planifié et les alertes.

```
QuerySpec {
  source:     SourceId              // 'pim.products' | 'watch.listings' | 'watch.priceEvents'
                                    // | 'dam.assets' | 'ai.usage' | 'wf.runs' | 'analytics.events'
                                    // | 'snapshot:<sourceId>'
  measures:   { id, alias?, format? }[]        // 'count' | 'sum:field' | mesure DÉCLARÉE
  dimensions: { id, bucket? }[]                // bucket : 'day' | 'week' | 'month' pour le temps
  filters:    { field, op, value }[]           // op : eq/ne/in/gt/gte/lt/lte/contains/between/empty
  sort?:      { by, dir }[]
  limit?:     number
}

Tile {
  id, kind, title, query: QuerySpec,
  options:      { palette?, format?, thresholds?, stacked?, showTotals?… }
  interactions: { emitsFilter?: boolean, drillPath?: DimensionId[] }
}

Dashboard {
  id, name, description?, accountId, workspaceUid,
  tiles: Tile[], layout: { tileId, x, y, w, h }[],
  filters: FilterDef[],            // filtres globaux du dashboard
  version, createdAt, updatedAt, createdBy
}
```

Validation par **zod** (déjà au projet) à l'écriture *et* à la lecture : une spec produite
par un LLM ou par une version antérieure du module ne doit jamais atteindre un moteur sans
avoir été validée. `version` porte la migration.

### D2 — Le moteur suit la taille de la source, pas l'inverse

Chaque source déclare son moteur. Trois seulement, et le choix n'appartient pas à l'auteur
du dashboard :

- **`client`** — les lignes sont chargées puis agrégées en mémoire. PIM, DAM, coûts IA,
  runs de workflow, trafic. Vraiment live (abonnements Firestore existants), zéro
  infrastructure, aucune limite de combinaison.
- **`server`** — une Cloud Function parcourt la collection par curseur et ne renvoie que
  l'agrégat. **Uniquement la veille** (1,3 M de lignes : un navigateur ne les tient pas, et
  le mur du million de lignes est le même que celui qui a déjà saturé le cron).
- **`snapshot`** — lecture de photos datées, écrites la nuit. **Uniquement l'axe du temps.**

### D3 — L'historique n'existe pas : il faut commencer à le fabriquer

Le PIM et le DAM ne gardent aucune trace datée. Les courbes dans le temps exigent donc une
Cloud Function planifiée qui écrit chaque nuit une **photo agrégée** par source et par
espace de travail :

```
biSnapshots/{workspaceUid}/{sourceId}/{YYYY-MM-DD}   →  { dims, measures, rows: [...] }
```

Contraintes non négociables, tirées de pannes déjà vécues sur ce projet :
- chunké **par nombre de lignes**, jamais un document unique — Firestore refuse tout
  document au-delà de 1 048 576 octets, et un run qui dépasse ce plafond est marqué en
  erreur alors qu'il a réussi ;
- la photo est un **agrégat** (quelques centaines de lignes par dimension), jamais une copie
  des données ;
- rétention explicite (400 jours par défaut, réglable), purge par la même Function.

Une photo est un pré-agrégat par nature : c'est le seul endroit où le module en fabrique.

### D4 — Les mesures difficiles sont DÉCLARÉES, jamais réimplémentées

Le registre de sources expose deux familles de mesures :

- **brutes** — `count`, `sum:<champ>`, `avg:<champ>`, `min`, `max`, `distinct:<champ>` ;
- **déclarées** — une mesure nommée adossée à **une fonction pure existante** :
  `analytics.ts` (BI prix), `opsMetrics.ts` (moisson), `costModel.ts` / `modelCost.ts`
  (coûts), `metrics.ts` (trafic).

C'est la condition pour que ce module puisse un jour porter les écrans actuels sans les
contredire. Ces écrans portent des invariants durement acquis : « son écart » est une
**médiane** et non une moyenne ; un cycle de moisson se mesure `cumulMs / sweeps` ; un débit
« fiches/min » ne s'affiche pas, il est trompeur ; un coût enregistré peut sous-compter et se
rattrape au tarif courant. Un moteur générique qui recalculerait tout cela naïvement
produirait des chiffres différents de ceux affichés à côté.

**Règle : si une fonction pure sait déjà répondre, le moteur l'appelle. Il ne la réécrit
pas.**

### D5 — Écriture par la société : les règles Firestore d'abord, l'écran ensuite

Chaque société construit ses dashboards, donc chaque société **écrit** en base. Deux pièges
déjà rencontrés ici imposent l'ordre des travaux :

- une écriture client sans règle Firestore correspondante échoue **en silence** — l'écran
  paraît fonctionner, rien n'est enregistré ;
- une section sans permission déclarée est **visible par tous** (le contrôle est fail-open).

Collections :

| Chemin | Contenu | Accès |
|---|---|---|
| `biDashboards/{id}` | dashboard + tuiles + layout | lecture/écriture `inMyWorkspace` + permission |
| `biShares/{token}` | lien public : dashboardId, workspaceUid, expiresAt, revoked | lecture **serveur uniquement** |
| `biSnapshots/{workspaceUid}/{sourceId}/{date}` | photos datées | écriture serveur, lecture espace de travail |
| `biAlerts/{id}` | seuils surveillés | comme les dashboards |

Permissions RBAC ajoutées : `bi.view`, `bi.edit`, `bi.share`, `bi.admin` (gestion des
photos et des alertes). Le module s'enregistre dans `modules.ts` sous l'identifiant `bi`,
groupe `product-data`, avec l'entrée de permission correspondante — l'oubli de cette entrée
rendrait le module public.

Garde-fou de taille : un dashboard est refusé à l'écriture au-delà de 900 000 octets, avec
un message explicite. Les tuiles restent dans le document (un dashboard de vingt tuiles pèse
quelques kilo-octets) ; le plafond protège d'une spec pathologique.

### D6 — Le lien public passe par un jeton et par le serveur

Un dashboard partagé expose les données d'une société. Le partage crée un document
`biShares/{token}` (jeton aléatoire, expiration facultative, révocable). La lecture publique
passe par une Cloud Function `biPublicRead` qui vérifie le jeton, exécute la spec **côté
serveur** et ne renvoie que le résultat agrégé.

Aucune règle Firestore n'ouvre quoi que ce soit en lecture anonyme : le précédent du tableau
de bord de trafic, dont l'endpoint est resté ouvert, sert d'avertissement.

### D7 — Mise en page : une bibliothèque de grille dédiée

La grille libre (tuiles déplaçables et redimensionnables) demande `react-grid-layout`.
`@dnd-kit`, seul présent, ne gère pas le redimensionnement, et l'imbrication d'un panneau
défilant y casse déjà la géométrie du glisser-déposer. Nouvelle dépendance assumée, isolée
dans un seul composant (`DashboardGrid.tsx`) pour rester remplaçable.

### D8 — Le tableau croisé est un composant, pas un graphe

`chart.js` couvre barres, courbes, aires, camemberts. Le **tableau croisé dynamique** —
probablement le visuel le plus utilisé d'un outil décisionnel — n'en fait pas partie : il
est écrit à la main, sur le même `QuerySpec` (dimensions en lignes et en colonnes, mesures
en cellules, totaux, repli/dépli). Il est au premier lot livré, pas en bonus.

## Architecture des fichiers

```
src/features/bi/
  types.ts                 contrat (Tile, QuerySpec, Dashboard) + schémas zod
  registry/
    sources.ts             registre des sources : dimensions, mesures, moteur
    pim.source.ts          adossé à pim.store / excel
    watch.source.ts        adossé à analytics.ts + opsMetrics.ts (moteur serveur)
    dam.source.ts | cost.source.ts | wf.source.ts | traffic.source.ts
  engine/
    aggregate.ts           PUR : group by + mesures + filtres + tri (moteur client)
    aggregate.test.ts
    serverQuery.ts         appel de la CF d'agrégation
    snapshotQuery.ts       lecture des photos datées
  components/
    DashboardGrid.tsx      grille (react-grid-layout), 1 seule dépendance
    TileFrame.tsx          cadre commun : titre, menu, état de chargement, erreur
    tiles/                 KpiTile, ChartTile, TableTile, PivotTile, …
    builder/               TileBuilder, MeasurePicker, DimensionPicker, FilterBar
  hooks/                   useDashboard, useTileData, useCrossFilter
  share/                   création et révocation des liens
functions/src/bi/
  aggregate.ts             agrégation serveur (jumeau du moteur pur)
  snapshotDaily.ts         photos nocturnes + purge
  publicRead.ts            lecture par jeton
```

Le moteur pur (`aggregate.ts`) est **dupliqué** côté Functions, comme les autres jumeaux du
projet (`cronSchedule`, tarifs des modèles), avec un **test de parité** qui fait échouer le
build en cas de divergence — le répertoire `functions/` est hermétique, il ne peut pas
importer `src/`.

## Interactions

- **Filtres globaux** du dashboard (période, marque, catégorie, concurrent…), appliqués à
  toutes les tuiles qui portent la dimension correspondante.
- **Filtrage croisé** : cliquer une barre, une part ou une ligne émet un filtre que les
  autres tuiles reçoivent (`interactions.emitsFilter`). Un bandeau montre les filtres actifs
  et permet de les retirer un par un — un filtre invisible est un mensonge.
- **Forage** : `drillPath` descend d'un niveau (univers → famille → produit) ; le fil
  d'Ariane permet de remonter.
- **Voir les lignes** : toute tuile ouvre le détail derrière son chiffre, et l'exporte.

## L'interface : un tableau de travail, pas une page de graphiques

Exigence de premier rang, au même titre que la justesse des chiffres. Ce module se juge à la
main autant qu'à l'œil : si poser une tuile, la redimensionner ou brancher un champ n'est pas
**immédiat et physique**, l'outil ne sera pas utilisé.

### Deux modes, jamais entre les deux

**Consultation** — aucune poignée, aucune bordure de manipulation, la donnée occupe tout.
**Édition** — la grille apparaît en filigrane, les poignées sortent, la palette s'ouvre.
La bascule est explicite (bouton + `E`). Un dashboard consulté ne se déforme pas d'un clic
malheureux.

### Le geste de composition

- **Grille 12 colonnes**, pas de 8 px, aimantation. Les tuiles se déplacent par leur barre de
  titre et se redimensionnent par les bords **et** les quatre coins.
- **Fantôme de destination** pendant le glissement : l'emplacement libéré se montre avant le
  relâchement, les voisines s'écartent en transition. Jamais de saut brutal.
- **Ajout par glisser** : on tire un visuel de la palette et on le **dépose là où on le veut**.
  Un bouton « ajouter » qui pose la tuile au hasard en bas de page est un aveu d'échec.
- **Clavier** : `⌘Z` / `⇧⌘Z` annuler-refaire (pile de 50 gestes), `⌘D` dupliquer, `⌫`
  supprimer, flèches pour déplacer d'une cellule, `⇧`+flèches pour redimensionner. Sélection
  multiple au lasso, alignement et distribution.
- **Double-clic = plein écran** sur une tuile ; `Échap` en sort.
- Le glissement ne repeint que la tuile déplacée : la mise en page vit en état **local**
  pendant le geste et n'est persistée qu'au relâchement (écriture différée). Sans cela, vingt
  tuiles branchées en direct se recalculent à chaque pixel parcouru.

### Le constructeur : on branche des champs, on n'écrit pas des formules

Le rail gauche liste les **champs** de la source, chacun avec son type (texte, nombre, date,
booléen) et sa cardinalité. On les glisse dans quatre zones : **Mesures**, **Lignes**,
**Colonnes**, **Filtres** — le geste de Power BI et de Tableau, parce qu'il est appris.

- Une zone qui n'accepte pas le champ le **dit pendant le survol** (bordure barrée + motif),
  elle ne le refuse pas en silence au relâchement.
- Une mesure non agrégeable (une médiane, un pourcentage) porte son avertissement : on ne
  peut pas en faire une somme. Le refus se voit avant le dépôt (cf. risque 1).
- **Aperçu en direct** pendant la composition, sur un échantillon quand la source est grande.
- Le type de visuel se change à tout moment sans reconstruire la requête : la spec survit au
  changement de forme.

### Le direct se voit

- Chaque tuile branchée en direct porte un **point qui bat** et « il y a 12 s ». Une tuile
  figée le dit aussi — un chiffre sans âge est invérifiable.
- Les valeurs **s'animent** quand elles changent : le nombre roule (`AnimatedNumber` existe
  déjà), la barre glisse, la ligne s'étend. On voit *que* ça bouge, pas seulement le résultat.
- Aucun rechargement de page, aucun bouton « rafraîchir » obligatoire — la règle du projet.

### Les états ne sont pas des trous

- **Chargement** : squelette à la forme de la tuile (barres pour un graphe, lignes pour une
  table), jamais un tourniquet centré.
- **Vide** : « aucune donnée pour ces filtres », avec le filtre fautif retirable sur place.
- **Erreur** : la cause en une phrase et un bouton réessayer, dans le cadre de la tuile —
  jamais un dashboard entier en panne parce qu'une source a hoqueté.
- **Débordement** : un tableau croisé large scrolle **dans son cadre**. La page ne défile
  jamais horizontalement.

### Les filtres se voient et se retirent

Un bandeau de puces montre tout ce qui restreint la vue — filtres globaux, filtre croisé issu
d'un clic, niveau de forage — chacune retirable d'un clic. Le filtrage croisé **estompe** les
séries non retenues au lieu de les masquer : on garde le contexte de ce qu'on écarte.

### Rendu visuel

- Thème clair/sombre par tokens ; palettes lues depuis `useThemeStore` ; accent `#6366f1`.
- Chiffres en **fonte tabulaire**, formats explicites (€, %, k/M, durées), même règle
  d'arrondi partout.
- Titre de tuile = la mesure **et** la période (« Complétude moyenne · 30 derniers jours »).
- Sobriété : pas de dégradés ni d'ombres décoratives sur les graphes, une seule accentuation
  par tuile, légendes cliquables pour isoler une série.
- Densité **compacte / confortable** au choix, mémorisée par utilisateur.
- Accessibilité : cibles ≥ 32 px, focus visible, contraste vérifié dans les deux thèmes,
  déplacement de tuile au clavier.

### Performance perçue

Tables virtualisées, graphes en canvas (`chart.js`), agrégation mémoïsée par spec, et une
seule requête serveur groupée par dashboard. Objectif tenu comme un critère de recette :
**un dashboard de vingt tuiles reste fluide au glissement**, et une tuile branchée en direct
se met à jour sans faire clignoter ses voisines.

## Diffusion

- Export **PNG** (rendu déjà maîtrisé par le node « Graphique »), **PDF** et **Excel**.
- **Mail planifié** : le node de rapport de coûts et le cron des workflows font déjà tout le
  travail ; un dashboard devient une pièce jointe et un corps HTML email-safe.
- **Alertes de seuil** : une `QuerySpec` + une condition + une cadence. La Function nocturne
  les évalue et notifie (mail, Telegram — les deux canaux existent).
- **Plein écran / TV** : rotation automatique entre plusieurs dashboards.

## Prompt → dashboard

Même patron que le Prompt-to-Flow des workflows : le registre des sources, dimensions et
mesures est sérialisé dans le prompt ; le modèle renvoie un `Dashboard` JSON ; zod valide ;
tout ce qui ne valide pas est rejeté avec la raison affichée. Le prompt de l'utilisateur est
prioritaire et repris verbatim, sans brief maison.

## Tests et barrières

- Modules purs testés : `aggregate.ts` (group by, mesures, filtres, tri, cas vides),
  validation zod des specs, migration de `version`.
- **Parité** client/serveur du moteur d'agrégation.
- Garde-fous vérifiés par test : plafond d'écriture d'un dashboard, chunkage des photos,
  refus fail-closed d'un jeton expiré ou révoqué.
- `npx tsc -b`, `npm run lint` (0 warning), `npm run test:run`, `npm run dead` (exit 0),
  `npm run cycles` (0) — les types partagés vivent dans `types.ts`, jamais dans un module de
  composant.
- i18n : français, anglais britannique, espagnol, dès la première tuile.
- Thème clair/sombre par tokens ; palettes de graphes lues depuis `useThemeStore`.

## Lots de livraison

| Lot | Contenu | Vérifiable par |
|---|---|---|
| **0** | Contrat + zod + registre + collections + **règles Firestore** + permissions + entrée de menu | un dashboard vide s'enregistre et se relit, un autre compte ne le voit pas |
| **1** | Visionneuse : grille, KPI, barres, courbes, table, **tableau croisé**, source PIM, états (squelette / vide / erreur), direct visible | un dashboard lu avec de vraies données, une valeur qui bouge sous les yeux |
| **2** | Constructeur : palette glissable, zones Mesures/Lignes/Colonnes/Filtres, filtres globaux, filtrage croisé, forage, annuler-refaire | un dashboard construit **au geste**, sans écrire de code |
| **3** | Grandes sources : agrégation serveur (veille) + photos nocturnes + axe du temps | une courbe sur trois mois, un agrégat sur 1,3 M de lignes |
| **4** | Diffusion : export, mail planifié, alertes, partage par jeton | un mail reçu, un lien public révoqué qui cesse de répondre |
| **5** | Prompt → dashboard | une phrase produit un dashboard valide |

Les lots 3 et 4 sont indépendants l'un de l'autre ; 5 dépend de 0 et 2.

## Hors périmètre

- **La reprise des écrans existants** (cockpit de la veille, Finances, Suivi, trafic). C'est
  la direction, pas un livrable de ces lots : ils continuent de fonctionner tels quels. Ce
  que ces lots préparent, c'est que leurs calculs deviennent des mesures déclarées (D4).
- Jointures entre sources hétérogènes (PIM × veille dans une même tuile) : le lot 2 pose les
  dimensions communes, la jointure viendra après.
- Édition collaborative en temps réel du même dashboard par deux personnes.
- Requêtes SQL libres. Le registre est la frontière : il garantit que les mesures difficiles
  restent justes.

## Risques

1. **Le libre-service produit des chiffres faux.** Une moyenne de médianes, une somme de
   pourcentages : un utilisateur peut composer une mesure absurde. Atténuation : chaque
   mesure déclare ce qu'elle autorise (agrégable ou non), et l'interface refuse les
   compositions interdites plutôt que d'afficher un nombre.
2. **Le moteur serveur coûte une invocation par tuile.** Atténuation : une seule invocation
   par dashboard (les specs partent groupées), et le résultat vit le temps de la vue.
3. **Les photos nocturnes s'accumulent.** Atténuation : agrégats seulement, rétention et
   purge dans la même Function.
4. **Le lien public fuit.** Atténuation : jeton, expiration, révocation, lecture serveur
   exclusivement, et rien d'ouvert dans les règles.
