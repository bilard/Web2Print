---
name: nettoyage
description: Nettoyage en profondeur du code — mesure la dette avec `npm run audit`, puis traite un chantier ciblé (bruit, code mort, cycles, fichiers obèses, `any`) par lots vérifiés et commités. À lancer avec `/nettoyage` (sans argument = choisir le chantier le plus rentable) ou `/nettoyage <cible>`.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# Nettoyage en profondeur

Chantier demandé : $ARGUMENTS

## Principe directeur

**Mesurer, puis traiter un seul chantier à fond.** Un « nettoyage général » sur
200 000 lignes ne converge pas : il produit un diff illisible et des régressions
invisibles. Chaque exécution de ce skill traite UN chantier, en lots vérifiés et
commités séparément.

**Ne jamais supprimer ce qu'on n'a pas compris.** Dans ce dépôt, l'essentiel des
commentaires encode des règles métier, des pièges de sites scrapés et des
contraintes de parité client/serveur. Ce sont les informations les plus chères
du dépôt. Un commentaire ne se supprime que s'il est *redondant avec le code*,
jamais parce qu'il est long.

## Étape 1 — Mesurer (toujours en premier)

```bash
npm run audit          # rapport complet (~2 min)
npm run audit:fast     # sans la détection de duplication
```

Le rapport distingue :

- **BARRIÈRES** — types, lint, tests, code mort (knip), dépendances circulaires.
  Elles sont à **zéro** et doivent le rester. Une barrière franchie se corrige
  AVANT toute autre chose.
- **INDICATEURS** — fichiers obèses, `any`, `console.log`, TODO, duplication.
  Non bloquants : ils servent à choisir le chantier et à mesurer le progrès.

Noter les chiffres de départ : ils vont dans le message de commit.

## Étape 2 — Choisir le chantier

Sans argument, prendre le plus rentable dans cet ordre :

1. **Barrière franchie** — priorité absolue, rien d'autre ne compte.
2. **Fichiers > 400 lignes** — le plus gros gisement. Voir « Découper un
   fichier obèse » ci-dessous.
3. **`any`** — cibler un module entier (un dossier de `features/`), pas des
   occurrences éparses.
4. **Duplication** — deux détecteurs complémentaires :
   - `npm run dup` (jscpd) : blocs de 30 lignes et plus.
   - `npm run dup:symbols` : fonctions identiques d'un module à l'autre, **y
     compris courtes**. C'est celui qui compte : jscpd rate tout ce qui fait
     moins de 30 lignes, or c'est là que vivent les helpers recopiés.
     ⚠ Il normalise le mot-clé `export` avant de hacher — sans ça il ratait le
     cas le plus fréquent (canonique exportée / copie locale privée). Si vous
     le modifiez, gardez cette normalisation.

   Voir « Trois formes de doublon » plus bas : elles ne se traitent pas pareil.
5. **Bruit** — commentaires redondants avec le code, code mort décelé à la
   lecture.

Annoncer le chantier retenu et pourquoi, puis s'y tenir.

## Étape 3 — Travailler par lots vérifiés

Un lot = une transformation homogène (un fichier découpé, un module détypé
d'`any`, une famille de bruit supprimée).

Après **chaque** lot, dans cet ordre :

```bash
npx tsc -b          # ⚠ project references : `tsc --noEmit` ne vérifie RIEN
npm run lint        # doit rester à 0 warning
npm run test:run    # aucun test ne doit tomber (relever le total AVANT de commencer)
npm run dead        # knip : une extraction laisse souvent un export orphelin
```

Puis commiter le lot seul, avec les chiffres avant/après. Un lot qui ne passe
pas se corrige ou se `git checkout --` — jamais de commit rouge.

⚠ Si le total de tests **augmente**, c'est probablement un fichier de test
temporaire oublié dans `src/` : le retirer avant de commiter.

## Prouver qu'un lot est neutre

`tsc` et les tests prouvent que ça compile et que rien de couvert ne casse.
Ils ne prouvent PAS que la sortie est inchangée sur des données réelles — or
c'est ça, la question, dès qu'on touche à du parsing.

**Preuve de parité** — la méthode qui a servi à valider tout le refactoring du
moteur PIM :

1. Figer des entrées réelles en fixtures **hors du dépôt** (scratchpad), pour
   qu'elles survivent aux `git checkout`.
2. Écrire un test temporaire qui rejoue la chaîne complète sur ces fixtures et
   **sérialise le résultat en JSON**.
3. Le lancer sur `master`, puis `git checkout <commit d'avant>`, ajouter au
   besoin des `export` temporaires aux fonctions alors privées, relancer.
4. `diff` les deux JSON. Identique = neutre, avec preuve.
5. Retirer le test temporaire et revenir sur `master`.

Vérifier que l'instantané est **réellement peuplé** : deux sorties vides sont
aussi « identiques ».

⚠ **Ne pas construire un smoke sur des appels réseau live.** Beaucoup de sites
marchands renvoient une page anti-bot (Akamai) ou un CAPTCHA à Jina : le test
échoue pour une raison qui n'a rien à voir avec le code. Vérifier d'abord
qu'une URL répond (`curl` via `r.jina.ai`, chercher le champ `warning`), puis
figer son markdown en fixture.

## Découper un fichier obèse

Ordre d'extraction, du plus sûr au moins sûr :

1. **Types et constantes** → `<feature>Types.ts`. Gain immédiat : les modules
   non visuels cessent de tirer un composant React (et Fabric, et Three) pour
   un simple type. C'est la cause n°1 des dépendances circulaires ici.
2. **Fonctions pures** (calcul, formatage, CSS) → module dédié, testable seul.
3. **Logique métier d'un composant** → hook `use<X>` (convention du projet).
4. **Sous-composants** → uniquement en dernier, quand la frontière visuelle est
   évidente.

Ne PAS ré-exporter depuis l'ancien module « pour la compatibilité » : le cycle
resterait. Rerouter les consommateurs — `tsc -b` les liste tous.

**Extraire les dépendances d'abord.** Avant de sortir un gros bloc, lister ce
qu'il utilise et qui reste dans le fichier :

```bash
sed -n '<début>,<fin>p' <fichier> | grep -oE "\b(helper1|helper2|…)\b" | sort | uniq -c
```

Tant qu'il dépend de dix helpers restés sur place, l'extraction crée un
va-et-vient d'imports au lieu d'une frontière. Sortir ces helpers en lots
préalables, puis le bloc. Le bloc « fabricant » (1 546 l.) n'a été extractible
qu'au quatrième lot, une fois ses 8 dépendances placées dans des modules
propres.

Symétriquement, mesurer ce que le bloc expose **vers l'extérieur** — ce sont
les seuls symboles à exporter. Tout le reste doit rester privé (convention
CLAUDE.md, et knip le vérifie).

⚠ **Avant de créer un fichier, vérifier qu'il n'existe pas** (`ls`) : un
`promoTypes.ts` déjà présent a failli être écrasé lors du premier passage.

## Trois formes de doublon

Le détecteur les signale toutes pareil. Elles ne se traitent pas pareil. Dans
ce dépôt, elles opposent presque toujours le moteur PIM
(`excel/ai-enrichment/`) et `scraping/core/parsers/` — la version de
`scraping/core` est la **canonique**, c'est elle que couvrent les tests.

**1. Copie stricte** → dédoublonner directement. Corps identique au
commentaire près. Le risque est réel : un correctif appliqué d'un côté ne
s'applique pas de l'autre. Déjà corrigé ainsi : `isNavLikeDescription`,
`isMainlyGarbage`, `mergeGroupsIntoAdvantages`, `parseCharacteristicsBlob`.

**2. Façade pass-through** → supprimer l'indirection. Une fonction locale dont
le corps est `return xxxExternal(md)`, l'import canonique étant aliasé
`…External`. Trois trouvées. Elles sont pires qu'inutiles : un homonyme local
peut *shadower* l'export canonique et avaler silencieusement tous ses
correctifs — c'était arrivé, et le commentaire du code le racontait. Supprimer
la façade ET l'alias, pour qu'aucun homonyme ne puisse revenir.

**3. Copie amputée ou fork divergent** → **mesurer, puis décider**. Même nom,
corps différent. Ne pas fusionner à l'aveugle, mais ne pas fuir non plus :

- `diff` les deux fichiers **entiers**, pas seulement la fonction ;
- écrire un test jetable qui applique les deux versions aux mêmes entrées
  (fixtures réelles + cas témoins choisis pour cibler l'écart) et **compte ce
  qui changerait** ;
- si l'impact est nul sur les fixtures et que la canonique est strictement
  meilleure → fusionner, en documentant la mesure dans le commit ;
- si l'impact est réel → **s'arrêter et demander**. Ce n'est plus du nettoyage.

Exemple traité : `isGarbageContent` du PIM ne testait qu'une regex là où la
canonique en teste cinq. Mesure : 0 changement sur 2 fiches réelles, 6/6 cas
témoins désormais rejetés → fusionné.
Exemples laissés en l'état : `relatedUrls.ts` et `scrapeBundle.ts`, forks
divergents dont la fusion changerait le comportement du scraping.

## Codemods

Au-delà d'une dizaine de fichiers, écrire un script Node/Python dans le
scratchpad plutôt qu'éditer à la main. Toujours :

- un mode simulation par défaut, `--apply` pour écrire ;
- insérer un import **avant le premier `import`** du fichier, jamais après le
  dernier — une déclaration d'import multi-lignes serait coupée en deux ;
- découper par numéros de ligne : **supprimer les blocs du plus bas vers le
  plus haut**, sinon les indices suivants sont décalés ;
- assertions avant écriture (`assert 'nomAttendu' in bloc`), et écriture du
  fichier **après** toutes les assertions — un plantage laisse alors le dépôt
  intact ;
- relire le diff d'un fichier représentatif avant de généraliser.

Quand on supprime une fonction, vérifier qu'on n'a pas laissé son **docbloc ou
son titre de section orphelin** au-dessus de la suivante — c'est arrivé deux
fois, et le commentaire décrit alors le mauvais code.

## Supprimer un fichier

1. `git ls-files <chemin>` — s'il n'est pas suivi, la suppression est
   **irréversible**. Demander confirmation.
2. `grep -rn "<nom-sans-extension>" src functions/src scripts` — vérifier
   qu'aucune référence dynamique ne subsiste (knip ne voit pas les imports
   construits à la volée).
3. Les dossiers de données de travail (`IMPORTS/`, gitignoré, 148 Mo) ne se
   touchent JAMAIS sans demande explicite.

## À ne pas faire

- Toucher `src/components/ui/**` (shadcn), `src/lib/firebase/config.ts`,
  `public/fonts/`.
- Supprimer des commentaires qui expliquent un *pourquoi*, un piège de site
  scrapé ou une contrainte de parité serveur.
- Renommer pour renommer, ou introduire une abstraction pour un seul usage.
- Regrouper plusieurs chantiers dans un même commit.
- Lancer un déploiement : le nettoyage se commite, le déploiement se demande.

## Sortie attendue

Un résumé court : chantier traité, chiffres avant → après tirés de `npm run
audit`, liste des commits, et ce qui reste à faire sur ce chantier.
