---
name: translate
description: Porte au catalogue les textes d'interface encore en dur, puis met à jour les catalogues ANGLAIS et ESPAGNOL. À lancer avec `/translate` (sans argument = les écrans les plus exposés) ou `/translate <chemin ou module>`.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# Traduction de l'interface — EN (UK) + ES

Cible demandée : $ARGUMENTS

## Ce que ce skill garantit

Une chaîne visible par l'utilisateur vit dans `src/lib/i18n/fr.ts` et n'apparaît
JAMAIS en dur dans un composant. Les catalogues `en.ts` et `es.ts` couvrent
exactement les mêmes clés — c'est vérifié par un test, pas par relecture.

⚠️ **L'anglais de ce produit est BRITANNIQUE** : `organisation`, `customise`,
`colour`, `centre`, `licence` (nom). Un catalogue en anglais américain passe
tous les tests et se voit à la première démonstration.

## Étape 1 — Mesurer

```bash
node scripts/i18n-scan-literals.mjs            # rapport lisible, par fichier
node scripts/i18n-scan-literals.mjs --json     # si besoin d'outiller
```

Ce script lit l'**AST TypeScript**, pas des expressions régulières : le texte
d'un bouton vit souvent seul sur sa ligne, sans `>` ni `<` autour, et une regex
ne le voit jamais. Cinq écrans entiers sont passés à travers deux passes
« propres » pour cette raison. Ne pas remplacer ce scan par un `grep`.

## Étape 2 — Porter au catalogue FR

```bash
node scripts/i18n-extract-literals.mjs <dossier> <préfixe> --dry   # inspecter
node scripts/i18n-extract-literals.mjs <dossier> <préfixe>         # appliquer
```

Le préfixe groupe les clés par écran (`rp` pour retail-promo, `ac` pour l'accès…).
Reprendre un préfixe existant plutôt que d'en inventer un par fichier.

⚠️ **Les FRAGMENTS de phrase coupés par une expression JSX ne sont pas traités**
et sont listés en fin de run. Les reprendre À LA MAIN, en une seule clé avec
paramètre :

```tsx
// ✗ deux clés → ordre des mots faux en espagnol, invisible pour tsc et les tests
Aucun modèle pour {name} — créez-en un depuis {link}
// ✓ une clé, un paramètre
{t('wf.noTemplateFor', { name })}
```

## Étape 3 — Traduire

```bash
node scripts/i18n-translate.mjs en
node scripts/i18n-translate.mjs es
```

Le FR est la source, l'EN sert d'appui pour l'ES : deux formulations lèvent
l'ambiguïté d'un libellé de deux mots (« Support » = assistance ou socle ?). Le
cache disque rend un run interrompu reprenable.

Les clés dont un jeton `{param}` s'est perdu sont **listées en fin de run** —
jamais remplacées en silence par du français. Les traiter avant de conclure.

Pour quelques clés seulement, les écrire à la main dans les trois catalogues :
lancer le script complet coûte des appels au modèle pour rien.

## Étape 4 — Vérifier

```bash
npx tsc -b                     # ⚠️ project references : `--noEmit` seul ne vérifie RIEN
npm run lint
npx vitest run src/lib/i18n/   # parité des catalogues + jetons {param}
```

Le typage refuse toute clé absente du catalogue : une chaîne affichée sans
traduction ne compile pas. C'est le vrai garde-fou.

## Étape 5 — Regarder l'écran

Basculer la langue dans l'application et parcourir les écrans touchés. Deux
défauts que ni `tsc` ni les tests ne voient :

- un libellé traduit qui **déborde** de son bouton (l'allemand et l'espagnol sont
  plus longs que le français) ;
- un `t()` appelé en **constante de module** : la langue est alors figée à
  l'import et ne suit plus le changement de langue.

## Pièges connus de ce dépôt

- **`t()` en constante de module = langue figée.** Appeler `t()` dans le rendu,
  ou passer par `useTranslation()` quand le composant doit se re-rendre.
- **Le vocabulaire de compte se superpose au catalogue** (`accounts/{id}/i18nOverrides`).
  Un client peut avoir réécrit un mot : ne pas s'étonner qu'un libellé traduit
  s'affiche autrement en production.
- **Un identifiant de regroupement n'est pas un libellé.** `PermissionDef.module`
  ou une clé d'énumération ne se traduisent pas : elles indexent du code.
  L'affichage passe par une table dédiée (`MODULE_LABEL`).
- **Pulse et radarPrice restent en français** — décision explicite, ne pas les
  traduire.

## Terminer

Commit avec le nombre de littéraux traités, puis
`npm run build && firebase deploy --only hosting`.
