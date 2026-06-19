import { TrendingUpDown, Workflow, Send } from 'lucide-react'
import type { HelpSection } from './types'

export const priceWatchSection: HelpSection = {
  id: 'price-watch',
  title: 'Veille tarifaire',
  category: 'Données',
  intro: 'Suis les prix de tes concurrents : tableau de bord des écarts, positionnement et alertes.',
  blocks: [
    {
      type: 'text',
      md: `Le module **Veille tarifaire** est un **tableau de bord en lecture seule** : il affiche les résultats de tes suivis de prix (un produit par ligne, le prix relevé chez chaque concurrent, ton positionnement et les écarts). La **collecte se configure dans un workflow** — le module ne fait que présenter les résultats du dernier relevé.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.price-watch' },
      label: 'Ouvrir la Veille tarifaire',
      icon: TrendingUpDown,
    },
    {
      type: 'text',
      md: `### Comment ça se met en place

Tout part d'un **workflow** contenant le node **« Veille tarifaire »** :

1. Une **feuille de produits** en entrée (ton catalogue : SKU/EAN, Nom, Marque, et ton prix).
2. Les **sites concurrents** à surveiller (un domaine par ligne, ex : \`amazon.fr\`).
3. Le node retrouve chaque produit chez chaque concurrent (SKU/EAN, sinon Nom + Marque), scrape le prix, puis émet des **alertes** de **positionnement** (tu es plus cher/moins cher) et de **variation** (un prix a bougé au-delà du seuil).

Lance le workflow (à la main, en **cron serveur**, ou depuis Telegram) : le module Veille tarifaire affiche alors le dernier relevé.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.workflows' },
      label: 'Construire le workflow (Workflows)',
      icon: Workflow,
    },
    {
      type: 'text',
      md: `### Comment chaque produit est retrouvé chez un concurrent

Tu ne fournis **que le domaine** d'un concurrent — pas l'URL de chaque fiche. Pour chaque produit, le node lance une **recherche web cantonnée à ce domaine** (\`site:domaine\`) : d'abord par **SKU** (ou EAN à défaut), puis par **Marque + Nom**. Comme le premier résultat d'un domaine est souvent une page catégorie ou un accessoire, le node **préfère le candidat dont l'URL ou le titre contient le SKU/EAN** ; sinon il retient le premier résultat du domaine.

Une fois la bonne fiche trouvée et validée, son **URL est épinglée** : les runs suivants la réutilisent directement (plus de recherche), ce qui fige le suivi sur la bonne page.`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Appariement automatique vs « à confirmer »',
          md: 'Avant de relever un prix, le node vérifie que la page décrit **exactement** ton produit. Si l\'**EAN relevé sur la page est identique** à celui du produit, l\'appariement est **autoritaire** (confiance 100 %, sans appel au modèle IA). Sinon, un **modèle IA** note la correspondance de 0 à 1 : au-dessus de **0,7** la fiche est épinglée **automatiquement** (statut « auto ») et le prix est relevé ; en dessous, la fiche passe **« à confirmer »** et **aucun prix n\'est relevé** tant que tu n\'as pas tranché.',
        },
        {
          title: 'Valider les correspondances (Confirmer / Rejeter)',
          md: 'Le tableau de bord est en lecture seule pour les **prix**, mais propose **une action** : une file **« À confirmer »** liste les appariements incertains (avec le % de confiance et un lien vers la page). **Confirmer** épingle la fiche → elle sera relevée aux prochains runs ; **Rejeter** l\'écarte **définitivement** → ce couple produit × site est **ignoré** lors de tous les runs suivants (utile quand le concurrent ne vend pas ce produit, ou que la page trouvée est la mauvaise).',
        },
        {
          title: 'Champs à scraper par site',
          md: 'Dans **« Sites concurrents »**, chaque ligne accepte une liste de champs après une barre verticale : `amazon.fr | price, availability`. Sans champs précisés, seul le **prix** (`price`) est relevé. Le scraping réutilise le **moteur du PIM** (données structurées JSON-LD en priorité).',
        },
        {
          title: 'Repérer un mauvais appariement',
          md: 'Dans le comparatif, **survole un prix** : une infobulle **« Relevé : … »** affiche le **nom** et l\'**EAN réellement lus sur la page concurrente**. Si l\'identité relevée ne correspond pas à ton produit, c\'est que la fiche trouvée est la mauvaise — **Rejette** la correspondance pour la corriger. Un prix concurrent **inférieur** au tien s\'affiche en **rouge**.',
        },
        {
          title: 'Identifiant du suivi',
          md: 'Le champ **« Identifiant du suivi »** du node mémorise, entre deux runs, les **URLs concurrentes épinglées** et l\'**historique des prix** (30 derniers relevés par couple produit × site). Garde le même identifiant pour suivre un catalogue dans le temps ; change-le pour démarrer un suivi distinct.',
        },
        {
          title: 'Alertes positionnement & variation',
          md: 'Deux familles d\'alertes : le **positionnement** (comparaison de ton prix — colonne « Mon prix » — à celui des concurrents) et la **variation** (un prix concurrent a changé depuis le dernier run, au-delà du **seuil %** configuré). Le port `changes` du node ne s\'active **que** s\'il y a des alertes — idéal pour n\'envoyer un message Telegram qu\'en cas de mouvement.',
        },
        {
          title: 'Comparer des prix entre sites',
          md: 'Pour un comparatif ponctuel **prix A | prix B | écart** entre plusieurs enseignes (sans alertes), utilise plutôt les nodes **« Produits d\'une page liste »** + **« Comparer les prix »** dans un workflow. Modèles prêts à l\'emploi : **« Comparer mes prix aux concurrents → Excel »** et **« Comparaison de prix quotidienne → Google Sheets »** (cron).',
        },
        {
          title: 'Recevoir les alertes',
          md: 'Branche le port `changes` du node sur **« Envoyer via Telegram »** (« 1 message par ligne ») pour être prévenu à chaque mouvement de prix — y compris quand le workflow tourne en **cron serveur**, navigateur fermé.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Voir aussi

Le détail des nodes (« Veille tarifaire », « Veille prix », « Comparer les prix ») et de la planification **cron serveur** est dans la section **Workflows** ; l'envoi d'alertes est couvert par **Telegram**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Configurer les alertes (Telegram)',
      icon: Send,
    },
  ],
}
