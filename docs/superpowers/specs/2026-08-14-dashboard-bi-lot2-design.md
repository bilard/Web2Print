# Dashboard BI — lot 2 : le constructeur, et la veille comme source

> Spec — 2026-08-14 (suite de `2026-08-14-dashboard-bi-design.md`)

## Le problème

Le lot 1 a livré une visionneuse. À l'usage, elle propose **trois mesures écrites en dur** et
un menu déroulant natif : on est loin d'un outil décisionnel, et le jugement de l'utilisateur
est sans appel. Deux manques distincts :

1. **Le carburant.** Les mesures ne sont pas dérivées des données. Un catalogue de 21 colonnes
   devrait offrir la centaine de mesures que ses colonnes permettent — pas trois.
2. **Le geste.** Il n'y a pas de constructeur : ni champs manipulables, ni zones de dépôt, ni
   agrégation choisie par champ, ni filtre, ni interaction entre tuiles.

Et la source la plus riche de l'application — la veille tarifaire F1, 24 concurrents,
115 814 fiches au catalogue source, 103 411 fiches comparées — n'est pas branchée.

## Ce qui est accessible, et à quel coût

Vérifié dans `features/priceWatch/explorer/useSiteExplorer.ts` :

| Donnée | Chemin | Coût |
|---|---|---|
| Rapport de comparaison (24 concurrents : appariés, moins chers, ruptures, écart médian) | `reports/latest` | un document, instantané |
| Historique de points KPI | `reports/history` | un document, 90 points |
| Catalogue source (115 814 produits) | `loadSourceCatalog`, par tranches | plusieurs secondes, tenu en mémoire par l'explorateur aujourd'hui |
| Fiches d'un concurrent | `loadAllListings(site)` | plusieurs Mo — **un seul site à la fois**, contrainte dure |

D'où trois sources distinctes plutôt qu'une : une synthèse instantanée, un catalogue lourd
mais chargeable, un détail par site. Le moteur serveur (lot 3) reste nécessaire pour croiser
tous les concurrents à la maille fiche.

## Décisions

### D1 — Les mesures se dérivent des colonnes

`MeasureRef` devient `{ field, agg, alias? }` où `agg ∈ { count, countDistinct, sum, avg,
median, min, max, filledPct }`. Le registre expose `deriveMeasures(columns)` qui produit, pour
chaque colonne, les agrégations que son **type** autorise : les sommes et moyennes sur les
champs numériques seulement, le décompte et le taux de renseignement partout.

⚠ Les mesures nommées du lot 1 (`count`, `pim.completeness`, `pim.filled`) restent : ce sont
des mesures **déclarées**, adossées à une fonction pure, et c'est ainsi que les calculs
difficiles de l'application (médiane d'écart, durée de cycle, coût rattrapé) entreront plus
tard sans être réécrits.

⚠ `median` et `filledPct` ne sont pas sommables entre groupes : elles restent marquées non
agrégeables, et l'interface refuse de les totaliser.

### D2 — Trois sources pour la veille

- `watch.summary` — une ligne par concurrent, issue du rapport. Dimensions : concurrent.
  Mesures : appariés, moins chers, ruptures, écart médian, fiches indexées, % avec prix.
- `watch.catalog` — le catalogue source. Dimensions : les colonnes réelles (univers, famille,
  sous-famille, marque, référence…). Mesures dérivées.
- `watch.site` — les fiches du concurrent choisi. Dimensions : ses colonnes. Mesures dérivées.

Le chargement est explicite et visible : une source lourde annonce son avancement, et rien ne
se charge tant qu'aucune tuile ne le demande.

### D3 — Le constructeur est un geste, pas un formulaire

Rail des champs à gauche (typés, cherchables, avec leur cardinalité). Quatre zones de dépôt :
**Valeurs**, **Axe**, **Légende**, **Filtres**. On y glisse un champ ; sa puce porte son
agrégation, changeable d'un clic. Une zone refuse un champ incompatible **pendant** le survol,
jamais en silence au relâchement.

### D4 — Les tuiles se parlent

Filtres globaux du tableau de bord ; clic sur une barre, une part ou une ligne qui filtre les
autres tuiles ; forage descendant le long d'une hiérarchie de champs ; bandeau de filtres
actifs, chacun retirable. Le filtrage croisé **estompe** ce qu'il écarte au lieu de le masquer.

### D5 — Plus un seul menu natif

Le projet n'a pas de bibliothèque de menus : il a des motifs maison éprouvés (popover avec
fermeture au clic extérieur, recherche intégrée — cf. `AiProviderCard`). On les réutilise pour
tous les sélecteurs du module. Aucun `<select>` ne subsiste dans le module BI.

## Hors périmètre

Le moteur d'agrégation serveur et les photos historiques (lot 3), l'export et la diffusion
(lot 4), la création par prompt (lot 5). Le croisement de tous les concurrents à la maille
fiche reste impossible tant que le lot 3 n'est pas là — l'interface doit le dire plutôt que
de le laisser deviner.

## Recette

Elle se fait **dans le navigateur, sur F1**, et les captures accompagnent la livraison. Un
tableau de bord de démonstration doit pouvoir se construire sans écrire une ligne : répartition
des écarts par concurrent, prix médian par famille, complétude par marque, croisement
univers × concurrent.
