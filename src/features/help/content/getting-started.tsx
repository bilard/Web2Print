import { LayoutGrid, FilePlus, Upload, Library, Image as ImageIcon, FileSpreadsheet, FolderTree, Database } from 'lucide-react'
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
      md: `Web2Print est un éditeur visuel en ligne pour créer, importer et exporter des documents imprimables (print ou présentation).

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

Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'app. Cliquer un lien ci-dessous met l'élément en évidence sur l'écran (ouvre d'abord le tableau de bord si nécessaire).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.blank' },
      label: 'Nouveau document',
      icon: FilePlus,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Importer',
      icon: Upload,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.library' },
      label: 'Bibliothèque',
      icon: Library,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images' },
      label: 'DAM',
      icon: ImageIcon,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'PIM',
      icon: FileSpreadsheet,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.taxonomies' },
      label: 'Taxonomies',
      icon: FolderTree,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Templates scraping',
      icon: Database,
    },
    {
      type: 'text',
      md: `### Créer un projet vierge

Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, personnalisé). Le projet s'ouvre directement dans l'éditeur.`,
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

La bibliothèque liste tous tes projets. Clic simple pour ouvrir, clic droit pour dupliquer ou supprimer. Les taxonomies permettent de classer les projets par thématique.`,
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
