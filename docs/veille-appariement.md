# L'appariement de la veille tarifaire — algorithme exact et leviers de pilotage

> État du code au 2026-08-08. Chaque règle est référencée `fichier:ligne` côté **client**.
> Le jumeau serveur (`functions/src/priceWatch/catalog/`) est identique hormis les imports
> et les modificateurs `export`, mais ses **numéros de ligne dérivent** (dans `keys.ts`,
> +1 avant la ligne 150, −1 après) : retrouver le symbole par `grep`, ne pas décaler.

Le module ne cherche pas le « meilleur » concurrent pour un produit : il cherche une
**preuve d'identité**, et s'arrête au premier candidat qui en fournit une sans être
démenti. Il n'y a **aucun score, aucun classement, aucun LLM** dans la boucle qui décide.
Principe directeur, écrit partout dans le code : *un trou vaut mieux qu'un faux prix*.

---

## 1. Vue d'ensemble — qui apparie, et quand

| Chemin | Fichier | Quand | Veto appliqué |
|---|---|---|---|
| **Moisson → matrice** (le chemin principal) | `catalog/pairingRun.ts` → `catalog/match.ts` | node « Comparer catalogue » | **complet** (3 verrous) |
| **Recherche dirigée** | `catalog/searchDirected.ts` (2 points d'appel) | node « Recherche dirigée », client + cron | **réduit** (familles seules) |
| **Kramp authentifié** | `functions/…/krampAuthPass.ts:60` | serveur seul | **réduit** (familles seules) |
| **Écran « Concurrents »** | `explorer/pairing.ts:90` | à l'ouverture de l'écran | **complet** (réutilise `matchProduct`) |

L'écran « Concurrents » n'est pas un simple miroir de la matrice : il rejoue le même
`matchProduct`, puis **ajoute** par-dessus l'indice de fiabilité (`explorer/confidence.ts`)
et les **verdicts humains** persistés (`explorer/verdictStore.ts`), que la matrice ignore.

Deux moteurs existent **hors** de cette cascade :

- `explorer/confidence.ts` — l'**indice de fiabilité** (0-100, bandes *sûr / à vérifier /
  douteux*). Il est calculé **après coup**, pour l'écran d'audit. Il ne décide **jamais**
  d'un appariement et n'entre pas dans le rapport.
- `catalog/nameMatch.ts` — l'appariement **par nom**. Moteur écrit et testé, mais
  **aucun appelant** : les briques « file À confirmer », UI et override durable n'ont
  jamais été construites. Ce n'est pas une étape de la cascade aujourd'hui.

---

## 2. La cascade, étape par étape

### Étape 0 — résoudre les colonnes source (`catalog/compareColumns.ts`)

Avant toute clé, il faut savoir **où lire** la référence, l'EAN, le prix. Ordre :

1. le nom configuré **existe** dans la feuille → on le garde (le choix explicite prime) ;
2. sinon **devinage** par index d'alias fr/en, accents et séparateurs ignorés
   (`ALIASES`, `compareColumns.ts:28`) — égalité stricte d'abord, puis inclusion, en
   écartant les alias trop génériques (`STRICT_ONLY:52` : `prix`, `ref`, `article`…) ;
3. sinon le champ reste vide, et le run le **dit** (`guessed` / `missing`).

Si aucune des trois colonnes `ref` / `ref2` / `ean` n'est résolue, le run **échoue**
(`hasNoJoinKey:124`) au lieu de comparer du vide.

### Étape 1 — fabriquer les clés candidates du produit source (`catalog/keys.ts:105`)

C'est **l'ordre de cette liste qui pilote tout le reste**. `candidateKeys` produit,
dans cet ordre exact :

1. `ean` — normalisé GTIN-13 (`normalizeEan:48`), **sauf** code-barres interne à
   l'enseigne (préfixes GS1 `02`, `20-29`, `30xx` → `isInternalBarcode:61`) ;
2. puis, **référence par référence** : `ref` (colonne principale), puis sa variante
   `ref-nozero` (zéros de tête retirés) ; ensuite `ref2` et sa variante ; enfin les
   **références d'origine** extraites de la description (« Remplace origine: … »,
   `match.ts:414`), marquées `origin: true`.

Conséquences à connaître :

- une clé est dite **faible** (`weak`) si elle fait moins de **5** caractères
  (`WEAK_REF_LEN`, `keys.ts:23`) — elle ne pourra prouver que sur un champ déclaré ;
- une référence de moins de **3** caractères est ignorée (`MIN_REF_LEN`, `keys.ts:18`) ;
- `raw` conserve la référence **telle qu'écrite** — c'est elle, et non la forme
  normalisée, qui dira plus tard si la clé discrimine ;
- l'entrelacement fait que **`ref-nozero` de la réf principale passe avant `ref2`**.

### Étape 2 — indexer le catalogue concurrent (`catalog/match.ts:303`)

Dédoublonnage **par URL** d'abord (`dedupeListings:281`) : entre deux relevés d'une même
fiche on garde le **plus renseigné** (prix 4 pts, réf/EAN 2 pts, stock 1 pt), jamais le
dernier. Sur le terrain, un site est monté à 97 % de doublons de pagination.

Puis **deux niveaux de clés** :

- **niveau sûr** (`indexKeysOf:29`), posé sans condition : la réf déclarée (+ variante
  dépaddée), le `gtin13` non interne, le **premier mot du titre** s'il fait ≥ 5
  caractères et contient un chiffre, les **13 chiffres** trouvés dans l'URL, et les
  **tokens de référence du slug** (`refTokensFromUrl:224`, l'ID PrestaShop de tête retiré) ;
- **niveau titre** (`titleKeysOf:267`), les références lues **ailleurs dans le libellé** :
  posées **seulement si elles ne désignent qu'une seule fiche** et si aucune clé sûre ne
  les porte déjà. Une clé de titre ambiguë est purement **jetée**.

### Étape 3 — prouver (`catalog/keys.ts:283` + boucle `match.ts:225`)

La boucle est **clé-majeure** : pour chaque clé dans l'ordre de l'étape 1, on résout
l'index, puis pour chaque candidat on appelle `proveMatch` **avec cette seule clé**.
L'ordre des clés domine donc l'ordre des preuves.

Preuves possibles, dans l'ordre où `proveMatch` les teste :

| # | Preuve | Condition | Clé faible acceptée ? |
|---|---|---|---|
| 1 | `gtin13` | `gtin13` déclaré == clé EAN, et non interne | — (EAN) |
| 2 | `ean-in-url` | les 13 chiffres de la clé figurent dans les chiffres de l'URL | — (EAN) |
| 3 | `sku` | `sku` déclaré == clé (aussi testé avant le premier `/`) | **oui** |
| 4 | `mpn` | idem sur `mpn` | **oui** |
| 5 | `ref-in-name` | **premier token** du titre == clé | non |
| 6 | `ref-in-url` | token entier du slug == clé | non |
| 7 | `ref-in-title` | mot entier **ailleurs** dans le titre == clé | non |

Toujours de l'**égalité exacte sur forme normalisée** — jamais d'inclusion, jamais de
similarité. `12345` ne prouve pas `123456`. Les cotes avec unité (`510MM`, `12V`) et les
dimensions `200X25` sont exclues des tokens (`keys.ts:158-160`).

### Étape 4 — les trois démentis (`match.ts:243`)

Une preuve obtenue est ensuite **soumise à trois vetos**. Charge de la preuve inversée :
le rapprochement doit être corroboré, pas présumé bon.

**Exemption unique** : `key.kind === 'ean' || evidence === 'gtin13'` (`keyIsBarcode:118`).
Un EAN-13 identifie un article unique au monde — aucun libellé ne le renverse.

Sinon, le candidat est **écarté** (et le suivant essayé) si l'un des trois se déclenche :

1. **Conflit de famille** — `familiesConflict` (`catalog/partFamily.ts:140`) : les deux
   libellés nomment chacun une famille de pièce (lexique `FAMILIES:32`, ~60 familles
   fr+en) et **aucune n'est commune**. Un seul côté muet ⇒ rien n'est refusé. *Mesuré :
   14 cellules sur 1 847, toutes de vrais faux appariements.*
2. **Gouffre de prix** — `priceAbyss` (`match.ts:157`) : rapport > **×21** dans un sens
   ou l'autre. Filet universel pour ce qu'aucun mot ne dénonce. *Mesuré : 0 cellule
   touchée ; le pire cas légitime observé est ×14 (un lot de 16 couteaux).*
3. **Absence de corroboration sur clé non distinctive** — si `key.raw` est **une suite
   de chiffres nus** (`keyIsDistinctive:133`) **et** que les libellés n'ont ni racine de
   4 lettres commune ni famille commune (`corroborated:172`, `ROOT_LEN:170`). Une
   référence structurée (`122600092/0`, `BS691991`) appartient à son constructeur ; une
   suite de chiffres n'appartient à personne.

Les refus sont **comptés** (`vetoed`) et journalisés — sans ce chiffre, un produit qui
bascule en « sans correspondance » se lit comme une perte de données.

### Étape 5 — le prix (`match.ts:360`)

- `taxIncluded` absent ⇒ **TTC présumé** (marchand B2C français) ; le HT est recalculé au
  taux du node (`vatRate`, défaut 20 %).
- Prix rejetés d'office : **< 1 €**, ou **plus de −60 %** face au prix source
  (`match.ts:386`) — signature d'une erreur de parsing, pas d'une bonne affaire.
- `alignedPct` (défaut **1 %**) = bande d'indifférence sous laquelle deux prix sont dits
  « alignés ».

### Étape 6 — après coup : l'indice de fiabilité (`explorer/confidence.ts`)

Ne gate rien, sert à trier l'écran d'audit. Valeur de départ par nature de preuve
(`BASE:61`) : `gtin13` 98, `ean-in-url` 88, `sku` 86, `mpn`/`ref-in-name` 84,
`ref-in-url` 80, `ref-in-title` 62. Pénalités (`PENALTY:77`) : EAN contredit 45, conflit
de famille 45, gouffre de prix 45, réf d'origine 25, clé numérique courte 22, clé faible
18, fiche contestée 20, écart de prix 15, réf contredite 15. Bandes : **sûr ≥ 80**,
**à vérifier ≥ 45**, **douteux** en dessous. Les renforts (mots communs, échos EAN/réf)
montent le score **à l'intérieur** de la bande, jamais au-delà.

---

## 3. L'asymétrie à connaître (et probablement à corriger)

Les chemins n'appliquent **pas** le même jeu de vetos :

| | `matchProduct` (matrice, explorateur) | `searchDirected` / `krampAuthPass` |
|---|---|---|
| Exemption | `key.kind === 'ean'` **ou** `evidence === 'gtin13'` | `evidence === 'gtin13'` **seul** |
| Conflit de famille | oui | oui |
| Gouffre de prix ×21 | oui | **non** |
| Corroboration sur chiffres nus | oui | **non** |

Deux conséquences concrètes : une preuve `ean-in-url` est **exemptée** côté matrice mais
**vetoable** côté recherche dirigée ; et la recherche dirigée peut persister dans l'index
un hit que « Comparer catalogue » refusera ensuite — le compteur de hits et le rapport
divergent alors **en silence**.

---

## 4. Table des leviers

`c` = client `src/features/priceWatch/…` ; le jumeau serveur porte la même ligne +1.

| Levier | Valeur | Où (client) | Ce qu'il change | Exposer ? |
|---|---|---|---|---|
| Ordre des clés | ean → ref → ref-nozero → ref2 → origine | `catalog/keys.ts:105` | **quelle** preuve gagne quand plusieurs existent | ⭐ oui |
| `MIN_REF_LEN` | 3 | `catalog/keys.ts:18` | réf trop courte ignorée | oui |
| `WEAK_REF_LEN` | 5 | `catalog/keys.ts:23` | seuil clé faible → interdit titre/URL | ⭐ oui |
| Réf d'origine actives | oui | `catalog/match.ts:414` | apparie les adaptables aux pièces OEM | ⭐ oui (bascule) |
| Preuves autorisées | les 7 | `catalog/keys.ts:283` | couper `ref-in-title` = moins de bruit, moins d'appariés | ⭐⭐ oui (cases) |
| Clés de titre ambiguës | jetées | `catalog/match.ts:323` | tolérance 1 fiche → N | non (danger) |
| Veto familles | actif | `catalog/partFamily.ts:140` | refuse pièces incompatibles | ⭐ oui (on/off) |
| Lexique `FAMILIES` | ~60 familles | `catalog/partFamily.ts:32` | ce que le veto sait nommer | ⭐⭐ oui (éditeur) |
| `PRICE_ABYSS_RATIO` | ×21 | `catalog/match.ts:153` | plafond d'écart de prix admissible | ⭐ oui |
| Corroboration libellé | active si chiffres nus | `catalog/match.ts:248` | exige un mot commun | ⭐ oui |
| `ROOT_LEN` | 4 | `catalog/match.ts:170` | longueur de racine commune | non |
| Prix plancher / −60 % | 1 € / −60 % | `catalog/match.ts:386` | rejet des prix mal parsés | oui |
| `vatRate` | 20 % | node | conversion TTC→HT | déjà exposé |
| `alignedPct` | 1 % | `catalog/match.ts:363` | bande « aligné » | oui |
| Barème `BASE`/`PENALTY` | cf. §2.6 | `explorer/confidence.ts:61,77` | tri de l'écran d'audit | ⭐ oui |
| Bandes 80 / 45 | | `explorer/confidence.ts:113` | ce qui est « sûr » | ⭐ oui |
| Seuils `nameMatch` | 3 / 3 / 0,6 | `catalog/nameMatch.ts:52` | *moteur non branché* | plus tard |

---

## 5. Interface de pilotage — ce qu'elle doit être

**Contrainte n° 1** : chaque constante ci-dessus est un **littéral dupliqué** dans le
jumeau serveur. Un réglage posé dans la config d'un node **n'atteindrait pas le cron** —
le piège déjà rencontré (`server_twin_drops_pagebudget`). Le réglage doit donc être
**persisté par `watchId` dans Firestore**, relu par le client **et** par les deux jumeaux
serveur, avec des **valeurs par défaut égales aux littéraux actuels** : un réglage jamais
touché ne change rien.

**Contrainte n° 2** : le jeu de paramètres **effectif** doit être estampillé dans le
rapport sauvegardé. Sans ça, on ne saura pas quels réglages ont produit quels chiffres.

**Contrainte n° 3** : tout recalcul avec de nouveaux réglages passe par le garde-fou
fail-closed existant (`REGRESSION_FLOOR`) — un réglage trop strict ne doit pas pouvoir
détruire un rapport (cas vécu : 20 980 appariés ramenés à 72).

### L'écran proposé — « Règles d'appariement », onglet de la veille

Trois sections, dans l'ordre de la cascade :

1. **Clés** — l'ordre des clés en liste réordonnable (dnd-kit), les deux seuils de
   longueur en steppers, la bascule « utiliser les références d'origine ».
2. **Preuves** — les 7 natures en cases à cocher, chacune avec sa contrainte
   (« clé forte seulement ») et **le nombre d'appariements qu'elle porte aujourd'hui**
   dans le rapport courant. C'est le réglage le plus rentable : décocher `ref-in-title`
   se chiffre immédiatement.
3. **Démentis** — veto familles on/off, seuil de gouffre de prix, corroboration on/off,
   plus un **éditeur du lexique des familles** (le seul endroit où l'utilisateur métier
   apporte quelque chose que le code ne peut pas deviner), et l'alignement des chemins
   (une case « appliquer les mêmes démentis à la recherche dirigée » qui résout §3).

Et, indispensable pour que ce soit du pilotage et non du réglage à l'aveugle : un
**simulateur** en tête d'écran. Aucune écriture tant que l'utilisateur n'a pas validé.

⚠ **Il est à moitié aveugle, et il faut le dire dans l'écran.** Les cellules du rapport
stocké portent leur preuve et leur clé (`PairedCell.proof`) : on peut donc rejouer un
durcissement **sans rien relire** et montrer exactement quels appariements seraient
**perdus**. En revanche les candidats **refusés** ne sont que **comptés** (`vetoed:
number`) — les fiches elles-mêmes sont relâchées avec l'index du site. Un assouplissement
ne peut donc pas dire ce qu'il ferait **gagner** sans **relire l'index concurrent**.
Deux modes, à assumer dans l'UI : *simulation instantanée* (durcissement seul) et
*recalcul complet* (les deux sens, quelques minutes, garde-fou fail-closed obligatoire).

Le pendant existe déjà côté audit unitaire — l'écran « Concurrents » montre déjà preuve,
indice et motifs de doute par cellule. Ce qui manque, c'est le **réglage global** et sa
répercussion jusqu'au cron.
