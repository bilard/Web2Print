// Le TEXTE de la documentation du module BI. PUR : aucune dépendance, aucune traduction.
//
// ⚠⚠ SOURCE UNIQUE, en markdown : l'aide intégrée à l'application rend ce contenu, et le PDF
// (`npm run doc:bi`) le lit sur la page qu'il photographie. Deux rédactions finiraient par
// diverger, et la documentation imprimée cesserait de décrire l'écran qu'on a sous les yeux.
//
// ⚠ Chaque visuel dit trois choses, dans cet ordre : à quoi il sert, ce qu'il EXIGE pour
// s'afficher, et ce qui le fait mentir. La troisième est la plus utile — c'est celle qu'on ne
// découvre autrement qu'en se trompant.
import type { SampleId } from './biDocSamples'

export const meta = {
  title: 'Dashboard BI',
  subtitle: 'Les visuels, leurs zones, leurs réglages — et ce qui les fait mentir',
  intro: `Un tableau de bord se compose de **pages**, chaque page portant des **tuiles**.
    Une tuile est un visuel branché sur une **source de données** : la feuille active du
    module Données, le catalogue du PIM, ou l'une des sources de la veille tarifaire. Les
    exemples de ce document viennent tous du même jeu — huit concurrents, leurs volumes
    appariés, leurs écarts médians et leur complétude — pour qu'on puisse comparer ce que
    chaque visuel montre des mêmes chiffres.`,
}

export const wells = {
  title: 'Composer une tuile : les cinq zones',
  intro: `Le volet de droite porte cinq zones de dépôt. On y fait glisser un champ depuis le
    volet « Champs », ou on double-clique le champ pour qu'il rejoigne la zone la plus
    probable. Une zone qui refuse un champ le dit **pendant** le survol, avec la raison.`,
  rows: [
    ['Axe', `La dimension qui découpe la donnée : un point, une barre, une ligne par valeur.
      Un tableau en accepte autant qu'on veut, un graphe une seule.`],
    ['Valeurs', `Les mesures tracées. Un camembert n'en porte qu'une, un nuage en exige deux
      (ses deux axes), un nuage 3D en exige trois.`],
    ['Légende', `Une seconde dimension, qui éclate le graphe en séries — ou, sur un nuage,
      colorie les points par catégorie.`],
    ['Info-bulles', `Des mesures calculées mais jamais tracées : elles n'apparaissent qu'au
      survol. Une zone réservée aux graphes, un tableau n'ayant rien à survoler.`],
    ['Filtres du visuel', `Des conditions qui ne valent que pour cette tuile. Les filtres de
      page et de tableau, eux, se posent dans le bandeau du haut.`],
  ],
  traps: [
    `Une **légende sans axe** est refusée : le moteur grouperait sur une seule dimension
     et le graphe l'afficherait comme axe — le champ semblerait avoir atterri au mauvais
     endroit.`,
    `Un **filtre sur une mesure** est refusé : une mesure est calculée *après* le
     filtrage, et la condition ne retiendrait jamais une ligne. Les filtres portent sur des
     colonnes.`,
    `Une zone pourvue mais non pleine affiche **« + un autre champ »**. Sans cette
     mention, une zone portant déjà une puce paraît close.`,
  ],
}

export interface VisualDoc {
  shot: SampleId
  name: string
  /** À quoi il sert. */
  what: string
  /** Ce qu'il exige pour s'afficher. */
  needs: string
  /** Ce qui le fait mentir. */
  trap: string
}

export const visuals: VisualDoc[] = [
  {
    shot: 'kpi', name: 'Indicateur',
    what: `Une mesure, en grand. Le visuel le plus lu d'un tableau de bord : on le regarde
      sans le lire.`,
    needs: `Une mesure. Aucune dimension.`,
    trap: `Il montre la **première ligne** du résultat. Sur une source qui en rend
      plusieurs, ajoutez-lui un axe (ci-dessous) plutôt que d'espérer un total.`,
  },
  {
    shot: 'kpi-trend', name: 'Indicateur à tendance',
    what: `Le même, avec une dimension dans « Axe » : dernier point en grand, variation
      depuis le point précédent, courbe de la série.`,
    needs: `Une mesure et une dimension.`,
    trap: `La série est **retriée sur la dimension**, jamais laissée dans l'ordre du
      résultat : un « top 10 » trié sur sa mesure donnerait une décroissance parfaite, qui
      n'est pas une tendance mais un tri. La variation dit le **sens** (flèche, signe),
      jamais si c'est bon ou mauvais — et elle nomme toujours le point auquel elle compare.`,
  },
  {
    shot: 'gauge', name: 'Jauge',
    what: `Une valeur située sur une course. Utile pour un taux, un remplissage, une
      progression vers un objectif.`,
    needs: `Une mesure.`,
    trap: `L'arc sert au coup d'œil ; c'est le **nombre** au centre qui porte la vérité.`,
  },
  {
    shot: 'bar', name: 'Barres',
    what: `Comparer des grandeurs entre catégories. Le visuel par défaut, et le bon choix
      neuf fois sur dix.`,
    needs: `Une mesure, une dimension.`,
    trap: `Une série unique se colore **par catégorie** : vingt-quatre barres du même
      indigo ne se distinguent que par leur hauteur, et l'œil ne retrouve pas un concurrent
      d'un graphe à l'autre. Dès qu'il y a plusieurs séries, la couleur redevient l'identité
      de la série.`,
  },
  {
    shot: 'bar-horizontal', name: 'Barres couchées',
    what: `Le même, réglage « Barres couchées » de la section Mise en forme.`,
    needs: `Idem.`,
    trap: `**Indispensable dès que les libellés sont longs.** À la verticale, ils
      s'inclinent à 45° et se tronquent — comparez avec la planche précédente.`,
  },
  {
    shot: 'bar-diverging', name: 'Couleur par signe, et ligne de repère',
    what: `Deux réglages combinés : la teinte suit le signe de la valeur, une ligne pointillée
      marque le zéro.`,
    needs: `Idem. Le repère se saisit dans la section Mise en forme.`,
    trap: `Les deux teintes sont **neutres** — bleu et orange, jamais vert et rouge. Un
      écart négatif est bon pour l'acheteur et mauvais pour le vendeur : le module ne sait pas
      de quel côté vous êtes, il dit le signe et vous laissez le jugement.
      
La ligne de repère se **dessine** et ne déclenche rien : c'est le seuil
      d'alerte, plus bas dans le volet, qui fait sonner une tuile.`,
  },
  {
    shot: 'bar-stacked', name: 'Barres empilées',
    what: `Les séries s'additionnent au lieu de se côtoyer. À réserver aux parts d'un même
      tout.`,
    needs: `Une mesure, un axe, une légende.`,
    trap: `Empiler des grandeurs qui ne composent pas un tout invente une somme qui ne veut
      rien dire.`,
  },
  {
    shot: 'bar-percent', name: 'Empilement à 100 %',
    what: `Chaque colonne dit la **répartition**, plus les volumes. Le bon visuel pour
      comparer des profils entre catégories de tailles très différentes.`,
    needs: `Idem.`,
    trap: `Ce sont les **valeurs absolues** qui font le total : à valeurs mêlées, une somme
      signée peut valoir zéro et la part deviendrait infinie. Une case absente reste absente,
      jamais convertie en part nulle.`,
  },
  {
    shot: 'line', name: 'Courbe',
    what: `Suivre une évolution. Ici avec une ligne de repère à 450 000.`,
    needs: `Une mesure, une dimension — de préférence une date.`,
    trap: `Une courbe sur une dimension non ordonnée (des marques, des familles) relie des
      points qui ne se suivent pas : préférez des barres.`,
  },
  {
    shot: 'area', name: 'Aires',
    what: `Une courbe dont le dessous est rempli. Elle insiste sur le volume cumulé plutôt que
      sur la variation.`,
    needs: `Idem courbe.`,
    trap: `À plusieurs séries non empilées, les aires se masquent l'une l'autre.`,
  },
  {
    shot: 'pie', name: 'Camembert',
    what: `La part de chacun dans un tout.`,
    needs: `Une mesure et **une dimension**.`,
    trap: `Sans dimension, il n'a qu'une part — un disque plein valant 100 %. La tuile le dit
      plutôt que de le dessiner. Au-delà de six ou sept parts, l'œil ne compare plus les
      angles : passez aux barres.`,
  },
  {
    shot: 'doughnut', name: 'Anneau',
    what: `Un camembert évidé. Le centre libre allège la lecture.`,
    needs: `Idem camembert.`,
    trap: `Idem camembert.`,
  },
  {
    shot: 'table', name: 'Tableau',
    what: `Les chiffres tels quels, sans interprétation. Le recours quand un visuel simplifie
      trop.`,
    needs: `Une mesure. Autant de dimensions qu'on veut.`,
    trap: `Un tableau ne se lit pas de loin : évitez-le en mode TV.`,
  },
  {
    shot: 'pivot', name: 'Tableau croisé',
    what: `Deux dimensions croisées, l'une en lignes, l'autre en colonnes. Ici avec la ligne
      de totaux.`,
    needs: `Une mesure et **deux** dimensions.`,
    trap: `La dimension portée en colonnes est **désignée**, jamais devinée. Avec une seule
      dimension, le croisé ne croise rien et le dit.`,
  },
  {
    shot: 'heatmap', name: 'Carte de chaleur',
    what: `Le même croisement, en intensité de couleur. On y repère une zone chaude sans lire
      un chiffre.`,
    needs: `Une mesure et deux dimensions.`,
    trap: `Un croisement jamais mesuré n'est pas un zéro : il reste vide et le dit.`,
  },
  {
    shot: 'scatter', name: 'Nuage de points',
    what: `Deux mesures confrontées — prix contre écart, volume contre couverture. Il montre
      une structure : des grappes, des points aberrants.`,
    needs: `**Deux** mesures et une dimension (l'identité des points).`,
    trap: `Un point auquel il manque une coordonnée est **écarté**, jamais posé à
      l'origine : le placer en (0, 0) inventerait une observation. Le nombre de lignes
      écartées est affiché.`,
  },
  {
    shot: 'scatter-legend', name: 'Nuage coloré par catégorie',
    what: `Le même, avec une dimension dans « Légende ». C'est ce qui permet de lire « qui est
      moins cher » d'un coup d'œil, sans survoler.`,
    needs: `Deux mesures, un axe, une légende.`,
    trap: `Au-delà de dix catégories, les suivantes sont regroupées sous « Autres » : une
      palette ne porte que dix teintes, et les cycler ferait dire à deux catégories qu'elles
      sont la même. Ce sont les plus peuplées qui gardent leur teinte.`,
  },
  {
    shot: 'scatter3d', name: 'Nuage 3D',
    what: `Trois mesures dans un volume qu'on tourne à la souris. Chaque marqueur descend au
      sol par une colonne — sans elle, un point flotte à une hauteur indéterminable. Les
      arêtes portent la couleur de leur axe, la teinte des marqueurs suit la profondeur.`,
    needs: `**Trois** mesures et une dimension.`,
    trap: `**C'est le seul visuel du module où la 3D est admise** : un nuage n'encode ni
      longueur ni angle, seulement des positions, donc un axe de plus ne fausse rien. Sur une
      barre ou une part de camembert, la perspective raccourcit ce qui est au fond — une barre
      3D ment. Ce que la 3D apporte est l'exploration, pas la précision : la valeur exacte
      reste dans l'info-bulle.`,
  },
  {
    shot: 'funnel', name: 'Entonnoir',
    what: `Des étapes qui se réduisent : catalogue, indexés, appariés, avec prix.`,
    needs: `Une mesure, une dimension.`,
    trap: `Il suppose des étapes **décroissantes** et emboîtées. Sur des catégories
      indépendantes, sa forme suggère une déperdition qui n'existe pas.`,
  },
]

export const gestures = {
  title: 'Les gestes',
  rows: [
    ['Clic sur un élément', `Filtre toute la page sur la valeur cliquée. Les autres tuiles
      s'estompent pour dire « je montre moins », et le bandeau affiche le filtre — un filtre
      qui existerait sans se voir ferait mentir tous les chiffres de la page.`],
    ['Double-clic', `Descend d'un niveau dans la hiérarchie de l'axe. Le fil d'Ariane dit où
      l'on se trouve. Le forage n'est pas enregistré : rouvrir le tableau ramène chaque tuile
      au niveau configuré.`],
    ['Icône tableau', `Ouvre les **lignes** derrière le chiffre, avec les filtres qui
      s'appliquaient au moment du clic et le décompte réel quand l'échantillon est plafonné.`],
    ['Icône agrandir', `Ouvre la tuile en plein écran, avec un zoom par paliers de 100 à
      400 %. Le zoom agrandit la boîte du visuel, qui se redessine — il ne grossit pas des
      pixels.`],
    ['Seuil d\'alerte', `La tuile s'entoure d'ambre et dit ce qui a été franchi. Le sens est
      un choix explicite : « au-dessus de 30 » et « en dessous de 30 » surveillent des risques
      opposés.`],
  ],
}

export const rules = {
  title: 'Ce que le module refuse de faire',
  intro: `Ces refus ne sont pas des limites techniques : ce sont des garde-fous. Chacun
    correspond à une façon connue de faire dire à un graphe autre chose que ce que la donnée
    dit.`,
  rows: [
    [`La couleur ne juge jamais`, `Elle dit ce qu'on mesure (l'unité) ou un signe, jamais si
      c'est bon ou mauvais. Un décompte de ruptures est bon pour l'acheteur et mauvais pour le
      vendeur, et le module ne sait pas de quel côté vous êtes.`],
    [`Pas de 3D sur les barres`, `La perspective raccourcit ce qui est au fond. Seul le nuage
      admet une troisième dimension.`],
    [`Pas de double axe`, `Deux mesures d'échelles différentes sur un même graphe font voir des
      croisements qui n'existent pas. Deux tuiles, ou une mise à l'indice.`],
    [`Une valeur absente n'est pas zéro`, `Un croisement jamais mesuré reste vide, un point
      sans coordonnée est écarté, une part absente n'est pas une part nulle.`],
    [`Ce qui est tronqué est dit`, `Lignes écartées, catégories regroupées, échantillon
      plafonné : chaque réduction s'affiche. Un extrait silencieux se lit comme un tout.`],
  ],
}
