import { BookOpen, Database } from 'lucide-react'
import type { HelpSection } from './types'

export const scrapingHubSection: HelpSection = {
  id: 'scraping-hub',
  title: 'Scraping Hub',
  category: 'Données',
  intro: 'Le centre de contrôle du scraping : règles d\'équipe, vue par fournisseur et debug des extractions.',
  blocks: [
    {
      type: 'text',
      md: `Le **Scraping Hub** centralise la gouvernance du scraping en trois onglets.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-hub' },
      label: 'Ouvrir Scraping Hub',
      icon: BookOpen,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Règles',
          md: 'Les **règles rédactionnelles** de l\'équipe (markdown) : conventions de nommage, formats de prix, langue des descriptions… Stockées dans Firestore et **partagées par toute l\'équipe**, elles servent de référence commune aux enrichissements. L\'édition requiert la permission *Éditer les règles de scraping*.',
        },
        {
          title: 'Fournisseurs & Templates',
          md: 'Vue d\'ensemble de **tous les templates groupés par domaine fournisseur** : déplie un fournisseur pour voir ses templates et leur état, et ouvre directement l\'éditeur de template d\'un clic.',
        },
        {
          title: 'Debug Jina/LLM',
          md: 'Le **journal des dernières requêtes** de scraping (30 max, rafraîchi toutes les 2 s) : pour chaque appel, le contenu renvoyé par Jina et la réponse du LLM. Indispensable pour comprendre pourquoi un champ revient vide — bouton **Vider** pour repartir à zéro.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Règles : éditeur markdown avec aperçu live

L'onglet **Règles** est un éditeur **côte à côte** : tu écris du markdown à gauche, le rendu s'affiche en direct à droite (titres, listes, tableaux GFM). Le champ est **pré-rempli d'un canevas** quand il est vide — quatre sections types *Conventions de nommage*, *Prix*, *Descriptions* et *Pièges connus* — pour donner le bon point de départ. Le bouton **Enregistrer** reste grisé tant que rien n'a changé et l'app mémorise l'auteur de la dernière modification (ton e-mail). La lecture est ouverte à tous ; **seule la permission \`scrapingHub.edit\`** fait apparaître le bouton d'enregistrement.`,
    },
    {
      type: 'text',
      md: `### Fournisseurs : prompt par domaine, champs et taux de réussite

Sous chaque domaine fournisseur, tu retrouves le **prompt fournisseur** s'il en existe un (encadré bleu, badge « prompt fournisseur défini ») : ces consignes propres au site s'appliquent à tous ses templates. Chaque template affiche son **nombre de champs** et, dès qu'il a tourné, son **taux de réussite** (\`succès / applications ok\`) — pratique pour repérer un template qui décroche. Les fournisseurs sont triés par ordre alphabétique ; les templates sans domaine sont regroupés sous « (sans domaine) ». Un clic ouvre le template dans son éditeur.`,
    },
    {
      type: 'text',
      md: `### Debug : un journal LOCAL à ce navigateur

Le journal de debug est stocké **en local sur ce poste** (localStorage), pas dans Firestore : il n'est donc **pas partagé** avec l'équipe et ne reflète que tes propres enrichissements récents. Chaque entrée est typée **Jina** (URL appelée, en-têtes, réponse markdown — tronquée à 50 Ko) ou **LLM** (fournisseur, modèle, tâche, température, messages par rôle, éventuel outil appelé). Déplie une entrée pour voir le détail, avec son horodatage. Au-delà du rafraîchissement automatique toutes les 2 s, un bouton **Rafraîchir** force une relecture immédiate.`,
    },
    {
      type: 'text',
      md: `### Voir aussi

La création des templates se fait dans **Templates scraping** ; le mode d'emploi général (Scrape, Map + Extract, Crawl, limites anti-bot) est dans **Scraping produits**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Ouvrir Templates scraping',
      icon: Database,
    },
  ],
}
