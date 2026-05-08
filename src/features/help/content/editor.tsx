import {
  Save, Download, Type, Image as ImageIcon, Layers,
  MousePointer2, Square, Circle, Minus,
  Undo2, Redo2, ZoomIn, ZoomOut, Grid3X3, Magnet, Settings2,
} from 'lucide-react'
import type { HelpSection } from './types'
import { ExportButtonMock } from './mockups/ExportButtonMock'
import { ToolBarMock } from './mockups/ToolBarMock'
import { EditorHeaderMock } from './mockups/EditorHeaderMock'
import { EditorFooterMock } from './mockups/EditorFooterMock'
import { LayersPanelMock } from './mockups/LayersPanelMock'

export const editorSection: HelpSection = {
  id: 'editor',
  title: "L'éditeur",
  category: 'Édition',
  intro: 'Canvas, outils, calques et sauvegarde du projet.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre, des **panneaux** à droite (calques, palette, données) et d'une **barre inférieure** (zoom, taille page, grille, snap).`,
    },
    { type: 'text', md: '### Header' },
    { type: 'mockup', Component: EditorHeaderMock },
    {
      type: 'text',
      md: `Le header affiche le titre du projet et son état de sauvegarde, les boutons **Annuler / Rétablir**, **Sauvegarder** (commit manuel — la sauvegarde est sinon automatique) et **Exporter**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.undo' },
      label: 'Annuler',
      icon: Undo2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.redo' },
      label: 'Rétablir',
      icon: Redo2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.save' },
      label: 'Sauvegarder',
      icon: Save,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: 'Exporter',
      icon: Download,
    },
    { type: 'text', md: '### Barre d\'outils' },
    { type: 'mockup', Component: ToolBarMock },
    {
      type: 'text',
      md: `Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil Image ouvre le panneau Images dans la colonne de droite.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.select' },
      label: 'Sélection',
      icon: MousePointer2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.text' },
      label: 'Texte',
      icon: Type,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.rect' },
      label: 'Rectangle',
      icon: Square,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.ellipse' },
      label: 'Ellipse',
      icon: Circle,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.line' },
      label: 'Ligne',
      icon: Minus,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.image' },
      label: 'Image / DAM',
      icon: ImageIcon,
    },
    { type: 'text', md: '### Calques' },
    { type: 'mockup', Component: LayersPanelMock },
    {
      type: 'text',
      md: `Le panneau **Calques** liste tous les objets du canvas. Tu peux masquer (œil), supprimer (poubelle) ou réordonner un calque par drag-and-drop. Les textes se déplient pour éditer chaque segment séparément.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'layers-panel' },
      label: 'Panneau Calques',
      icon: Layers,
    },
    { type: 'text', md: '### Naviguer dans le canvas' },
    { type: 'mockup', Component: EditorFooterMock },
    {
      type: 'text',
      md: `La barre inférieure pilote la navigation :

- **Zoom** : boutons − / + (pas relatif au zoom courant) ou molette. Plage **1 % → 400 %** — utile pour voir l'ensemble d'un grand format (jusqu'à plusieurs milliers de pixels) ou détailler au pixel près. Clic sur la valeur (ex: \`100%\`) pour revenir à 100 %.
- **Pan** : maintenir **espace** + glisser à la souris.
- **Taille de la page** affichée à côté du zoom — clic ouvre les paramètres de page.
- **Grille** : repère visuel pour aligner.
- **Snap** : aimantation aux objets et à la grille pendant le déplacement.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-out' },
      label: 'Zoom arrière',
      icon: ZoomOut,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-reset' },
      label: 'Zoom 100 %',
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-in' },
      label: 'Zoom avant',
      icon: ZoomIn,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.page-settings' },
      label: 'Paramètres de la page',
      icon: Settings2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.grid' },
      label: 'Grille',
      icon: Grid3X3,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.snap' },
      label: 'Snap',
      icon: Magnet,
    },
    { type: 'text', md: '### Sauvegarder & exporter' },
    {
      type: 'text',
      md: `La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter (voir _Header_ plus haut) ouvre la fenêtre de choix de format (PDF, IDML, PPTX, SVG, PNG) — détaillée dans la section _Export multi-format_.`,
    },
    { type: 'mockup', Component: ExportButtonMock },
    { type: 'text', md: '### Raccourcis de l\'éditeur' },
    { type: 'shortcut', keys: ['V'], label: 'Outil Sélection' },
    { type: 'shortcut', keys: ['T'], label: 'Outil Texte' },
    { type: 'shortcut', keys: ['R'], label: 'Outil Rectangle' },
    { type: 'shortcut', keys: ['E'], label: 'Outil Ellipse' },
    { type: 'shortcut', keys: ['Espace', '⇧ Glisser'], label: 'Pan du canvas' },
    { type: 'shortcut', keys: ['⌘', '0'], label: 'Zoom 100 %' },
  ],
}
