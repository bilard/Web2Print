import { ScrollText, ShieldCheck, Settings } from 'lucide-react'
import type { HelpSection } from './types'

export const auditLogSection: HelpSection = {
  id: 'audit-log',
  title: "Journal d'audit & Mon activité",
  category: 'Administration',
  intro:
    "Qui a fait quoi, quand. Chaque utilisateur retrouve ses propres actions dans « Mon activité » ; l'administrateur voit tout dans le « Journal », filtrable et avec l'avant/après de chaque changement.",
  blocks: [
    {
      type: 'text',
      md: `IBS-Studio journalise les actions importantes : qui les a faites, quand, sur quoi, et — pour les changements de valeur — **avant → après**. Deux écrans selon ton rôle :

- **Mon activité** (tout le monde) : tes propres actions, dans **Réglages → Mon activité**.
- **Journal** (administrateur) : *toutes* les actions de *tous* les utilisateurs, dans **Utilisateurs & rôles → Journal**.`,
    },
    {
      type: 'text',
      md: `### Les filtres : QUI / QUOI / QUAND

- **Type** : le module concerné (Accès, Données, Export, Workflows, IA, Réglages…).
- **Quoi** : l'action précise (la liste se restreint au type choisi).
- **Qui** *(Journal admin uniquement)* : l'utilisateur.
- **Quand** : une plage de dates (Du / au).

Chaque ligne montre **Quand · Action · Module · Cible**. Quand une valeur change, une ligne s'affiche dessous : **Avant** (en orange) **→ Après** (en vert) — ex. \`Avant : 79,95 € → Après : 84,95 €\`.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.settings' },
      label: 'Réglages → Mon activité',
      icon: Settings,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Utilisateurs & rôles → Journal (admin)',
      icon: ShieldCheck,
    },
    {
      type: 'text',
      md: `### Ce qui est journalisé

- **Accès / rôles** : connexion, attribution/retrait de rôle, blocage/déblocage, permission accordée/révoquée, rôle modifié, suppression d'utilisateur.
- **Données** : import, enregistrement (avec la taille lignes/colonnes), renommage, déplacement, suppression d'une base, et **édition manuelle d'une cellule** (valeur avant → après).
- **Projets** : création, modification, renommage, duplication, suppression ; **versions** (création, restauration, snapshot auto).
- **Exports** : PDF, PNG, PPTX, SVG, HTML, IDML, pack social, pages déclinées, export par lot.
- **Automatisation / IA** : exécution de workflow, complétion de colonne, génération de workflow.
- **Réglages** : thème, modèle IA par défaut, budget IA mensuel.

> Les remplissages **en masse** (IA, taxonomie, enrichissement) et la **sauvegarde automatique** ne sont pas journalisés ligne par ligne, pour ne pas noyer le journal.`,
    },
    {
      type: 'text',
      md: `### Vider son historique

Dans **Mon activité**, le bouton **« Vider l'historique »** (avec confirmation) supprime **tes propres** entrées. Chaque utilisateur ne peut effacer que les siennes ; l'administrateur peut tout supprimer.

> Le journal est volontairement **immuable** (une entrée n'est jamais modifiée). La purge est la seule suppression possible, et elle est tracée par l'absence d'entrées — utile pour nettoyer des données de test.`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: "Je ne vois pas l'avant/après sur d'anciennes lignes",
          md: `Le détail (avant → après, ou la taille) n'apparaît que sur les actions **postérieures** à l'ajout de la fonctionnalité. Les entrées sont **immuables** : elles ne se complètent pas rétroactivement. Refais l'action pour voir le détail sur la nouvelle entrée.`,
        },
        {
          title: 'Pourquoi deux « DataSet enregistré » de suite ?',
          md: `Chaque sauvegarde de base crée une entrée. Si la **taille** (lignes/colonnes) n'a pas changé, la ligne montre seulement la taille ; si tu as ajouté/supprimé des lignes, elle montre l'avant → après. Pour suivre une **valeur** précise, regarde plutôt l'action « Cellule modifiée ».`,
        },
        {
          title: 'Qui peut voir le Journal complet ?',
          md: `Seul l'**administrateur** (ou le propriétaire) voit le Journal de tous les utilisateurs, avec le filtre **Qui**. Un utilisateur standard ne voit que **ses** actions, dans Réglages → Mon activité.`,
        },
      ],
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Ouvrir Utilisateurs & rôles',
      icon: ScrollText,
    },
  ],
}
