import { Sparkles } from 'lucide-react'
import type { HelpSection } from './types'

export const demoExpressSection: HelpSection = {
  id: 'demo-express',
  title: 'Démo express',
  category: 'Données',
  intro: 'Saisissez la société et le site d’un prospect : le studio se remplit tout seul — produits, images, catalogue, promo et workflow à ses couleurs.',
  blocks: [
    {
      type: 'text',
      md: `La **Démo express** ensemence un environnement de démonstration complet à partir du site web d'un prospect. Un seul formulaire — la société et l'URL de son site — déclenche un pipeline en huit étapes : **Charte graphique du site** → **Découverte des produits** → **Enrichissement des fiches** → **Images → DAM (Google Drive)** → **Feuille PIM** → **Catalogue studio** → **Fiche promo** → **Workflow personnalisé**. À l'arrivée, le panneau **« Découvrez vos données »** relie chaque artefact créé à son module. Comptez quelques minutes (~30 s à 1 min par fiche).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.demo-express' },
      label: 'Ouvrir Démo express',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### Lancer une démo pas à pas

1. Renseignez la **Société du prospect** (ex. *Jardiland*) et le **Site du prospect** : l'adresse d'accueil suffit, la démo descend toute seule dans les rayons du site et échantillonne les produits répartis sur ses univers.
2. Choisissez le **Nombre de produits à scraper** : boutons **6 / 12 / 24 / 48 produits**, ou la valeur exacte de votre choix (champ « ou exactement », de 1 à 48). Plus de produits = démo plus riche mais plus longue.
3. Ajoutez si besoin des **Consignes créatives** (optionnel) — voir ci-dessous.
4. Cliquez **Lancer la démo**. La checklist des huit étapes s'anime en direct (spinner, coche verte, avertissement ambre, erreur, étape sautée) avec le détail de l'étape en cours (« 3/12 — Perceuse GBH 5-40 »).

Un bouton **Arrêter** est disponible pendant le run : l'arrêt se fait proprement **à la fin de l'item en cours** (« Arrêt en cours (fin de l'item)… »), et tout ce qui a déjà été produit est conservé. Depuis le menu des modules, l'entrée « Scraper N produits » ouvre directement le formulaire avec la volumétrie préremplie.`,
    },
    {
      type: 'text',
      md: `### Découverte automatique des rayons (et étage anti-bot)

Vous donnez l'**URL de base** du site, pas une page de listing. Si l'accueil est un « hub » sans cartes produit, la démo **descend automatiquement dans les rubriques du menu** et prélève quelques produits par rayon, pour couvrir la taxonomie du prospect. Le rendu instable des boutiques SPA est couvert par une **seconde tentative de découverte** automatique. Face à une protection anti-bot (DataDome, Akamai…), le pipeline **escalade vers Bright Data** : la page d'accueil puis les rayons sont relus via le connecteur, et la charte graphique est même récupérée depuis l'\`og:image\` du site si l'analyse directe a échoué. Les URLs à l'évidence non-produit (cookies, actualités, concours…) sont écartées **avant** l'enrichissement, pour ne pas perdre ~1 minute par page parasite.`,
    },
    {
      type: 'text',
      md: `### Enrichissement des fiches : le vrai moteur PIM

Chaque page produit repérée passe dans le **moteur d'enrichissement du PIM** (le même que le module Scraping) : nom, description, référence, spécifications, prix, EAN, images… Les pages **éditoriales** (landing métier, guide) ne sont pas jetées : la démo y **redescend** jusqu'à deux niveaux (métier → gamme → produit) pour récupérer de vraies fiches. Chaque fiche aboutie s'affiche dans le journal avec son **bilan** : référence, nombre de specs, nombre d'images, prix et EAN réellement obtenus — une fiche creuse se repère immédiatement.`,
    },
    {
      type: 'text',
      md: `### Consignes créatives : pilotez le plan du catalogue

Le champ **Consignes créatives** (optionnel) pilote le **plan créatif du catalogue** généré par l'IA : mise en page, densité, ambiance, couverture (ex. *« catalogue premium épuré, fiches en liste pleine largeur, couverture ambiance jardin d'été »*). La **charte du site reste prioritaire pour les couleurs** : palette et consignes extraites du site du prospect sont injectées à part dans le plan. Le brief est persisté dans le catalogue, donc itérable ensuite dans le Catalogue studio. Les fiches du catalogue démo sont en **pleine page** (1 produit/page), seule surface qui garantit 100 % des avantages et du tableau de specs sur les produits riches. Une **couverture IA** est générée en bonus ; en cas d'échec, la couverture typographique est conservée.`,
    },
    {
      type: 'text',
      md: `### Journal live : une console fixée en bas de l'écran

Pendant le run, un **Journal** façon terminal est fixé en bas de l'écran (repliable d'un clic, barre de défilement visible). Chaque ligne est horodatée et typée par couleur : **étape** (actions du pipeline, bilans de fiches en vert), **IA** (chaque appel terminé avec fournisseur, modèle, tâche, durée et coût en dollars), **connecteur** (Jina, Bright Data, Drive DAM…) et **erreur**. Le défilement automatique suit la dernière ligne, mais ne vous interrompt jamais quand vous remontez lire l'historique. Le journal conserve les 600 dernières lignes.`,
    },
    {
      type: 'text',
      md: `### « Découvrez vos données » : tout est relié

À la fin du run, une carte par module ensemencé permet d'ouvrir directement le résultat :`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'PIM — données produits',
          md: 'Une base Firestore **dédiée** « Démo {Société} » avec les produits enrichis et leur taxonomie — jamais d\'écrasement de vos données existantes. Si le studio est vierge (cas nominal du compte démo), la base est chargée à l\'écran.',
        },
        {
          title: 'DAM — images',
          md: 'Une image par produit déposée dans le Drive, dossier **« Démo {Société} »**. Si le Drive n\'est pas connecté ou le quota atteint, les cellules gardent les URLs externes des images (qui restent affichées).',
        },
        {
          title: 'Catalogue studio',
          md: 'Un catalogue **lié à la source** PIM, monté avec la charte du site (palette extraite), un plan IA piloté par vos consignes créatives et une couverture générée.',
        },
        {
          title: 'Fiche promo',
          md: 'Une carte promo **data-driven** aux couleurs du prospect (accent et bandeau issus de la charte), sur l\'instantané complet des produits.',
        },
        {
          title: 'Workflow « Démo {Société} »',
          md: 'Un workflow prêt à rejouer : **Scraper des URLs** (jusqu\'à 3 vraies URLs produits du site) → **Export Excel**. Idéal pour montrer l\'automatisation en live.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Bon à savoir

- **Échec franc plutôt que catalogue parasite** : sans la moindre fiche à identité produit (référence/EAN — ou prix + vraies specs), la démo n'ensemence **rien** et vous invite à essayer une URL de rayon ou de fiche produit. Un catalogue « politique de confidentialité » est pire que vide.
- **Re-runs idempotents** : relancer une démo pour la même société **remplace** les artefacts « Démo {Société} » existants (feuille PIM, catalogue, fiche promo, workflow) et **réutilise** les images déjà déposées dans le Drive — pas de doublons empilés, pas de quota re-consommé.
- **Chaque étape est tolérante** : un échec la marque en erreur ou avertissement et la suite continue avec ce qui a réussi (un catalogue sans images DAM reste un catalogue).
- **Quotas du rôle démo** : sur un compte démo, les plafonds s'appliquent — 50 produits PIM et 20 images DAM (le maximum du formulaire est d'ailleurs 48 produits).`,
    },
  ],
}
