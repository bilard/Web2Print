import { ShieldCheck } from 'lucide-react'
import type { HelpSection } from './types'

export const analyticsSection: HelpSection = {
  id: 'analytics',
  title: 'Fréquentation & trafic',
  category: 'Administration',
  intro:
    "Un tableau de bord d'audience complet — visiteurs, pages vues, pays, journal détaillé et trafic en direct — mesuré par IBS-Studio lui-même : aucune donnée n'est envoyée à un service tiers.",
  blocks: [
    {
      type: 'text',
      md: `IBS-Studio embarque sa **propre mesure d'audience** : un petit script (beacon) enregistre chaque page vue du **site public** (accueil, promo, docs) et de l'**application**, l'envoie à une Cloud Function, et tout est stocké dans **votre** Firestore. Pas de Google Analytics, pas de cookie tiers, pas de données qui sortent de chez vous.

Le tableau de bord vit dans l'onglet **Analytics** du module **Utilisateurs & rôles** (réservé aux administrateurs et au propriétaire). Une version mobile installable, la PWA **« Pulse »**, affiche les mêmes données sur votre téléphone.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Ouvrir Utilisateurs & rôles',
      icon: ShieldCheck,
    },
    {
      type: 'text',
      md: `### Périodes, filtres et indicateurs — le bandeau épinglé

En haut du tableau de bord, un bandeau regroupe la période, les filtres et les indicateurs clés. Il reste **épinglé en haut pendant le défilement** : vous gardez le contexte sous les yeux en parcourant le graphe, le journal ou la carte.

- **Période** : **Aujourd'hui** (depuis minuit, heure locale), **7 j**, **30 j**, **90 j** (par défaut), **12 mois**, ou **Perso** (dates « Du / Au » libres).
- **Filtres** : **Zone** (Site web / Application), **Appareil** (Ordinateur, Mobile, Tablette), **Pays**, **Page**, **Source** et **Utilisateur** (comptes connectés, résolus en nom/e-mail).
- **Indicateurs** : **Pages vues**, **Visiteurs uniques**, **Sessions** et **Durée moy. session**, chacun avec sa **variation en %** par rapport à la période précédente de même durée (vert = hausse, rouge = baisse). Pour « Aujourd'hui », la comparaison est équitable : hier, sur la même tranche horaire déjà écoulée.

Tous les panneaux du tableau de bord (graphe, journal, carte, pays…) réagissent instantanément à la période et aux filtres choisis.`,
    },
    {
      type: 'text',
      md: `### Le graphe de trafic

La courbe du haut trace l'activité sur la période :

- **Pages vues** (aplat indigo) et **Visiteurs** (cyan), point par point.
- **Connexions (cumul)** (pointillés orange, axe de droite) : la courbe grimpe jusqu'au **total de connexions de la période**, affiché directement dans la légende.

Le regroupement se fait par **jour local** (pas UTC) : un événement compte le même jour dans le graphe et dans le journal. Sur la période **Aujourd'hui**, la granularité passe automatiquement **à l'heure** — vous voyez l'activité heure par heure depuis minuit.`,
    },
    {
      type: 'text',
      md: `### Le journal de consultation

Le panneau **« Journal de consultation »** répond à la question *qui · quand · quelle page*, avec les colonnes **Utilisateur · Page · Appareil · Lieu · Date & heure** (l'appareil précise le système et le navigateur ; le lieu affiche « Ville, Pays » en clair).

- **Groupé par utilisateur** (mode par défaut) : un bloc repliable par personne (cliquez l'en-tête pour le replier), avec le nombre de consultations, la date de la dernière, et une **pagination propre à chaque groupe** (8 lignes par page).
- Les **visiteurs anonymes** forment un bloc « Anonyme » **sous-groupé par pays**, triés par nombre de consultations — avec un lien « +N autres » pour déplier chaque pays.
- Le bouton **« Liste »** bascule en chronologie simple paginée ; **« Grouper »** revient au mode groupé.
- Chaque colonne a son **filtre déroulant** (utilisateur, page, appareil, pays, jour), cumulable avec les filtres du bandeau.`,
    },
    {
      type: 'text',
      md: `### Pays, villes et carte du monde

- La **carte du monde** situe les connexions ville par ville.
- Le panneau **« Pays »** liste les villes **groupées par pays**, pays **triés par visites décroissantes**, avec pour chacun le total, une barre de proportion, la **date de dernière visite** et le détail des villes (repliable au chevron).
- Cliquez un pays dans le panneau : il est **mis en évidence sur la carte** (et inversement) ; recliquez pour désélectionner.

La géolocalisation se fait par adresse IP via la base **DB-IP** (licence CC BY 4.0, attribution affichée sous le tableau de bord) — là encore sans appel à un service tiers au moment de la visite.`,
    },
    {
      type: 'text',
      md: `### « Trafic en direct » et alertes Telegram

Le panneau **« Trafic en direct »** affiche le flux **temps réel** des visites, au même format que Telegram : 🟢 une ligne par page vue d'un **utilisateur connecté** (nom résolu), 🔵 l'arrivée d'un **visiteur anonyme** — avec la zone, la page, le drapeau et le lieu, la date et l'heure. Vos propres visites n'y figurent jamais.

Le bouton **« Alertes Telegram »** (cloche, en haut à droite) active ou coupe le **log live sur Telegram** : le propriétaire reçoit une notification à chaque nouvelle session anonyme et une ligne par page consultée par un utilisateur connecté. L'interrupteur agit **côté serveur avec effet immédiat** (sans redéploiement), et vos propres visites ne sont jamais notifiées — vous ne vous suivez pas vous-même.`,
    },
    {
      type: 'text',
      md: `### Export CSV, « Supprimer le résultat » et « Vider »

- **CSV** : télécharge les consultations de la période et des filtres affichés, pour analyse dans un tableur.
- **« Supprimer le résultat »** : supprime **définitivement** les consultations correspondant à la période **et aux filtres affichés** (zone, appareil, pays, page, source, utilisateur) — le reste de l'historique n'est pas touché. Une confirmation indique le nombre exact de lignes concernées. Idéal pour nettoyer des visites de test.
- **« Vider »** : supprime **tout** l'historique de consultation, toutes périodes confondues (avec confirmation). Irréversible.`,
    },
    {
      type: 'text',
      md: `### « Pulse » — la PWA mobile

**Pulse** est la version mobile du tableau de bord, à l'adresse **/pulse** : connexion Google puis contrôle du rôle administrateur, et vous retrouvez **les mêmes données** — indicateurs, tendance, filtres et périodes, journal groupé par utilisateur, pays en clair et trafic en direct — dans une interface **responsive** pensée pour le téléphone (le mode paysage et la tablette réorganisent les sections).

Installez-la sur l'écran d'accueil comme une application : elle se **met à jour automatiquement** au réveil dès qu'une nouvelle version du site est déployée, sans réinstallation.`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Pourquoi mes propres visites ne sont-elles pas comptées ?',
          md: `Le compte **propriétaire est exclu du tracking côté serveur** : ses pages vues ne sont ni enregistrées ni notifiées, y compris sur les pages publiques (le dernier compte connecté sur le navigateur est reconnu même sans être authentifié sur la landing). Les statistiques reflètent donc uniquement le trafic réel de vos visiteurs et utilisateurs.`,
        },
        {
          title: 'Que distingue le filtre « Zone » ?',
          md: `**Site web** = les pages publiques (accueil, landing promo, documentation) ; **Application** = l'usage de l'app par les utilisateurs connectés (chaque module ouvert dans le dashboard compte comme une page, même sans changement d'URL). Pratique pour séparer l'audience marketing de l'activité produit.`,
        },
        {
          title: "« Aucune donnée de trafic sur cette période »",
          md: `Le message apparaît quand aucune consultation n'existe dans la fenêtre choisie : élargissez la période (90 j, 12 mois) ou vérifiez les dates « Du / Au » en mode **Perso**. Si des données existent mais que la combinaison de filtres ne retient rien, le message devient « Aucune donnée pour ces filtres » — remettez les filtres sur « Tous ».`,
        },
      ],
    },
    {
      type: 'text',
      md: `### Bon à savoir

- Le tableau de bord est **réservé aux administrateurs et au propriétaire** (onglet Analytics du module Utilisateurs & rôles, et PWA Pulse).
- Le **propriétaire est exclu du tracking** : ses visites ne polluent ni les statistiques, ni le trafic en direct, ni les alertes Telegram.
- Les données sont **hébergées chez vous** (votre Firestore) et collectées par votre propre Cloud Function : **rien n'est transmis à un service d'analytics tiers**.
- La géolocalisation par IP s'appuie sur la base **DB-IP** (CC BY 4.0), consultée côté serveur.`,
    },
  ],
}
