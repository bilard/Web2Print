# Spec — Correspondance des champs éditable + champs libres (Catalogue studio & Création studio)

> Date : 2026-07-04
> Modules : `src/features/catalog/` (Catalogue studio) et `src/features/retail-promo/` (Création studio)
> Objectif : permettre à l'utilisateur (1) de **corriger** quelle colonne source alimente un champ de fiche, et (2) d'**ajouter des champs libres** (colonnes riches : Caractéristiques, Normes, Colis, SEO…) affichés sur la fiche — dans les **deux** modules.

## Contexte / état actuel (vérifié dans le code)

- Les deux modules **partagent** la couche `src/features/retail-promo/promoMapping.ts` (`defaultPromoFieldMap`, `matchColumn`, `extractPromoFields`) et le type `PromoFields` / `PromoFieldKey` (`promoTypes.ts`).
- **Catalogue studio** n'a **aucune UI** de correspondance des champs de fiche. Le `fieldMap` est deviné et **re-deviné/écrasé à chaque boot** dans `CatalogBuilderPage.tsx` (« le devinage est la seule source de vérité »). La carte « Mapping » de l'étape Structure ne mappe que la **taxonomie** (niveaux Univers/Famille/Sous-famille), pas les champs de fiche.
- **Création studio** a une UI de mapping (`steps/StepMapping.tsx`) mais limitée à **16 slots FIXES** codés en dur (`FIELD_LABELS`). Désync connue : `ean`, `mentions`, `enseigne`, `unit` sont **mappables mais jamais rendus** (`toCardData` ne les lit pas).
- Le rendu est **spécifique à chaque module** : `ProductCell.tsx` (Catalogue) vs `RetailPromoCard.tsx` (Création, via `toCardData` → `RetailCardData`). Les blocs de rendu de Création sont des **unions typées fermées** (`PromoBlockId`, `PromoColorKey`) + 8 `Record<PromoBlockId, …>` dans `PromoTemplateConfig`.

## Décisions cadrées (brainstorming)

1. **Périmètre** : les deux modules, les deux capacités (mapping éditable + champs libres).
2. **Champs libres — rendu** : **bloc « Détails » groupé** (une liste `label : valeur`), stylable/déplaçable comme UN bloc. On **n'ouvre pas** les unions typées de Création vers du `Record<string,…>` (rejeté : chantier lourd/risqué). Les blocs individuels déplaçables sont hors périmètre (évolution future éventuelle).
3. **Désync Création** : on **affiche** les slots déjà mappables mais orphelins (`mentions`, `unit`, `enseigne`, `ean`).

## Architecture

### Socle commun — `src/features/retail-promo/`

- **`promoTypes.ts`**
  - `PromoFields` reçoit `extra?: Record<string, string>` (id de champ libre → valeur lue dans la ligne).
  - Nouveau type exporté `CustomField = { id: string; label: string; column: string }` et `CustomFieldMap = CustomField[]`. `id` = slug stable généré à la création (pas d'index positionnel). `label` = **identifiant côté éditeur uniquement** (aide à repérer la colonne), **non rendu** sur la fiche.
- **`promoMapping.ts`**
  - `extractPromoFields(row, columns, fieldMap, customFields?: CustomFieldMap)` — nouveau 4e paramètre **optionnel** (rétro-compatible). Peuple `f.extra[cf.id] = str(cf.column)` pour chaque champ libre dont la colonne est renseignée et la valeur non vide.
  - `defaultPromoFieldMap` inchangé (devinage des slots fixes uniquement).
- **`promoCardData.ts`**
  - `toCardData(f, customFields?)` passe `extra` → `details: string[]` (**valeurs seules, sans label** ; l'ordre suit `customFields`, valeurs vides omises). Le param `customFields` sert uniquement à l'**ordre** ; le `label` de `CustomField` n'est **pas** rendu (identifiant d'éditeur uniquement).
  - Ajoute au `RetailCardData` : `unit`, `mentions`, `enseigne`, `ean` (fix désync) + `details`.

### Volet Catalogue studio — `src/features/catalog/`

- **Données / store** (`catalog.store.ts`, `catalogTypes.ts`)
  - Nouveau champ `fieldMapOverrides: Partial<Record<PromoFieldKey, string>>` (choix manuels de l'utilisateur).
  - Nouveau champ `customFields: CustomFieldMap`.
  - Le `fieldMap` **effectif** = `{ ...defaultPromoFieldMap(colonnes), ...fieldMapOverrides }`. Setter `setFieldMapOverride(key, column | null)` (null = revenir au devinage) qui met à jour `fieldMapOverrides` **et** recalcule `fieldMap`.
  - Setters `setCustomFields` / `addCustomField` / `removeCustomField` / `updateCustomField`.
  - `toDoc` / `hydrate` / `partialize` : persistent `fieldMapOverrides` + `customFields`.
- **Fin de l'écrasement auto** (`CatalogBuilderPage.tsx`)
  - Le bloc « re-devine et écrase `fieldMap` » est remplacé : à chaque boot on recalcule `fieldMap = { ...guess(colonnes), ...fieldMapOverrides }`. → l'auto-réparation continue sur les champs **non** surchargés, mais un choix manuel gagne toujours et survit aux réouvertures.
- **UI mapping** (étape Structure, `components/steps/StepStructure.tsx`)
  - Nouvelle carte **« Correspondance des champs »** à côté de « Mapping des niveaux » et « Format ». Un `<select>` de colonne par champ de fiche réellement rendu par `ProductCell` : `name, image, newPrice, oldPrice, brand, ref, unit, description`. Chaque changement → `setFieldMapOverride`. Un lien « Auto » par ligne = `setFieldMapOverride(key, null)`.
  - Section **« Champs supplémentaires »** (add/nommer/choisir colonne/supprimer) → `customFields`.
  - Réutilise le composant partagé `CustomFieldsEditor` (voir ci-dessous).
- **Rendu** (`components/pages/ProductCell.tsx`, `catalogCss.ts`)
  - Nouvelle zone `.cat-cell-details` (liste de **valeurs seules**, une par ligne) sous la description, alimentée par `extractPromoFields(..., customFields).extra` dans l'ordre de `customFields`.
  - `CatalogCardStyle` reçoit un toggle `showDetails` (Éléments affichés) + une échelle `detailsScale` (Style des fiches → typo par champ) → var CSS `--cat-s-details`. Font-size en `calc(Npx * var(--cat-s-details) * ${F})` (règle `${F}` obligatoire, cf. typoFit).
  - `ProductGridPage.tsx` passe `customFields` (depuis le plan/store) à `extractPromoFields`.

### Volet Création studio — `src/features/retail-promo/`

- **Store** (`retailPromo.store.ts`) : nouveau `customFields: CustomFieldMap` + setters ; inclus dans le payload `promosApi` (`stripUndefined`).
- **UI mapping** (`steps/StepMapping.tsx`)
  - `FIELD_LABELS` inchangé (16 slots fixes).
  - Nouvelle section **« Champs supplémentaires »** = `CustomFieldsEditor`.
- **Rendu** (`RetailPromoCard.tsx`, `promoCardData.ts`)
  - **Un seul** nouvel id `details` ajouté à l'union `PromoBlockId` (bloc groupé). Il participe automatiquement aux `Record<PromoBlockId, …>` existants (offsets/scales/styles/blockFills/shapes/hidden/rules) → stylable/déplaçable **en tant que bloc entier**, sans refonte.
  - Rendu `.rp-details` = liste de **valeurs seules** (une par ligne) depuis `data.details: string[]`.
  - Fix désync : afficher `unit` (près du prix), `mentions` (pied), `enseigne`, `ean` selon leur emplacement naturel. Ajout des ids de bloc/couleur correspondants **uniquement** si l'on veut les styler séparément — sinon rattachés au pied/prix existants (à trancher en impl, défaut : rattachés, zéro nouvel id hormis `details`).

### Composant partagé — `CustomFieldsEditor`

- Emplacement : `src/features/retail-promo/components/CustomFieldsEditor.tsx` (les deux modules l'importent ; le catalogue importe déjà `promoMapping` de retail-promo — précédent établi).
- Props : `customFields: CustomFieldMap`, `columns: MergeColumn[]`, `onChange(next: CustomFieldMap)`.
- UI : liste de lignes (label éditable + `<select>` colonne + supprimer) + bouton « + Ajouter un champ ». `id` généré par slug du label à la création (unicité garantie par suffixe si collision).
- ≤ 150 lignes.

## Flux de données (résumé)

```
source (colonnes)
  ├─ defaultPromoFieldMap(colonnes)  ─┐
  ├─ fieldMapOverrides (Catalogue)  ─ ┼─► fieldMap effectif ─┐
  └─ customFields (les 2 modules) ─────────────────────────► extractPromoFields(row, colonnes, fieldMap, customFields)
                                                                     └─► PromoFields{ …, extra }
                                                                            ├─ Catalogue: ProductCell (.cat-cell-details)
                                                                            └─ Création: toCardData(f, customFields) → RetailCardData.details → .rp-details
```

## Tests (moteurs purs, Vitest)

- `promoMapping.test.ts` : `extractPromoFields` peuple `extra` depuis `customFields` (colonne présente → valeur ; colonne absente/vide → clé omise) ; signature à 3 params reste identique (rétro-compat).
- `promoCardData.test.ts` (nouveau ou étendu) : `toCardData(f, customFields)` produit `details` (valeurs seules) dans l'ordre de `customFields`, vides omises ; expose `unit/mentions/enseigne/ean`.
- `catalog.store.test.ts` : `setFieldMapOverride(key, col)` puis recompute → `fieldMap` = merge ; `setFieldMapOverride(key, null)` revient au devinage ; overrides survivent à un re-boot simulé (le devinage ne les écrase pas).
- Non-régression : tests existants catalog/retail-promo restent verts.

## Hors périmètre (YAGNI)

- Blocs de champs libres **individuellement** déplaçables/stylables dans Création (option rejetée).
- Devinage automatique des champs libres (l'utilisateur nomme/choisit ; pas d'alias GUESS pour l'extra).
- Ordre drag&drop des champs libres (ordre = ordre d'ajout ; réordonnancement = évolution).
- Mapping éditable des **niveaux** de taxonomie (déjà existant, inchangé).

## Livraison (phasée, commit + deploy à chaque étape)

1. **Socle commun** : types + `extractPromoFields` 4e param + `toCardData` + tests. (Aucun changement visible.)
2. **Catalogue — mapping éditable** : `fieldMapOverrides`, fin de l'écrasement, carte « Correspondance des champs ». → commit + build + `firebase deploy --only hosting` + smoke live.
3. **Catalogue — champs libres** : `customFields`, `.cat-cell-details`, toggle+échelle. → commit + deploy + smoke.
4. **Création — champs libres + désync** : section StepMapping, bloc `details`, affichage unit/mentions/enseigne/ean. → commit + deploy + smoke.

Chaque étape : `npx tsc -b` + `npm run test:run` + `npm run lint` + `npx knip` verts avant commit.
