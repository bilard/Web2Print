import type { TourStep } from './types'

/**
 * Tour guidé de l'éditeur de workflow (français), navigation automatique.
 *
 * Parcourt la barre supérieure, la palette de blocs (gating par étapes), le
 * plan de montage, le panneau de configuration, l'exécution et les résultats.
 *
 * Robustesse : on ne cible que des éléments TOUJOURS présents (header, palette,
 * `<li>` d'étape rendu même verrouillé, canvas, inspector, run logs). Les
 * boutons conditionnels (Modèle, Run — soumis aux droits/état d'exécution)
 * utilisent `element` SANS `requireSelector` : si absents, driver.js centre la
 * bulle (dégradation gracieuse, comme les sections masquées du tour Dashboard).
 * On ne cible donc aucun node individuel : la palette est gatée par étapes et
 * spawn de nodes polluerait le graphe de l'utilisateur.
 */
export const workflowTourSteps: TourStep[] = [
  {
    popover: {
      title: 'Éditeur de workflow 👋',
      description:
        'Automatisez l’enchaînement des modules de l’app, façon Zapier : une source de données → des transformations → un export ou un envoi. « Suivant » pour avancer, « Échap » pour quitter.',
    },
  },
  {
    element: '[data-tour="wf-name"]',
    requireSelector: '[data-tour="wf-name"]',
    popover: {
      title: 'Nom & enregistrement',
      description:
        'Renommez le workflow ici. L’enregistrement est automatique — l’état « Enregistré / Modifications… » s’affiche juste à droite.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-palette"]',
    requireSelector: '[data-tour="wf-palette"]',
    popover: {
      title: 'Palette de blocs',
      description:
        'Tous les blocs disponibles, organisés en étapes (Import → Enrichissement → Transformation → … → Export). Cliquez un bloc pour l’ajouter au centre, ou glissez-le sur le plan.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-import"]',
    requireSelector: '[data-tour="wf-step-import"]',
    popover: {
      title: 'Étape 1 · Import',
      description:
        'Le point de départ : d’où viennent les données (PIM, scraping web, fichier, base existante). Le bloc « Planification » déclenche le workflow à intervalle régulier, côté serveur — même app fermée. Les étapes suivantes ne se déverrouillent qu’une fois un bloc d’import posé.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-transformation"]',
    requireSelector: '[data-tour="wf-step-transformation"]',
    popover: {
      title: 'Étape · Transformation',
      description:
        'Remodelez les données : filtres, colonnes calculées, et le bloc « Graphique » qui produit un graphe (barres, lignes, camembert) inséré dans vos exports ou Google Sheets.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-export"]',
    requireSelector: '[data-tour="wf-step-export"]',
    popover: {
      title: 'Étape · Export',
      description:
        'Produisez le livrable : Excel, PPTX, Google Sheets… et les rapports HTML prêts à envoyer — « Rapport de coûts IA » (consommation par service) et « Fréquentation du site » (visites, pages vues).',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-communication"]',
    requireSelector: '[data-tour="wf-step-communication"]',
    popover: {
      title: 'Étape · Communication',
      description:
        'Diffusez le résultat : email Gmail (les fichiers produits en amont partent automatiquement en pièces jointes), message Telegram, ou « Webhook / Make » qui POSTe les données vers Make, Zapier, n8n…',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-canvas"]',
    requireSelector: '[data-tour="wf-canvas"]',
    popover: {
      title: 'Plan de montage',
      description:
        'Le graphe de votre workflow. Reliez la sortie d’un bloc à l’entrée du suivant en tirant un trait entre les ports ; déplacez et zoomez librement.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="wf-inspector"]',
    requireSelector: '[data-tour="wf-inspector"]',
    popover: {
      title: 'Configuration du bloc',
      description:
        'Sélectionnez un bloc sur le plan pour régler ses paramètres ici. L’onglet « Logs » montre ses sorties après exécution, et la section « Connexions » récapitule ses liens.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-generate-ai"]',
    popover: {
      title: 'Générer (IA)',
      description:
        'Pas envie de tout assembler à la main ? Décrivez l’objectif en langage naturel : l’IA construit le graphe complet (blocs + liens + config) que vous n’avez plus qu’à ajuster.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-save-template"]',
    popover: {
      title: 'Modèle réutilisable',
      description:
        'Enregistrez ce montage comme modèle : il apparaîtra dans « Mes modèles » sur la page Workflows pour être réutilisé en un clic sur de nouveaux projets.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-run"]',
    popover: {
      title: 'Exécuter',
      description:
        '« Run » lance le workflow de bout en bout (les blocs indépendants tournent en parallèle). « Pas à pas » s’arrête avant chaque bloc pour inspecter ses sorties — idéal pour déboguer. Avec une planification active, un badge « Prochaine · … » propose aussi « Lancer (serveur) » : le run tourne dans le cloud, même app fermée.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-run-logs"]',
    requireSelector: '[data-tour="wf-run-logs"]',
    popover: {
      title: 'Journal d’exécution',
      description:
        'Le déroulé de chaque run, bloc par bloc : statut, durée et messages. Cliquez l’en-tête pour replier ou déplier ce panneau.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-results"]',
    popover: {
      title: 'Écran Résultat',
      description:
        'Ouvre une vue dédiée du dernier run : tableau, galerie, graphique ou document, avec export PNG/PDF. Le rendu s’adapte au type de sortie du workflow.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    popover: {
      title: 'C’est tout 🎉',
      description:
        'Vous savez monter, configurer et lancer un workflow. Astuce : ⌘K (Ctrl+K) ouvre partout la palette de commandes. Relancez cette visite via le bouton 🧭 en bas à droite.',
    },
  },
]
