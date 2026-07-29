# Traduction de l'application en anglais britannique — état et plan

> Rédigé le 29/07/2026. Chiffres mesurés sur `src/` à cette date.

## Le constat qui commande tout

**L'application n'avait aucune couche i18n.** Tous les textes étaient écrits en dur
en français dans les composants. Il n'existait donc pas de fichier `en` à « passer
en orthographe UK » : le sujet n'est pas une traduction, c'est une **extraction**.

Le multilingue qui existait déjà (EN/ES/DE/IT) ne couvre que les **pages statiques**
hors SPA — `site-web/`, `/docs/`, `/promo/`, `/presentation/` — via
`scripts/docs-i18n/build.mjs`. Il ne touche pas `src/`.

## Ampleur mesurée

| Indicateur | Valeur |
|---|---|
| Lignes de code dans `src/` | 210 434 |
| Fichiers contenant du français | 1 282 (515 `.tsx` + 767 `.ts`) |
| **Littéraux de chaînes en français** | **6 452** |
| — dont en zone interdite (voir buckets 2–3) | 917 (72 fichiers) |
| — **candidats réels à la traduction** | **~5 535** |
| Commentaires en français | 11 981 — *hors périmètre* (internes, invisibles) |
| Toasts (`toast.*`) | 226 |
| `placeholder` / `title` / `aria-label` | 309 |

## Les quatre buckets

Le point critique : **tout ce qui est en français n'est pas à traduire.** Une passe
mécanique (`sed` sur les chaînes accentuées) corromprait les buckets 2 à 4 **en
passant `tsc -b`, le lint et les tests** — la panne serait silencieuse et n'apparaîtrait
qu'en production, sur les données client.

### Bucket 1 — À traduire (~5 535 chaînes)
Texte JSX, `placeholder`, `title`, `aria-label`, toasts, libellés de menu
(`modules.ts`), messages d'erreur.

Fichiers les plus denses : `features/help/content/*.tsx` (aide), `VideoModal.tsx`,
`workflows/registry/*Nodes.tsx`, `panels/PropertiesPanel.tsx`, `panels/PrintPanel.tsx`.

### Bucket 2 — ⛔ NE JAMAIS TRADUIRE : clés de données
Ces littéraux français sont des **clés de reconnaissance de colonnes de fichiers
clients**. Les traduire casse le mapping automatique de tous les fichiers français.

Cas prouvé — `src/features/retail-promo/promoMapping.ts` :
```ts
oldPrice: ['prix_barré', 'prix barré', 'ancien prix', 'prix conseillé', …]
unit:     ['unité de vente', 'conditionnement', 'colisage', 'vendu par', 'uv']
ref:      ['référence', 'code article', 'n° article', …]
```
Autres sites concernés : `priceWatch/catalog/match.ts`, `priceWatch/catalog/compareColumns.ts`,
`workflows/registry/compareCatalogNode.ts`, `workflows/registry/listProductsNode.ts`,
`excel/formulaEngine.ts`, `catalog/components/steps/StepFieldMapping.tsx`.

Rappels de conception déjà documentés : le mapping de colonnes exige l'**égalité
exacte**, les clés de jointure sont **par site**, et un `watchId` doit correspondre
**à l'octet près**. Une divergence ⇒ 0 produit apparié, **sans erreur**.

### Bucket 3 — ⛔ NE JAMAIS TRADUIRE : prompts LLM
36 fichiers de prompts/briefs + 21 gabarits. Changer la langue d'un prompt change
la sortie du modèle. Concerne notamment les deux canaux de prompt du catalogue
(brief **et** consignes créa).

### Bucket 4 — ⛔ NE JAMAIS TRADUIRE : littéraux discriminants
Noms de champs Firestore, valeurs d'enum, toute chaîne comparée avec `===` ou
servant de clé d'objet.

### Cas limite à traiter explicitement
Une chaîne qui est **à la fois** libellé affiché **et** clé de données. Il faut alors
**découpler l'affichage de la clé** avant de traduire — jamais traduire sur place.

## Décision : un seul locale `en`, écrit en britannique

Puisqu'il n'existait aucun `en`, le choix était libre. **Ne pas créer `en` + `en-GB`** :
deux catalogues parallèles divergent en quelques semaines. Un seul catalogue `en`,
rédigé en orthographe britannique.

Règles appliquées : `-ise`/`-isation` (jamais `-ize`), `colour`, `behaviour`, `centre`,
`licence` (nom), `catalogue`, dates **JJ/MM/AAAA** (`en-GB`, pas `en-US`).

## Ce qui est livré (pilote)

| Fichier | Rôle |
|---|---|
| `src/lib/i18n/fr.ts` | Catalogue FR — **source de vérité**, exporte `TranslationKey` |
| `src/lib/i18n/en.ts` | Catalogue EN britannique, typé `Record<TranslationKey, string>` |
| `src/lib/i18n/index.ts` | `translate()`, `useTranslation()`, `intlLocale()`, `formatDate()` |
| `src/stores/locale.store.ts` | Langue courante, persistance, `<html lang="en-GB">` |
| `src/components/shared/LocaleSwitcher.tsx` | Bascule FR/EN |
| `src/lib/i18n/i18n.test.ts` | 8 tests — parité, variables, **garde-fou UK** |
| `src/pages/LoginPage.tsx` | Écran pilote intégralement migré |

### Deux garde-fous qui rendent l'erreur impossible plutôt qu'improbable

1. **Clé manquante = erreur de compilation.** `en` est typé
   `Record<TranslationKey, string>` : oublier une clé casse `tsc -b`. Un écran ne
   peut pas se retrouver à moitié traduit.
2. **Graphie américaine = test rouge.** Le test `orthographe britannique` rejette
   `color`, `center`, `catalog`, `behavior`, `analyze`, `license` et une liste
   explicite de verbes en `-ize` (`organize`, `customize`, `centralize`…).

   ⚠️ **Pas de règle générique `\w+ize`** : la terminaison `-ize` est légitime en
   anglais britannique (`size`, `resize`, `prize`, `seize`, `capsize`). Dans une
   application de mise en page, `size` et `resize` sont *certains* d'apparaître —
   une règle large rendrait la suite rouge sur une clé correcte, et le réflexe
   serait de supprimer le garde-fou, donc de perdre la contrainte UK.

   *Validé dans les deux sens* : « Centralized color data, customize the center
   catalog » fait bien échouer la suite (4 détections), tandis que « Page size »,
   « Resize image » et « Seize the prize » passent. Les barrières fail-open sont
   un piège connu du projet — un garde-fou non éprouvé ne vaut rien.

Un troisième test verrouille les variables interpolées : un `{count}` perdu à la
traduction n'est pas une erreur de type, il s'affiche tel quel. Seul ce test l'attrape.

### Détail non évident
L'état d'erreur de `LoginPage` mémorise la **clé** (`TranslationKey`) et non le
message. Sans cela, un message déjà affiché resterait figé dans la langue d'origine
au changement de langue.

## Coût mesuré et suite

Le pilote — 30 chaînes, un écran complet + le sélecteur — donne l'ordre de grandeur.
Rapporté aux ~5 535 chaînes du bucket 1, le chantier est de l'ordre de **150 à 200
écrans/panneaux**, à mener **module par module**, chaque lot vérifié par
`npx tsc -b` + `npm run lint` + `npm run test:run`.

Ordre conseillé, du plus visible au plus profond : Dashboard → navigation
(`modules.ts`) → panneaux de l'éditeur → PIM/DAM → Workflows → Veille tarifaire →
contenus d'aide (`features/help/content/`, les plus volumineux).

Points restant à traiter, hors chaînes de composants :
- **Formats** : brancher `formatDate`/`Intl` là où les dates sont aujourd'hui formatées à la main.
- **Données Firestore** et **sorties LLM** : ne sont dans aucun catalogue de langue.
- **Pages statiques** (`site-web/`, `/docs/`, `/promo/`) : circuit multilingue distinct.
- `translate()` hors composant : un helper `t()` avait été écrit puis retiré (aucun
  appelant ⇒ `npm run dead`). À réintroduire au premier besoin réel côté store/service.
