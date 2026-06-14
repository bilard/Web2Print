# Reformater (IA) — re-layout intelligent au changement de format

> Spec — 2026-06-14

## Objectif

Quand l'utilisateur change le format d'un projet (panneau **PAGE**), réadapter
automatiquement et intelligemment la mise en page au nouveau format, à la manière
de la **« Mise en page fluide »** d'InDesign, en réutilisant le moteur de re-layout
LLM déjà en place. Le résultat est posé sur une **nouvelle page** ; la page
d'origine reste intacte.

Aujourd'hui, changer le format (`PagePanel` → `applySize` → `setCanvasSize`) ne fait
que retailler le canvas : le contenu reste collé en haut-à-gauche (cf. screenshot de
référence : une tuile produit seule dans le coin d'une grande page vide).

## Décisions validées

- **Déclenchement** : automatique (« Auto IA ») au changement de format — pas de bouton
  dédié à actionner.
- **Cible** : nouvelle page au format choisi, contenu réadapté. La page source est
  conservée telle quelle.

## Ce qui existe déjà (réutilisé, PAS réécrit)

- `src/features/export/relayoutMultiFormat.ts` — descripteurs %, placement LLM
  cover/contain, schémas Zod/JSON.
- `src/features/export/relayoutToFormats.ts` — orchestrateur : 1 appel LLM
  (`design.relayoutMultiFormat`) pour N formats cibles, **repli homothétique
  `projectObjectsToFormat` garanti** (ne lève jamais).
- `src/features/export/useDeclineToPages.ts` — `declineToPages(targets)` :
  rend la page source en PNG (viewport neutralisé), appelle l'orchestrateur, crée
  **une page éditable par cible**. Accepte **déjà** un tableau de cibles arbitraires
  (`DeclineTarget = { id, label, w, h }`).
- `src/features/export/declineLayout.ts` — `projectObjectsToFormat` (homothétie
  contain + centrage) et `DECLINE_TARGETS`.

Conséquence : **aucun nouveau fichier moteur, aucune nouvelle tâche LLM**. La feature
est une fine couche d'orchestration UI au-dessus de `declineToPages`, avec une cible
unique = le format choisi.

## Architecture

### Flux

1. Utilisateur applique un nouveau format dans `PagePanel` (clic preset, ou
   blur/Enter sur largeur/hauteur).
2. Si la **règle de déclenchement** (ci-dessous) est satisfaite :
   - on construit une cible unique `{ id, label, w, h }` à partir du format choisi
     (px = pt canvas, unité native du moteur) ;
   - on appelle `declineToPages([target])` (avec navigation vers la page créée, cf.
     §« Navigation ») sous un toast de progression *« Adaptation IA du format… »* ;
   - la page source garde son format et son contenu ; une nouvelle page adaptée est
     créée et devient la page courante.
3. Sinon (cas « setup d'un doc vide » / format inchangé) : comportement actuel —
   `setCanvasSize` retaille la page courante en place, sans IA.

### Règle de déclenchement (anti-spam, comportement sensé)

L'auto-reformat IA se déclenche **uniquement si** :

- la page courante contient **au moins un objet de design** (hors grille / marques de
  coupe / fond de page) — sur une page vide ou quasi vide, rien à adapter : on retaille
  simplement en place (évite de polluer un doc en cours de création de pages
  parasites) ; **et**
- les dimensions cibles **diffèrent réellement** des dimensions courantes (comparaison
  sur valeurs arrondies) — un blur sans changement ne déclenche rien.

**Idempotence du format** : ré-appliquer le **même** format cible **met à jour la
dernière page adaptée de ce format** au lieu d'en empiler une nouvelle. Repère : une
page adaptée porte un marqueur (`page.label` = label de cible, ou un `id` de cible
déterministe `reformat-<w>x<h>`). Si une page adaptée de mêmes dimensions existe déjà
en fin de liste, on la régénère ; sinon on en crée une.

### Cibles : du format → `DeclineTarget`

- Preset : `label` = nom du preset (« A4 Paysage »), `id` = `reformat-<w>x<h>`,
  `w/h` = dimensions du preset (pt).
- Saisie mm : `label` = `"<largeur> × <hauteur> mm"`, `id` = `reformat-<w>x<h>`,
  `w/h` = mm convertis en pt via `mmToCanvasPx`.

### Navigation vers la page adaptée

`declineToPages` revient aujourd'hui sur la page source (`setCurrentPage(originalIndex)`)
car c'est un export par lot. Pour cette feature on veut **afficher** la page adaptée.
Deux changements :

1. **`useDeclineToPages`** : ajouter une option `navigateToLast?: boolean`. Quand
   vraie, après création, on navigue vers la dernière page créée au lieu de revenir à
   la source. La navigation passe par `usePageNavigation.navigateToPage` (pour charger
   le `canvasJSON` et synchroniser le store), pas par un simple `setCurrentPage`.
2. **`usePageNavigation.navigateToPage`** (correctif requis) : appliquer
   `newPage.width/height` au canvas via `setCanvasSize` quand ils sont présents.
   Actuellement la navigation charge le `canvasJSON` mais **laisse le canvas aux
   dimensions précédentes** — bug latent : sans ce correctif, la page adaptée
   s'afficherait avec les dimensions de la page source. Le correctif est général
   (toute navigation entre pages de formats différents en bénéficie).

### `PagePanel` — point de branchement

- `applySize(wPt, hPt)` devient le point de décision : il évalue la règle de
  déclenchement et route soit vers le re-layout IA (nouvelle page), soit vers le
  `setCanvasSize` en place actuel.
- L'appel IA est asynchrone : état de chargement local (désactive les boutons de
  preset + champs pendant l'adaptation) + toast Sonner de progression/résultat.
- Pas de logique métier lourde dans le composant : l'évaluation de la règle et la
  construction de la cible vivent dans un petit hook `useReformatPage` (features/export)
  qui encapsule `declineToPages` + la règle + le toast. `PagePanel` ne fait qu'appeler
  `reformatPage(target)` ou retomber sur `setCanvasSize`.

## Repli & robustesse

- **Sans clé LLM / budget épuisé / image illisible (CORS)** : `relayoutToFormats`
  (et le repli interne de `declineToPages`) garantissent une homothétie
  `projectObjectsToFormat` — le contenu est mis à l'échelle « contain » + centré sur la
  nouvelle page, jamais bloqué. Le toast signale « adaptation géométrique (IA
  indisponible) » quand `usedFallback` est vrai.
- **Annulation** : la création de page reste annulable via le ring-buffer de snapshots
  auto déjà en place ; la page source n'étant jamais mutée, le risque de perte est nul.
- **Piège viewport** (déjà géré dans `renderSourceDataUri`) : ne pas réintroduire un
  `toDataURL` sur canvas live sans neutraliser `viewportTransform` + dimensions DOM.

## Découpage des unités

| Unité | Rôle | Dépend de |
|------|------|-----------|
| `useDeclineToPages` (modifié) | option `navigateToLast` ; navigation via `navigateToPage` | `relayoutToFormats`, `usePageNavigation`, stores pages/ui |
| `usePageNavigation` (correctif) | appliquer `width/height` de la page au canvas | `setCanvasSize`, fabric |
| `useReformatPage` (nouveau, mince) | règle de déclenchement + construction cible + toast + idempotence format | `useDeclineToPages` |
| `PagePanel` (branchement) | router `applySize` → IA ou `setCanvasSize` ; état de chargement | `useReformatPage` |

## Tests

- **`declineLayout.test.ts`** (existant) : inchangé, couvre l'homothétie de repli.
- **Règle de déclenchement** (nouveau test pur, extraire la règle dans une fonction
  testable) :
  - page vide → pas de re-layout (retaille en place) ;
  - dims identiques → pas de re-layout ;
  - page avec contenu + dims différentes → re-layout demandé ;
  - cible identique à une page adaptée existante → mise à jour, pas d'empilement.
- **Navigation** : test que `navigateToPage` applique `width/height` au canvas (via
  un mock `setCanvasSize` / état store).
- **Smoke test visuel manuel** (clé LLM réelle requise — la qualité IA n'est pas
  vérifiable sans budget, cf. mémoire `project_declinees_relayout_llm`) : la tuile
  produit seule (screenshot de réf) passée en A1 paysage → nouvelle page A1, contenu
  replacé/agrandi cohéremment, fond remplissant, objets éditables, page A4 d'origine
  intacte. À ajouter à `docs/TESTS-A-FAIRE.md`.

## Hors périmètre (YAGNI)

- Système d'ancrage per-objet (pins top/bottom/left/right) façon contraintes InDesign :
  le re-layout sémantique LLM couvre déjà le besoin ; pas de pins manuels pour l'instant.
- Re-layout *continu* pendant la frappe des dimensions : on ne déclenche que sur un
  *Appliquer* effectif (blur/Enter/preset) avec changement réel.
- Adaptation in-place de la page courante : explicitement écartée (décision « nouvelle
  page, original intact »).
