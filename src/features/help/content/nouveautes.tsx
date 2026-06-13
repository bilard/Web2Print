import { Workflow, FileSpreadsheet, Image as ImageIcon, Send } from 'lucide-react'
import type { HelpSection } from './types'

/**
 * Notes de version in-app : récapitulatif des nouveautés, groupées par module,
 * avec renvoi vers les sections détaillées du manuel. À enrichir à chaque vague.
 */
export const nouveautesSection: HelpSection = {
  id: 'nouveautes',
  title: 'Nouveautés',
  category: 'Démarrage',
  intro: 'Ce qui vient d\'arriver dans l\'application — juin 2026.',
  blocks: [
    {
      type: 'text',
      md: `### Navigation & confort

- **Palette de commandes ⌘K / Ctrl+K** : projets récents, modules, actions rapides — depuis n'importe quelle page.
- **Centre de notifications (🔔 en bas à gauche)** : historique des runs de workflows et des exports, badge de non-lus.
- **États vides actionnables** : les écrans vides proposent désormais le prochain pas (ex : DAM vide → « Créer une image par IA »).

_Détails : section **Navigation & visites guidées**._`,
    },
    {
      type: 'text',
      md: `### Éditeur

- **Barre contextuelle flottante** sous la sélection (dupliquer, plans, grouper, verrouiller, supprimer) + **badge temps réel** pendant les manipulations (X/Y, L×H, angle).
- **Preflight d'impression** (panneau Impression → Analyser) : images basse résolution, objets hors page, textes trop petits ou trop près du bord.
- **Éléments maîtres** : clic droit → « Répéter sur toutes les pages » (logo, pagination, mentions).
- **Kit de marque** et **styles d'objets** globaux (panneau Palette) : couleurs et styles partagés entre tous vos projets.
- **Versions** : snapshots du document avec restauration en un clic (panneau Versions).

_Détails : section **L'éditeur**._`,
    },
    {
      type: 'text',
      md: `### Re-skin de promo (éditeur × PIM × IA)

- Source **« Produits PIM (re-skin) »** dans le panneau Données : chaque produit devient une ligne — naviguer entre les produits re-skinne le visuel instantanément.
- **« Lier automatiquement »** : prix, titre et description détectés et liés en un clic.
- **« Fond IA (Nano Banana) »** : régénère le fond d'un flyer décomposé à partir d'un prompt, sans toucher aux textes éditables.
- **« Réduire pour tenir dans la zone »** (champ texte sélectionné) : la taille du texte s'adapte à chaque produit pour ne jamais déborder de sa boîte — idéal pour des noms ou descriptions de longueurs très variables.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Ouvrir le PIM',
      icon: FileSpreadsheet,
    },
    {
      type: 'text',
      md: `### PIM & données

- **Pastille de complétude** sur chaque ligne (champs manquants au survol) + moyenne en barre d'état.
- **Vue galerie** : produits en cartes (visuel, titre, prix, complétude).

_Détails : section **PIM**._`,
    },
    {
      type: 'text',
      md: `### Workflows & automatisation

- **Galerie de modèles** 1-clic (Scraper → PIM, veille, recherche web…).
- Node **« Approbation Telegram »** : le run se met en pause jusqu'au clic ✅/❌.
- Node **« Veille prix »** : alerte seulement quand un prix bouge (fonctionne en cron serveur).
- Node **« Cron »** : planification **côté serveur** (minute → mois, heure précise, Europe/Paris) — vos workflows tournent navigateur fermé.
- **Webhook entrant** : déclenchez un workflow depuis l'extérieur (Zapier, ERP, curl).
- **Mode « Pas à pas »** : exécution node par node avec inspection des sorties.

_Détails : section **Workflows**._`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.workflows' },
      label: 'Ouvrir Workflows',
      icon: Workflow,
    },
    {
      type: 'text',
      md: `### Telegram sans navigateur (répondeur serveur)

- **Le bot répond app fermée** : questions avec recherche web automatique (sources citées), \`/flow\` généré **et exécuté côté serveur**, \`/run\` d'un workflow sauvegardé.
- **Google côté serveur** : connectez **« Google — accès serveur »** une fois (Paramètres → Connecteurs) → \`/flow\` peut créer des **Google Sheets** dans votre Drive et envoyer des **Gmail**, navigateur fermé.
- Seuls les workflows à **rendu graphique** (PDF, visuels) attendent l'ouverture de l'app — un message vous prévient.

_Détails : section **Telegram**._`,
    },
    {
      type: 'text',
      md: `### DAM, Telegram & export

- **Tagging IA automatique** des images sauvegardées + **filtre en langage naturel** dans « Mes images ».
- **Digest Telegram quotidien** (opt-in, 08:00) : résumé des dernières 24 h.
- **Pack social** à l'export : carré, story, paysage et bannière en un zip.
- **Pages déclinées** à l'export : crée une page **éditable** par format (carré, story, paysage, bannière), design mis à l'échelle et centré, ajustable à la main — sans génération d'image.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images' },
      label: 'Ouvrir le DAM',
      icon: ImageIcon,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
  ],
}
