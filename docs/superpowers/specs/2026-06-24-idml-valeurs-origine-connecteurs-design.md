# Import IDML : afficher les valeurs d'origine + connecteurs de champs

> Conception — 2026-06-24
> Révision de l'affichage de la Phase 1 du balisage XML (`2026-06-24-idml-xml-tagging-design.md`).

## Problème

À l'import d'un IDML balisé, le parser remplace le contenu balisé par `{{champ}}` **dans le
texte visible** (ex. `flattenXmlElementStory`). Résultat : la maquette affiche
`{{PRIX_NORMAL}}`, `{{Marques}}`, `{{Description}}`… par-dessus le visuel — **illisible et pas
professionnel**. Le maquettiste veut voir **le document d'origine** (les vraies valeurs) et
consulter le mapping bloc→champ **ailleurs** (panneau, tooltip, badge, liste).

C'est un revirement assumé du choix Phase 1 (`{{}}` interne) : le mapping doit être une
**métadonnée**, pas du texte affiché.

## Décisions validées (brainstorming)

- **Afficher la valeur d'origine** dans le bloc ; cacher le `{{champ}}` en métadonnée.
- **Connecteurs visibles** via **4 modes** (Phase B) : panneau de droite, tooltip au survol,
  badge permanent discret, liste globale des connexions.
- **Enchaînement** : Phase A (valeurs lisibles) **puis** Phase B (les 4 connecteurs), d'affilée.

## Principe directeur (le merge ne change pas)

Le moteur de fusion lit déjà `obj.data.templateText` **en priorité** sur `obj.text`
(`useDataMerge.applyRow` ; `resolveText` gère le multi-`{{}}`). Donc :
- `obj.text` = **valeur d'origine** (affichée) ;
- `obj.data.templateText` = `{{champ}}` (consommé par le merge) ;
- `obj.data.mergeFields` = liste des champs du bloc (pour l'UI).

À la connexion d'une source, `applyRow` écrit les valeurs de la data ; sans source, la maquette
reste lisible (valeurs d'origine). **Zéro modification du moteur de fusion.**

## Phase A — Afficher les valeurs d'origine

### Parsing
- **`xmlElementStory.ts`** : ajouter un mode « valeur » à `processXmlElementStory` — unwrap les
  `<XMLElement>` **en conservant le contenu d'origine** (ne PAS remplacer par `{{champ}}`).
  Le mode « template » existant (remplacement) reste pour produire le `templateText`.
- **`idmlParser.ts`** : pour chaque story balisée, produire **deux** jeux de paragraphes —
  valeurs (mode « valeur ») et template (mode « template ») — alignés par index (même structure
  de paragraphes ; seul le contenu des feuilles diffère). Exposer sur `IdmlObject` :
  `templateParagraphs?` (parallèle à `paragraphs`) + `mergeFields?: string[]` (champs distincts).
- **`idmlToFabric.ts`** : `obj.text` = `fullText` construit depuis `paragraphs` (valeurs) ;
  `data.templateText` = `fullText` construit **de la même façon** depuis `templateParagraphs`
  (pour que `resolveText`/`remapStyles` opèrent sur un texte identique en structure) ;
  `data.mergeFields` = champs extraits. Jumeau du pattern `ecImageField` déjà en place.
- **Images** : déjà gérées par `data.ecImageField` (Phase 1) ; ajouter le champ à
  `data.mergeFields` pour la cohérence d'affichage des connecteurs.

### Persistance (à sécuriser)
`data.templateText`/`data.mergeFields` doivent **survivre à la sauvegarde Firestore**
(sérialisation du canvas). Vérifier au plan que `data` (ou ces clés) est inclus dans
`toObject`/`propertiesToInclude` du canvas ; sinon l'ajouter — sans quoi le merge casse après un
reload. **Bloquant pour Phase A.**

### Cas limites
- **Bloc multi-champ** (ex. `Libelle_Article` + `Marques` + `Description`) : `obj.text` = les 3
  valeurs d'origine sur leurs lignes ; `data.templateText` = `{{Libelle_Article}}\n{{Marques}}\n
  {{Description}}` ; `data.mergeFields` = les 3 noms. `resolveText` les résout tous.
- **Texte + statique mêlés** (ex. `{{Réduction}}%`) : la valeur d'origine garde le `%` ;
  `data.templateText` garde `{{Réduction}}%`.
- **Run-splitting** (Prix en 4 runs) : le mode « valeur » recolle « 22€,99 » (styles
  per-caractère préservés via le clone profond déjà en place).
- **EasyCatalog** : le chemin EC (`parseEcTag`, bloc inline du parser) injecte aussi `{{}}` dans
  le texte. **Hors périmètre immédiat** (le besoin porte sur le balisage XML natif) ; aligner EC
  sur le même comportement est une évolution notée. À défaut, EC reste en `{{}}` (inchangé).

## Phase B — Connecteurs de champs (4 modes)

Tous alimentés par `data.mergeFields` (et `data.ecImageField` pour les images). Purement
additif, ne touche pas le parsing.

1. **Panneau de droite** (`PropertiesPanel.tsx`) : section « Connecteur IDML » affichée quand le
   bloc sélectionné porte `mergeFields` ; liste le(s) champ(s). Lecture directe du canvas Fabric
   (`collectObjectsDeep`), pas besoin de synchroniser le store.
2. **Tooltip au survol** : composant `FieldBadge` (pattern `TransformBadge` :
   `getBoundingRect` + `viewportTransform`) → badge « champ : Prix » au survol d'un bloc balisé.
3. **Badge permanent discret** : pastille/contour léger sur les blocs balisés, **activable** via
   un toggle (préférence éditeur). Discret, ne gêne pas l'édition.
4. **Liste globale des connexions** : panneau listant tous les blocs balisés de la page →
   leur(s) champ(s) (vue d'ensemble), avec sélection du bloc au clic.

## Architecture / unités

- `src/features/idml/xmlElementStory.ts` — mode « valeur » (modif).
- `src/features/idml/idmlParser.ts` — double-jeu de paragraphes + `mergeFields` (modif).
- `src/features/idml/idmlToFabric.ts` — pose `data.text`/`templateText`/`mergeFields` (modif).
- (persistance) le module de sérialisation/sauvegarde du canvas — inclure `data` (modif si besoin).
- `src/components/panels/…` — section « Connecteur IDML » (Phase B).
- `src/components/canvas/FieldBadge.tsx` — tooltip survol (Phase B, nouveau).
- badge permanent + liste globale (Phase B, nouveaux composants).

## Tests

- **Parsing (Vitest)** : un IDML balisé (fixture Monoprix) →
  - `obj.text` contient la **valeur** (« 22 », « +55g GRATUIT »…) et **pas** `{{`.
  - `obj.data.templateText` contient `{{Prix}}` (et le multi-champ pour le bloc Article).
  - `obj.data.mergeFields` liste les bons champs.
  - non-régression : le merge (`resolveText(templateText, row)`) produit la valeur de la ligne.
- **Persistance** : sérialiser→désérialiser un objet balisé conserve `data.templateText`.
- **Phase B (UI)** : pas de test de composant (convention projet) ; validation par build + revue.

## Hors périmètre (ultérieur)

- Aligner le chemin **EasyCatalog** sur l'affichage des valeurs (même mécanique).
- Édition inline d'un bloc balisé : bascule entre valeur et template (le comportement actuel au
  disconnect/édition montre déjà le template — à harmoniser si besoin).
- Réorganisation des connecteurs (drag pour reconnecter un bloc à un autre champ).
