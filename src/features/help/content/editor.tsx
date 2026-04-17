import { Save, Download, Type, Image as ImageIcon, Layers } from 'lucide-react'
import type { HelpSection } from './types'
import { ExportButtonMock } from './mockups/ExportButtonMock'
import { ToolBarMock } from './mockups/ToolBarMock'

export const editorSection: HelpSection = {
  id: 'editor',
  title: "L'éditeur",
  category: 'Édition',
  intro: 'Canvas, outils, calques et sauvegarde du projet.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre et des **panneaux** à droite (calques, palette, données).`,
    },
    {
      type: 'screenshot',
      src: '/help/screenshots/editor-layout.png',
      alt: 'Vue générale de l\'éditeur avec ses zones',
      caption: 'Les zones principales de l\'éditeur.',
    },
    { type: 'text', md: '### Barre d\'outils' },
    { type: 'mockup', Component: ToolBarMock },
    {
      type: 'text',
      md: `Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil Image ouvre le panneau Images dans la colonne de droite.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.text' },
      label: 'Outil Texte',
      icon: Type,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.image' },
      label: 'Outil Image',
      icon: ImageIcon,
    },
    { type: 'text', md: '### Calques' },
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
    { type: 'text', md: '### Sauvegarder & exporter' },
    {
      type: 'text',
      md: `La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter ouvre la fenêtre de choix de format (PDF, PNG, PPTX).`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.save' },
      label: 'Bouton Sauvegarder',
      icon: Save,
    },
    { type: 'mockup', Component: ExportButtonMock },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: 'Bouton Exporter',
      icon: Download,
    },
    { type: 'text', md: '### Raccourcis de l\'éditeur' },
    { type: 'shortcut', keys: ['V'], label: 'Outil Sélection' },
    { type: 'shortcut', keys: ['T'], label: 'Outil Texte' },
    { type: 'shortcut', keys: ['R'], label: 'Outil Rectangle' },
    { type: 'shortcut', keys: ['E'], label: 'Outil Ellipse' },
  ],
}
