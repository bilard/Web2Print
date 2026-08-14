# SDD ledger — plan: docs/superpowers/plans/2026-08-14-dashboard-bi-lot0-1.md

## Pré-vol

Ruling: exécution sur `master` sans worktree — la préférence enregistrée de l'utilisateur
interdit les worktrees et le projet commite/déploie sur master à chaque tâche. Coût si
faux : des commits intermédiaires sur master, annulables par `git revert`.

### Table de conflits (paires partageant un fichier ou une interface)

| Paires | Produit → consommé | Constat |
|---|---|---|
| T1 → T2,3,4,6,9,11 | `QuerySpec`, `Tile`, `Dashboard`, `parseDashboard`, `MAX_DASHBOARD_BYTES` | cohérent ; `ResultColumn.labelKey` typé `TranslationKey` (corrigé en auto-revue) |
| T2 → T3,6,7,8 | `aggregate`, `AggregateResult`, `DataSource`, `Measure` | cohérent |
| T3 → T6,11 | `pimSource`, `productToRow`, `getSource` | cohérent ; `productToRow` consommé par `pimRows` (T6) |
| T4 → T10,11,12 | `saveDashboard`, `dashboardsCol`, `useDashboards` | cohérent |
| T5 → T9 | `TileFrame` (props complètes, corrigées en auto-revue) | cohérent |
| T6 → T9 | `useTileData` | cohérent |
| T7 → T9 | `KpiTile`, `ChartTile`, `formatMeasure` | ⚠ `AnimatedNumber` vit dans `features/priceWatch/dashboard/` → T7 le DÉPLACE vers `components/shared/` et met à jour ses consommateurs |
| T8 → T9 | `TableTile`, `PivotTile`, `toPivot` | cohérent |
| T9 → T10 | `DashboardGrid`, `useLayoutDraft` | cohérent |
| T10 → T11,12 | `BiScreen`, `BiToolbar` | T11 et T12 modifient `BiScreen` — séquentiel, sans conflit |
| T11 → T12 | `newTile`, `placeTile`, `AddTileMenu` | cohérent |

### Cohérence interne de chaque tâche

T1 à T12 : tests spécifiés ↔ code spécifié ↔ fichiers créés — vérifié, aucun écart.
Aucune tâche ne mandate un test sans assertion ni une duplication de bloc logique.

Ruling: `react-grid-layout` et `react-chartjs-2` sont des dépendances NOUVELLES, ajoutées
par T7 et T9. Coût si faux : deux paquets à retirer (`npm uninstall`).

## Journal
Task 1: implémenté (commit 665d648b, 4 tests PASS, tsc+lint OK) — revue en cours
Ruling: knip sort en erreur après T1 (10 exports du contrat sans consommateur). Ce sont les
types que consomment T2→T11 du MÊME plan : je ne les retire pas et je ne relâche pas la
barrière. Vérification différée à T12, où `npm run dead` doit être revenu à exit 0 — s'il
reste rouge, c'est un vrai défaut. Coût si faux : un export à retirer en fin de lot.
Task 1: revue — conformité ✅ ; 1 Important (knip, déjà jugé ci-dessus, vérif différée T12) ;
  1 mineur (title sans .min(1)).
Ruling: le mineur « titre vide accepté » est ÉCARTÉ, pas différé — T11 crée délibérément une
  tuile avec `title: ''` avant de le composer. Exiger un titre non vide casserait cette
  tâche. Coût si faux : une tuile sans titre affichable, corrigible en une ligne.
Task 1: complete (commits 88f1ee5e..665d648b, revue clean hors points jugés)
Task 2: implémenté (commit 40117ce1, 8 tests PASS) — 2 écarts déclarés au brief.
Ruling: écart 1 (6 clés i18n `bi.source.pim` / `bi.dim.*` / `bi.measure.*` ajoutées aux 3
  catalogues) ACCEPTÉ — le test du brief type ses mocks avec ces clés, sans elles `tsc -b`
  échoue. ⚠ T3 prévoit les mêmes clés : son dispatch doit dire qu'elles existent déjà.
  Coût si faux : doublons de clés, détectés par tsc.
Ruling: écart 2 (dimension inconnue → `throw` au lieu d'un repli sur `d.id`) ACCEPTÉ — c'est
  déjà ce que le plan impose pour une MESURE inconnue, et le repli était de toute façon
  invalide au typage. Coût si faux : une tuile mal configurée lève au lieu d'afficher un
  libellé brut — comportement voulu par la spec (« un zéro silencieux est interdit »).
Task 2: complete (commits 665d648b..40117ce1, revue clean)
Task 3: implémenté (commit 0ed9b05f, 4 tests + 16 module + 54 i18n PASS).
Ruling: `bi.measure.count` reformulé « Nombre » → « Nombre de produits » (3 langues) —
  le libellé de T2 était provisoire et aucun test n'assertait le texte. Coût si faux : un
  libellé à réécrire.
Ruling: l'inquiétude « rien n'empêche encore d'agréger une mesure non agrégeable » est
  ATTENDUE — le refus est un livrable du LOT 2 (constructeur), explicitement hors périmètre
  ici. Coût si faux : une tuile mal composée affiche un chiffre discutable avant le lot 2.
Task 3: complete (commits 40117ce1..0ed9b05f, revue clean)
Task 3: minor (deferred): médiane d'ancienneté = élément supérieur sur effectif pair (code du
  plan, sans conséquence à cette échelle).
Note pour T7: `pim.completeness` rend une valeur 0–100 → `formatMeasure(v,'pct')` doit
  afficher « 75,5 % » sans multiplier par 100.
Ruling: le déploiement des règles Firestore (`firebase deploy --only firestore:rules`) reste
  SOUS MON CONTRÔLE, pas confié au sous-agent : c'est un effet de bord en production. Le plan
  l'exige dans la tâche ; je l'exécute après la revue. Coût si faux : rien, décalage de
  quelques minutes.
Task 4: implémenté (commit d94bf00f) — revue : conformité ✅, sécurité « sûr à déployer »
  (aucun wildcard antérieur ne masque la règle ; `bi: 'bi.view'` bien présent dans
  SECTION_PERMISSION, donc la branche fail-open est fermée).
Ruling: écarts acceptés — `perm.module.17`→`19` (17/18 pris), `MODULE_PERMISSION` s'appelle
  `SECTION_PERMISSION`, et 3 fichiers hors brief (helpContext, highlightIds, moduleMeta) sont
  des barrières d'exhaustivité qu'une nouvelle section casse. Coût si faux : nul, additif.
Task 4: fix round 1/5 (1 Important adressé — stripUndefined avant setDoc ; commit e5d934bd)
Task 4: minor (deferred): règle sans `request.resource.data.workspaceUid == uid` (durcissement).
Task 4: minor (deferred): un membre de l'espace sans `bi.view` peut lire via le SDK — conforme
  au patron des modules existants (catalogs, promos).
Task 4: re-revue — constat ADRESSÉ (helper du projet réutilisé, test qui vérifie le payload).
Task 4: règles Firestore DÉPLOYÉES en production (firebase deploy --only firestore:rules, OK).
Task 4: complete (commits 0ed9b05f..e5d934bd, revue clean après 1 round)
Task 5: implémenté (commit a77d021e, 2 tests PASS, suite complète 3421 PASS).
Ruling: `@testing-library/react` + `jest-dom` ajoutés en devDependencies — mon plan les
  supposait présents, ils ne l'étaient pas (le dépôt n'avait AUCUN test de composant). Je les
  GARDE : `environment: 'jsdom'` est déjà configuré, ce sont des dépendances de développement
  (aucun impact sur le bundle), et les tâches 7 à 11 livrent d'autres composants dont les
  états méritent des tests. Coût si faux : deux devDependencies à retirer et deux tests de
  composant à convertir ou supprimer.
Task 5: complete (commits e5d934bd..a77d021e, revue clean)
Task 5: minor (deferred): les 2 tests ne vérifient pas le déclenchement des rappels
  (onRetry/onClearFilters) — code verbatim du plan.
Task 6: implémenté (commit 33cd1670) — revue : conformité ✅, 2 Importants.
⚠⚠ DÉFAUT DE PLAN découvert ici (le mien) : j'avais supposé que le catalogue produit vivait
  dans `usePimStore.products`. VÉRIFIÉ EN BASE DE CODE : `setProducts` n'a AUCUN appelant hors
  du store ; les données que l'utilisateur voit dans le module « Données » vivent dans
  `useExcelStore.sheets[].{columns,rows}`. `usePimStore.products` n'est peuplé que par
  `upsertProducts` après un import/scrape (PIM master, dédoublonnage).
Ruling: la source lit désormais la FEUILLE ACTIVE (`useExcelStore`) et retombe sur
  `usePimStore.products` quand elle est peuplée. C'est le plus petit changement qui débloque
  l'aval : sans lui, toutes les tuiles du lot 1 resteraient sur « chargement » et l'écran
  n'afficherait jamais rien. Conséquence assumée : les dimensions deviennent DYNAMIQUES (les
  colonnes réelles de la feuille), ce qui rapproche le module d'un vrai outil décisionnel et
  rend le menu d'ajout de tuile (T11) réellement utile. Coût si faux : une source à rebrancher
  et le menu de T11 à réajuster.
Ruling: le second Important (mémoïsation sensible à l'égalité référentielle de `query` et
  `globalFilters`) est REPORTÉ à T9, qui écrit l'appelant : c'est là que la stabilité des
  objets se décide. Porté dans le brief de T9. Coût si faux : recalculs inutiles, visibles au
  test de fluidité de T12.
Ruling: `ResultColumn.label?` ajouté (2 lignes dans aggregate.ts, T2) — `labelKey` porte les
  libellés du CATALOGUE, `label` ceux qui viennent de la DONNÉE (colonne de feuille). Sans
  lui, chaque colonne de feuille afficherait un intitulé générique. À porter dans les briefs
  T7 et T8 : les tuiles préfèrent `label` quand il est présent. Coût si faux : un champ
  optionnel inutile.
Ruling: la source dérivée d'une FEUILLE n'expose ni `pim.freshnessDays`, ni `_createdAt`, ni
  `_updatedAt` — ces champs n'existent pas sur une ligne de feuille et la mesure rendrait 0,
  ce qui se lit « mis à jour aujourd'hui ». Une colonne datée de la feuille reste une
  dimension `date` ordinaire. Coût si faux : une mesure d'ancienneté à rebrancher.
Task 6: fix round 1/5 (défaut de plan adressé — lecture de la feuille active ; commit b5324140)
Task 6: complete (commits a77d021e..b5324140, revue clean après 1 round)
Note pour T7/T8: une colonne de résultat porte `label` (nom venu de la DONNÉE) EN PLUS de
  `labelKey` (catalogue i18n) — les tuiles affichent `label` quand il est présent.
Note pour T7/T8: `useTileData` peut rendre `empty` AVEC un message (« aucune donnée chargée »)
  distinct de `empty` sans message (filtres à vide) — à distinguer visuellement si utile.
Task 7: implémenté (commit 4b1c246b, 36 tests module + 3435 suite, cycles 0).
Ruling: 3 écarts au verbatim ACCEPTÉS — (1) règle `label ?? t(labelKey)` appliquée aux tuiles
  (le brief précédait cet ajout, je l'avais annoncé) ; (2) tooltip qui formatait toutes les
  séries avec le format de la PREMIÈRE mesure → corrigé par série, et locale figée `fr-FR`
  → `intlLocale(locale)` ; (3) légende affichée pour camembert/anneau à mesure unique, où
  elle nomme les tranches. Les trois corrigent le plan, ils ne le contournent pas. Coût si
  faux : trois retouches d'affichage.
Task 7: fix round 1/5 (1 Important adressé — locale figée dans formatMeasure ; commit 0cb7afd2)
Task 7: re-revue — le re-relecteur s'est tu ; VÉRIFIÉ MOI-MÊME dans formatValue.ts : `pct`
  passe par `Intl` en `style:'percent'` avec division par 100 (pas de « 7 550 % »), `ms` par
  `Intl` avec la locale reçue. Constat ADRESSÉ.
Task 7: complete (commits b5324140..0cb7afd2, revue clean après 1 round)
Task 8: implémenté (commit aae45664, 3438 tests, cycles 0).
Ruling: 2 écarts ACCEPTÉS — règle `label ?? t(labelKey)` au lieu du cast du plan, et
  correction d'un vrai bug du plan (l'en-tête de ligne du tableau croisé affichait toujours
  la 1re dimension même quand la dimension de LIGNE était la seconde). Coût si faux : nul,
  les deux corrigent le plan.
Task 8: minor (deferred): au-delà de 2 dimensions, `toPivot` ignore les suivantes et peut
  fusionner des lignes (dernière valeur gagnante) — commenté dans le code, à revoir au lot 2.
Task 8: fix round 1/5 (1 Important adressé — tri déterministe des axes du tableau croisé,
  VÉRIFIÉ moi-même dans le diff : `compareKeys` + `sort` sur columns et rowKeys, null en fin ;
  commit eafa316f)
Task 8: complete (commits 0cb7afd2..eafa316f, revue clean après 1 round)
Task 9: implémenté (commit 62fb0ea0, 46 tests module, cycles 0).
Ruling: 3 écarts ACCEPTÉS — (1) `react-grid-layout` épinglé en `^1.5.4` : la 2.x est une
  réécriture d'API incompatible avec le code du plan et avec ses types ; (2) garde
  `layoutsEqual` contre l'appel `onLayoutChange` que la lib émet AU MONTAGE, sans geste —
  sans elle, un brouillon s'armait tout seul ; (3) `React.memo(TileBody)` pour ne pas
  re-rendre vingt graphes à chaque événement de glissement. Coût si faux : une dépendance à
  faire monter de version, une garde à retirer.
⚠ À TRAITER EN T10 (signalé par l'implémenteur) : `useLayoutDraft` fait `useState(initial)` et
  ne resynchronise JAMAIS `initial`. Si l'écran monte le hook avant l'arrivée du tableau de
  bord depuis Firestore, la mise en page reste figée vide. Porté dans le brief de T10.
Task 9: fix round 1/5 (1 Critique + 1 Important adressés ; commit 7191600c)
Ruling: re-revue déléguée NON dispatchée — j'ai lu le diff moi-même : `committed` (ref
  explicite du dernier état validé) empilé au commit et déplacé par undo/redo, exactement
  l'invariant demandé ; l'implémenteur a de plus prouvé que le nouveau test échoue sur
  l'ancien code. Preuve directe > rapport délégué. Coût si faux : un défaut d'annulation qui
  se verrait à la recette de T12.
Task 9: complete (commits eafa316f..7191600c, revue clean après 1 round)
Task 10: implémenté (commit 0f5038a5, 61 tests module / 3457 suite, cycles 0, dead amélioré).
Ruling: écart ACCEPTÉ — extraction d'un composant `BiBoard` portant seul `useLayoutDraft`,
  monté avec `key={current.id}` : résout la non-resynchronisation de `initial` sans toucher au
  hook de T9. Coût si faux : un remontage de plus au changement de tableau de bord.
Ruling: correction ACCEPTÉE — le raccourci « E » du plan ne vérifiait pas `bi.edit` : un rôle
  en consultation seule pouvait faire apparaître les poignées et tenter une écriture (refusée
  par Firestore, mais fail-open côté interface). C'est un défaut de mon plan. Coût si faux :
  aucun, la correction est strictement plus fermée.
Task 10: complete (commits 7191600c..0f5038a5, revue clean)
Task 10: minor (deferred): raccourci « E » sans garde `isContentEditable` (aucun champ de ce
  type sur l'écran aujourd'hui).
Task 10: minor (deferred): `persist`/`persistFilters` dépendent de l'objet `current` entier —
  un évènement Firestore casse ponctuellement la mémoïsation de la grille (recalcul superflu
  APRÈS une sauvegarde, jamais pendant un geste).
Task 11: implémenté (commit c722ceaa, 3467 tests, cycles 0).
Ruling: écarts ACCEPTÉS — menu branché dans `BiBoard` (là où vivent `uid`, `current` et la
  mise en page), source dérivée de la feuille active via un point de décision unique
  (`effectivePimSource`) partagé avec `useTileData`, `addPlacement` ajouté au brouillon (sans
  lui, annuler après un ajout laissait une tuile ORPHELINE que `parseDashboard` refuse —
  reproduit en test avant correction), et `toast.error` quand l'espace de travail manque.
  Coût si faux : trois retouches d'assemblage.
Task 11: minor (deferred): l'AJOUT d'une tuile n'est pas annulable au lot 1 (seuls les gestes
  de mise en page le sont).
Task 11: minor (deferred): une mesure non agrégeable croisée à une dimension AVERTIT sans
  bloquer — le refus complet est un livrable du lot 2 (ruling de T3).
Task 11: complete (commits 0f5038a5..c722ceaa, revue clean)
Task 11: minor (deferred): message générique « Enregistrement refusé » quand l'espace de
  travail n'est pas encore prêt (rien de silencieux, juste imprécis).
Task 12: implémenté (commit 29fbb311). CINQ BARRIÈRES VERTES, dont `npm run dead` = exit 0 :
  la baseline de code mort est REFERMÉE (le ruling de T1 est donc soldé, sans recours à
  knip.json).
Ruling: 4 écarts ACCEPTÉS — bouton rattaché au titre rendu par `BiBoard` via un prop
  `headerAction` ; refus VISIBLE quand l'espace de travail manque ; création cadenassée par
  `bi.edit` ; et surtout correction d'un défaut réel : la mesure de largeur de la grille
  n'était portée que par la branche « tableaux présents », si bien qu'au montage l'observateur
  ne trouvait rien et la grille restait figée à 1200 px pour toute la session. Coût si faux :
  un prop d'assemblage à revoir.
Task 12: complete (commits c722ceaa..29fbb311, revue clean)
=== 12/12 tâches livrées — revue finale de branche à suivre ===

=== REVUE FINALE DE BRANCHE ===
3 bloquants : (1) une tuile posée est réduite à 1×1 et arme le brouillon sans geste (VÉRIFIÉ
  par sonde sur le vrai composant) ; (2) aucune attribution du jeu de données — un tableau
  rouvert avec une autre feuille active recalcule dessus, même titre, même libellé, chiffre
  d'un autre catalogue ; (3) le tableau croisé est livré mais inatteignable (le menu ne pose
  qu'UNE dimension).
10 points « à traiter ensuite », dont : message d'état vide jeté, âge de la donnée figé à
  « 0 s », erreurs muettes hors mode debug, messages d'erreur en français en dur, totaux du
  pivot qui sommeraient une mesure non agrégeable, clés réservées écrasables par une colonne.
Ruling: UNE seule vague de correction, portant les 3 bloquants + les points qui font MENTIR
  l'écran (message d'état vide, âge, totaux non agrégeables, clés réservées). Le reste part
  dans la suite du chantier, consigné pour l'utilisateur. Coût si faux : une vague de plus.
Vague finale: 6/6 constats ADRESSÉS (re-revue), dont les deux points décisifs vérifiés aussi
  par moi : `sourceSheetName` OPTIONNEL dans le schéma zod (les tableaux déjà enregistrés
  restent lisibles), et un test qui rejoue la séquence du 1×1 et échoue sur l'ancien code.
Ruling: 3 régressions Important relevées par la re-revue → une DERNIÈRE correction ciblée,
  malgré la règle « une seule vague ». Motif : (a) une colonne nommée `_sku` ferait échouer
  TOUTES les tuiles d'une feuille légitime — casse totale d'écran ; (b) deux messages
  techniques en français en dur atteignent l'écran dans l'état vide le plus COURANT, contre un
  chantier anglais/espagnol déclaré terminé ; (c) une assertion par produit, corrigible en une
  ligne. Coût si faux : un troisième aller-retour au lieu d'un report.
Dernière correction: 3 points ADRESSÉS (commits db54ed90, 1bb39073, 932fe6d4).
BARRIÈRES FINALES vérifiées par moi : tsc 0, lint 0 warning, 3507 tests, dead exit 0,
  cycles 0, build OK. Hosting DÉPLOYÉ.
=== LOT 0+1 TERMINÉ — 26 commits (88f1ee5e..932fe6d4) ===
