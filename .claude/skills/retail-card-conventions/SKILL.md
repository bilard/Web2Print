---
name: retail-card-conventions
description: Conventions universelles des fiches produit RETAIL (catalogue, prospectus, carte promo) — mapping auto des colonnes (prix barré, code article, unité de vente, texte promotionnel) et règles d'affichage (cartouche promo au-dessus de l'image, réf. sous la description, unité sous le prix, prix barré au-dessus du prix). À utiliser dès qu'on crée ou modifie un rendu de fiche produit retail ou un devinage de colonnes produit.
---

# Conventions des fiches produit retail

Règles universelles du monde du retail/grande distribution, à appliquer PAR DÉFAUT
sur tout rendu de fiche produit (catalogue studio, promo retail, prospectus, exports)
et tout devinage de colonnes (`defaultPromoFieldMap`).

## 1. Mapping automatique des colonnes (aliases à reconnaître)

Source unique : `GUESS` dans `src/features/retail-promo/promoMapping.ts` — étendre LÀ,
jamais de dictionnaire local par module.

| Champ | Aliases usuels du retail |
|---|---|
| **oldPrice** (prix barré) | prix barré, prix normal, ancien prix, prix public, prix conseillé, prix de référence, prix catalogue, PVC, MSRP, original |
| **newPrice** (prix de vente) | prix promo, prix net, prix TTC, prix, tarif, price |
| **ref** (code article) | référence, ref, SKU, code article, code produit, n° article, numéro article, item code |
| **unit** (unité de vente) | unité (de vente), UV, conditionnement, colisage, vendu par |
| **promoLabel** (texte promo) | promotion, promo, offre, mécanique, texte promotionnel, accroche, badge, top affaire, bon plan |

Les VALEURS de `promoLabel` sont des accroches (« Top affaire », « Prix choc »,
« Promo », « Bon plan »…) ou un pourcentage/ratio numérique.

Règles de désambiguïsation (implémentées dans `defaultPromoFieldMap`) :
- **Paire « Prix_barré » + « Prix_normal »** (classique GSB) : normal = prix de
  VENTE, barré = prix barré. « prix_normal » figure dans les DEUX listes d'aliases ;
  l'ordre des needles fait le tri (barré exact d'abord côté oldPrice).
- **Garde anti-collision** : si oldPrice et newPrice résolvent la même colonne
  (repli partiel « prix »), on abandonne oldPrice — le prix de vente prime.
- **Cartouche promo** : colonne TEXTE (Mechanic, accroche…) prioritaire sur la
  colonne ratio (Promotion = 0.28) — l'accroche est le message, la remise chiffrée
  reste calculable par les prix.

⚠️ **Piège : le fieldMap est PERSISTÉ par document** (catalogue, promo…), deviné à la
connexion de la source. Le wizard catalogue n'ayant AUCUNE UI de mapping, le boot du
builder RE-DÉRIVE entièrement le fieldMap via `defaultPromoFieldMap(columns)`
(auto-réparateur quand les aliases s'améliorent, cf. `CatalogBuilderPage.boot`).
Le module promo retail, lui, A une UI de mapping (StepMapping) → ne jamais y écraser
un choix utilisateur.

## 2. Règles d'affichage d'une fiche

- **Cartouche promo** : bandeau couleur accent AU-DESSUS de l'image, texte en
  majuscules. Contenu = le TEXTE promo seul (`formatPromoLabel(f.promoLabel)`) —
  jamais la remise chiffrée (elle vit dans le sticker) ; masquer si doublon.
- **Sticker de remise** : pastille RONDE accent, légèrement inclinée, en haut à
  droite DU BLOC IMAGE, contenant l'écart entre les 2 prix (« -28% », `remisePct`
  calculé) ; seulement si `oldPrice > newPrice`.
- **Prix barré** : dans un BLOC couleur (bandeau sombre `headerBg`) solidaire du
  badge prix, collé au-dessus à droite, texte barré ; seulement si `oldPrice > newPrice`.
- **Prix de vente** : l'élément le plus fort de la fiche (badge accent, rotation
  légère appliquée à l'étiquette entière barré+prix).
- **Réf. / code article** : sous la description, discret, préfixé « Réf. ».
- **Unité de vente** : sous le prix, format « Unité : {valeur} », discret.
- **Kicker taxonomique** (sous-famille) : pastille en haut à gauche de l'image ;
  si un cartouche promo est présent, le kicker descend sous le bandeau.
- **Spécifications techniques** : colonne specs (needles `spécifications`,
  `specifications`, `specs`, `spécifications/caractéristiques techniques` — JAMAIS
  « caractéristiques » nu, alias de description) devinée comme champ libre
  (`DETAIL_GUESS`). Rendu = TABLEAU nom/valeur (`buildSpecTable` → `<table
  class="cat-cell-specs">` zébré dans la zone Détails, titre = label du champ),
  paires PLAFONNÉES (défaut `MAX_SPEC_LINES`=6, réglable par fiche via
  `cardStyle.maxSpecLines`, 0 = masqué) — une fiche n'est pas une fiche technique.
  `buildDetailLines` EXCLUT le champ specs éclatable (jamais en lignes de texte).
  Formats source acceptés : « [Groupe]Nom: Valeur | … » (enrichissement) ET une
  paire « nom: valeur » par ligne (dataset démo express). Les cellules specs
  STRUCTURÉES (`[{group,name,value}]`, source PIM verbatim) sont aplaties par
  `cellText`.
- **Détails multi-sujets = PUCES** : une valeur liste (tirets « - A - B » ou une
  phrase par ligne) sort en étiquette (« Avantages : ») puis UNE PUCE « • sujet »
  par item (`bulletLines`) — jamais un pavé mono-ligne ni un « A · B · C » collé.
  Mono-sujet : ligne « Étiquette : valeur » classique.

## 3. Implémentations de référence

- Catalogue studio : `src/features/catalog/components/pages/ProductCell.tsx`
  (+ CSS `catalogCss.ts` : `.cat-cell-promo`, `.cat-cell-refcode`, `.cat-cell-unit`).
- Carte promo retail : `src/features/retail-promo/RetailPromoCard.tsx`.
- Style visuel : lumineux, type prospectus grande distribution — JAMAIS sombre
  ou « cinématique » (cf. mémoire feedback_retail_promo_style_not_gaming).

Toute nouvelle règle retail validée par l'utilisateur s'ajoute ICI (et dans
`GUESS` si c'est un alias de colonne).
