import { LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'
import { DashboardMock } from './mockups/DashboardMock'

export const gettingStarted: HelpSection = {
  id: 'getting-started',
  title: 'Prise en main',
  category: 'Démarrage',
  intro: 'Connexion, tableau de bord et création du premier projet.',
  blocks: [
    {
      type: 'text',
      md: `IBS-Studio est un éditeur visuel en ligne pour créer, importer et exporter des documents imprimables (print ou présentation).

**Étapes pour démarrer :**

1. **Se connecter** via Google depuis l'écran de connexion.
2. **Choisir une action** dans la barre latérale du tableau de bord.
3. **Créer un projet vierge** ou **importer** un document existant (IDML, PPTX, Excel).`,
    },
    { type: 'mockup', Component: DashboardMock },
    {
      type: 'text',
      md: `_Aperçu du tableau de bord : barre latérale (Projets, PIM, Taxonomies, DAM, Importer) et bibliothèque de projets._`,
    },
    {
      type: 'text',
      md: `### Sections du dashboard

Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'app. Cliquer un lien ci-dessous met l'élément en évidence sur l'écran (ouvre d'abord le tableau de bord si nécessaire). _La liste reflète les modules réellement disponibles pour ton compte._`,
    },
    { type: 'module-links' },
    {
      type: 'text',
      md: `### Créer un projet vierge

Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, formats écran/réseaux sociaux, ou dimensions personnalisées). Le projet s'ouvre directement dans l'éditeur — le format et le **fond de page** (couleur, dégradé ou image) restent modifiables à tout moment dans le panneau **Page**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.new-project' },
      label: 'Ouvrir « Nouveau document »',
      icon: LayoutGrid,
    },
    {
      type: 'text',
      md: `### Retrouver un projet existant

La **Bibliothèque** liste tous tes projets :

- **Ouvrir** : clic simple sur la carte. **Dupliquer / supprimer** : boutons de la carte (ou clic droit).
- **Vignettes ou Liste** : deux boutons en haut à droite basculent l'affichage.
- **Filtrer par taxonomie** : le volet **Taxonomies** à gauche restreint la liste aux projets classés sous le nœud choisi.
- **Sélection multiple** : coche plusieurs projets → barre d'actions (**Tout sélectionner**, **Effacer**, **Supprimer (N)**) pour faire le ménage en une opération.`,
    },
    {
      type: 'text',
      md: `### Raccourcis utiles à connaître`,
    },
    { type: 'shortcut', keys: ['⌘', 'S'], label: 'Sauvegarder le projet' },
    { type: 'shortcut', keys: ['⌘', 'Z'], label: 'Annuler la dernière action' },
    { type: 'shortcut', keys: ['⌘', 'Y'], label: 'Rétablir' },
    { type: 'shortcut', keys: ['⇧', '?'], label: 'Ouvrir / fermer le manuel' },
    {
      type: 'text',
      md: `La section suivante, _L'éditeur_, détaille l'interface et les outils disponibles une fois un projet ouvert.`,
    },
  ],
}
