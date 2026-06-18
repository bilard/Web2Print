import { Network } from 'lucide-react'
import type { HelpSection } from './types'

export const explorerSection: HelpSection = {
  id: 'explorer',
  title: 'Explorateur de données',
  category: 'Données',
  intro: 'Cartographie Firestore : schéma relationnel (ERD) des collections, clés et cardinalités, et inspection des enregistrements en direct. Réservé au propriétaire.',
  blocks: [
    {
      type: 'text',
      md: `Toute votre base, **d'un seul regard**. L'**Explorateur** dessine un **diagramme relationnel (ERD)** de vos collections Firestore — **clés primaires (PK)**, **clés étrangères (FK)** et **cardinalités** (1:1, 1:N) — et trace les liens qui relient projets, produits, taxonomies et bases Excel. **Double-cliquez une table** pour afficher ses enregistrements **en direct** (mise à jour temps réel), avec sélecteur de base et recherche instantanée. Les positions des tables sont **mémorisées** : composez la carte qui vous parle.

> 🔒 Réservé au **propriétaire**. On l'ouvre dans **Paramètres → Données** (l'engrenage en bas de la barre latérale).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.settings' },
      label: 'Ouvrir Paramètres → Données',
      icon: Network,
    },
    {
      type: 'text',
      md: `### Le problème

Une base qui grandit devient **opaque** : on ne sait plus quelles collections existent, comment elles se relient, ni ce qu'elles contiennent réellement — sans ouvrir la console Firebase.`,
    },
    {
      type: 'text',
      md: `### Modèle de données (ERD)

Chaque collection est une **table** avec ses **champs**, sa **clé primaire (PK)** et ses **clés étrangères (FK)** ; les relations métier sont tracées avec leur **cardinalité** (1:1, 1:N). Le diagramme est rendu avec **ReactFlow** : on visualise d'un coup la structure complète de la plateforme.`,
    },
    {
      type: 'text',
      md: `### Données live

Un **double-clic** sur une table ouvre le **contenu réel** de la collection, mis à jour en **temps réel** (*onSnapshot*). Pour les **bases Excel**, un **sélecteur** liste chaque base et n'affiche que ses colonnes utiles. **Filtre instantané** et **pagination** (50 lignes par page) pour parcourir de gros volumes sans peine.`,
    },
    {
      type: 'text',
      md: `### Disposition persistée

**Déplacez les tables** par glisser : leur **position est enregistrée** sur votre profil (Firestore) et **restaurée** à la prochaine ouverture. Composez la cartographie qui correspond à votre lecture de la donnée.`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Étendre le schéma (collections / relations)',
          md: 'Le diagramme se construit à partir de `TABLES` et `RELATIONS` dans `features/data-graph/firestoreSchema.ts`. Ajouter une collection ou un lien = compléter ces deux listes ; le rendu et les cardinalités suivent automatiquement.',
        },
        {
          title: 'Pourquoi propriétaire uniquement',
          md: 'L\'explorateur expose la structure et les données brutes de **tout** l\'espace de travail (tous comptes confondus). L\'onglet **Données** des Paramètres — comme **Firebase** — est donc réservé au **propriétaire**.',
        },
      ],
    },
  ],
}
