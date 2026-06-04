import { ShieldCheck } from 'lucide-react'
import type { HelpSection } from './types'

export const accessSection: HelpSection = {
  id: 'access',
  title: 'Utilisateurs & rôles',
  category: 'Administration',
  intro: 'Approuver les comptes, attribuer des rôles et régler finement les permissions. Réservé au propriétaire.',
  blocks: [
    {
      type: 'text',
      md: `Cet écran permet au **propriétaire** de contrôler **qui accède à quoi**. Les droits sont organisés par **rôles** (jeux de permissions réutilisables) et peuvent être ajustés **utilisateur par utilisateur**.

> ⚠️ Le module **« Utilisateurs & rôles »** n'est visible que par le **propriétaire** (compte admin).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Ouvrir Utilisateurs & rôles',
      icon: ShieldCheck,
    },
    {
      type: 'text',
      md: `### Onboarding d'un nouvel utilisateur

1. La personne se connecte via Google : son compte est d'abord **« en attente »** (aucun accès).
2. Dans l'onglet **Utilisateurs**, tu lui **attribues un rôle**.
3. À sa prochaine ouverture, l'app n'affiche que les modules autorisés par son rôle.`,
    },
    {
      type: 'text',
      md: `### Onglet « Utilisateurs »`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Attribuer un rôle',
          md: 'Choisis le rôle de chaque utilisateur dans une liste déroulante. Le rôle définit l\'ensemble de base de ses permissions.',
        },
        {
          title: 'Surcharges granulaires',
          md: 'Au-delà du rôle, tu peux **accorder** ou **retirer** des permissions individuelles à un utilisateur précis (ex. lui ouvrir l\'export sans changer son rôle). *Réinitialiser les surcharges* efface ces ajustements.',
        },
        {
          title: 'Bloquer / réactiver',
          md: '**Bloquer** suspend totalement un compte sans le supprimer : plus aucun accès, même avec un rôle. **Réactiver** lui rend ses droits.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Onglet « Rôles »

Crée et édite les rôles de l'équipe via une **matrice de permissions** par module. Trois vues : **Cartes** (par module), **Arbre** (hiérarchie) et **Carte mentale** (graphe).

Les permissions sont **hiérarchiques** : la visibilité d'un module (*« voir »*) commande ses actions. Décocher *« voir »* désactive toutes les actions du module ; cocher une action réactive automatiquement *« voir »*.`,
    },
    {
      type: 'text',
      md: `### Modules couverts par les permissions

Bibliothèque, Import (par format), DAM, PIM, Taxonomies, Scraping (templates & hub), Workflows, Animation, Chat IA, Telegram et Paramètres — chacun avec ses actions (créer, éditer, supprimer, exporter, exécuter…).`,
    },
    {
      type: 'text',
      md: `### Règles de sécurité

- Les permissions effectives = **rôle** + permissions **accordées** − permissions **retirées**.
- Le **propriétaire** a un accès total **non modifiable**.
- Un utilisateur **ne peut pas modifier ses propres droits** (protection côté serveur Firestore) : aucune escalade de privilèges possible.`,
    },
  ],
}
