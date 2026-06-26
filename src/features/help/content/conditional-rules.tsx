import { Database, Download, Layers } from 'lucide-react'
import type { HelpSection } from './types'

export const conditionalRulesSection: HelpSection = {
  id: 'conditional-rules',
  title: 'Règles conditionnelles',
  category: 'Édition',
  intro:
    "Afficher, masquer ou transformer un élément du design selon la donnée de la ligne courante — façon EasyCatalog (« Nouvelle action »), mais directement dans l'éditeur. Idéal en publipostage : un bandeau « PROMO » qui n'apparaît que sur les produits en promotion, un prix qui passe en rouge sous un seuil de stock, un picto agrandi pour les nouveautés…",
  blocks: [
    {
      type: 'text',
      md: `Chaque objet (texte, image, forme, calque) peut porter ses propres **règles conditionnelles**. Une règle dit : **SI** un champ de ta source remplit une condition, **ALORS** applique une action visuelle à cet objet. Les règles sont évaluées **ligne par ligne** au publipostage, donc le même gabarit se décline tout seul : selon la valeur de chaque produit, l'élément se montre, se cache ou change d'aspect.

C'est l'équivalent natif des actions conditionnelles d'**EasyCatalog**, sans plug-in payant. Combinée au **balisage XML InDesign** (ou à EasyCatalog) pour brancher la base, c'est l'**alternative complète** à un flux print piloté par données.

> Les règles sont **réversibles** : elles ne modifient pas l'objet de façon permanente. Pour les lignes où la condition n'est pas remplie, l'apparence d'origine (visibilité, couleur, opacité, taille, ordre) est restaurée.`,
    },
    {
      type: 'text',
      md: `### Ouvrir le panneau

1. Sélectionne un objet sur le canvas.
2. Dans la colonne de droite, ouvre le panneau **Propriétés**, puis déplie la section **Règles conditionnelles** (icône branche). Un compteur indique le nombre de règles actives sur l'objet.
3. Clique **Ajouter une règle**.

> Tu peux configurer des règles **même sans connexion live** à la source : les champs disponibles proviennent alors du schéma de la dernière source utilisée. Reconnecte la source pour voir l'aperçu se rejouer en direct.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'layers-panel' },
      label: "Panneau de droite de l'éditeur (Propriétés / Calques)",
      icon: Layers,
    },
    {
      type: 'text',
      md: `### Composer une règle : SI champ → opérateur → valeur → ALORS action

Chaque règle se lit de gauche à droite :

- **Champ** : la colonne de données testée (ex. \`promo\`, \`stock\`, \`Prix_normal\`).
- **Opérateur** : la condition à vérifier (voir ci-dessous).
- **Valeur** : la valeur de comparaison (masquée pour les opérateurs de présence).
- **Action** : l'effet appliqué à l'objet quand la condition est vraie.`,
    },
    {
      type: 'text',
      md: `### Les opérateurs (3 familles)

**Texte** (comparaison insensible à la casse et aux espaces de début/fin) :
- **Contient** / **Ne contient pas**
- **Est** / **N'est pas** (égalité exacte de chaîne)
- **Commence par** / **Termine par**
- **Ne commence pas avec** / **Ne se termine pas avec**

**Présence** (pas de valeur à saisir) :
- **Est vide** / **N'est pas vide** — parfait pour « montrer le bandeau seulement si la colonne promo est remplie ».

**Numérique** (la valeur est convertie en nombre, tolérant aux devises et au format FR : \`84,99 DT\`, \`1 234,56 €\`, \`100€,00\`) :
- **Est supérieur à** / **Au moins** (≥)
- **Est inférieur à** / **Pas plus que** (≤)
- **Est égal à** / **N'est pas égal à**

> Note : **Est** (texte) et **Est égal à** (numérique) sont volontairement distincts, comme dans EasyCatalog. Une comparaison numérique sur une cellule non chiffrable est simplement considérée comme non remplie.`,
    },
    {
      type: 'text',
      md: `### Les actions (7)

- **Cacher** : l'objet n'est pas rendu (ni à l'écran, ni à l'export).
- **Montrer** : force l'affichage.
- **Mettre en avant** / **Mettre à l'arrière** : réordonne l'objet dans la pile (z-order).
- **Changer la couleur** : remplit l'objet avec la couleur choisie.
- **Changer l'opacité** : applique une transparence (0 à 1).
- **Changer la taille** : multiplie la taille par un facteur (ex. \`1,5\` = +50 %).

> Pense à renseigner le paramètre de l'action (couleur, opacité, facteur) : une action « nue » n'a aucun effet visible.`,
    },
    {
      type: 'text',
      md: `### Aperçu et plusieurs règles

Quand une **source est connectée**, l'effet se rejoue **en direct** sur la ligne courante : ajoute ou modifie une règle et le canvas se met à jour aussitôt. Utilise les flèches **◀ ▶** du panneau Publipostage pour parcourir les lignes et vérifier le rendu produit par produit.

Tu peux empiler **plusieurs règles** sur un même objet :

- elles sont évaluées **dans l'ordre** ;
- pour une même propriété, **la dernière règle qui matche l'emporte** (ex. deux règles « Changer la couleur » → la seconde gagne) ;
- exception : **Changer la taille** est **cumulatif** (les facteurs se multiplient).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Espace Données (créer / gérer la source)',
      icon: Database,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: "Exporter par lot (une variante par ligne)",
      icon: Download,
    },
    {
      type: 'accordion',
      items: [
        {
          title: "Quelle différence avec une liaison {{champ}} classique ?",
          md: `Une **liaison** \`{{champ}}\` (ou « Lier à un champ ») **remplace le contenu** d'un élément par la valeur de la colonne (texte, image). Une **règle conditionnelle** ne remplace rien : elle **change l'apparence ou la visibilité** de l'élément selon une condition. Les deux se combinent : un bloc prix peut afficher \`{{prix}}\` **et** passer en rouge si \`stock\` est inférieur à 5.`,
        },
        {
          title: 'Mon avertissement « la couleur est aussi câblée » ?',
          md: `Si une propriété est **à la fois** pilotée par une liaison de données (ex. couleur câblée sur une colonne) **et** par une règle qui la modifie (Changer la couleur / Changer l'opacité), les deux peuvent se contredire. IBS-Studio l'**avertit** au lieu de masquer le conflit. Solution : pilote la propriété **soit** par la liaison, **soit** par la règle, pas les deux.`,
        },
        {
          title: "Les champs n'apparaissent pas dans le sélecteur",
          md: `Connecte une **source de données** (Excel, Google Sheets, PIM…) depuis le panneau **Publipostage**. Sans aucune source — jamais branchée — il n'y a pas de colonnes à tester. Si une source a déjà été utilisée, ses champs restent proposés même hors connexion live (les règles s'évalueront alors à la fusion / à l'export).`,
        },
        {
          title: "L'aperçu ne bouge pas quand j'ajoute une règle",
          md: `L'aperçu live nécessite une **source connectée** (panneau Publipostage). Hors connexion, la règle est bien **enregistrée** sur l'objet, mais son effet ne sera visible qu'au moment du publipostage / de l'export par lot. Reconnecte la source pour retrouver l'aperçu immédiat.`,
        },
        {
          title: 'EasyCatalog ↔ Règles conditionnelles',
          md: `Le panneau reprend la logique des **actions conditionnelles d'EasyCatalog** (Contient, Est, Est égal à, Cacher…). Les actions propres au flux InDesign (« Conserver avec suivant », reflow) n'ont pas de sens sur un canvas en positionnement absolu et sont volontairement absentes. À la place, IBS-Studio ajoute les transformations **couleur**, **opacité** et **taille**.`,
        },
      ],
    },
  ],
}
