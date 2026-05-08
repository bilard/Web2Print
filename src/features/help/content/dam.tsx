import { Image } from 'lucide-react'
import type { HelpSection } from './types'
import { DamGridMock } from './mockups/DamGridMock'

export const damSection: HelpSection = {
  id: 'dam',
  title: 'Bibliothèque d\'assets (DAM)',
  category: 'Édition',
  intro: 'Centraliser images, logos et visuels — uploads, recherche et génération IA.',
  blocks: [
    {
      type: 'text',
      md: `Le DAM (Digital Asset Management) regroupe tous tes visuels accessibles depuis l'éditeur. Une seule source pour les logos, photos produits, illustrations et images générées par IA.`,
    },
    { type: 'mockup', Component: DamGridMock },
    {
      type: 'text',
      md: `### Ce que tu peux faire

- **Uploader** des images locales (drag-drop) → stockées sur Firebase Storage
- **Organiser** par dossiers projet et favoris
- **Rechercher** par texte ou par image (reverse image search)
- **Générer** des images via IA (Gemini / Nano Banana)
- **Crop / éditer** directement dans l'overlay du DAM
- **Glisser** une image dans l'éditeur pour la placer sur le canvas`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images' },
      label: 'Accéder au DAM',
      icon: Image,
    },
    {
      type: 'text',
      md: `### Variants d'images

Pour les produits qui se déclinent en plusieurs couleurs ou découpes, le DAM gère les **variants** : tu uploades l'image principale, le DAM regroupe automatiquement les déclinaisons par parent. Le data-merge peut alors choisir la variante adéquate selon la ligne produit.`,
    },
    {
      type: 'text',
      md: `### Génération IA

Quand tu n'as pas d'image fournisseur (ou pas la bonne résolution), le DAM peut en générer :

1. Onglet **Générer**
2. Décris l'image en français ou en anglais
3. Choisis le format (carré, paysage, portrait)
4. L'image générée par Gemini est ajoutée automatiquement au DAM

Utilise la génération IA pour : visuels d'ambiance, mockups produits, illustrations éditoriales. Pour les photos produits réelles, utilise l'upload ou le scraping.`,
    },
    {
      type: 'text',
      md: `### Bonne pratique

Centralise tous tes logos et visuels marque dans le DAM **avant** de commencer un projet. Ainsi, quand tu construis un template, tu drag-and-drop directement depuis le DAM sans avoir à chercher dans tes dossiers locaux.`,
    },
  ],
}
