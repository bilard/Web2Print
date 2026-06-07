import { Compass, GitBranch, Wrench, ShoppingCart, Shirt, Sparkles, Car } from 'lucide-react'
import { PALETTES, type DiscoverSlide } from './discover.types'

/**
 * Deck « Découverte » : le même parcours produit décliné dans 5 secteurs.
 * Contenu statique — aucune dépendance Firebase/Fabric.
 */
export const DISCOVER_SLIDES: DiscoverSlide[] = [
  {
    id: 'cover',
    kind: 'cover',
    eyebrow: 'DÉCOUVERTE',
    title: 'Du produit au support, sans rupture',
    subtitle:
      'Web2Print enrichit, compose et exporte vos supports promotionnels — pour tous vos métiers, du B2B au B2C.',
    icon: Compass,
    palette: PALETTES.cyan,
  },
  {
    id: 'overview',
    kind: 'overview',
    eyebrow: 'LA CHAÎNE',
    title: 'Une plateforme, six étapes',
    subtitle: 'Les mêmes modules, déclinés selon votre secteur.',
    icon: GitBranch,
    palette: PALETTES.indigo,
    steps: ['Enrichir', 'Importer', 'Composer', 'Fusionner', 'Exporter', 'Diffuser'],
  },
  {
    id: 'bricolage',
    kind: 'sector',
    eyebrow: 'SECTEUR 01 · B2B',
    sector: 'Bricolage & Outillage',
    title: '300 références, un catalogue prêt à maquetter',
    icon: Wrench,
    palette: PALETTES.amber,
    bullets: [
      { module: 'PIM', text: 'Specs Milwaukee & Bosch scrapées et structurées (clé/valeur), visuels HD récupérés.' },
      { module: 'Workflows', text: 'Crawl → enrichir → exporter en lot, avec escalade anti-bot automatique.' },
      { module: 'Export IDML', text: 'Catalogue InDesign, champs EasyCatalog {{prix}} / {{réf}} conservés.' },
    ],
    modules: ['PIM', 'Bright Data', 'Workflows', 'IDML', 'EasyCatalog'],
  },
  {
    id: 'alimentaire',
    kind: 'sector',
    eyebrow: 'SECTEUR 02 · B2C',
    sector: 'Alimentaire & GMS',
    title: '1 gabarit, 200 promos générées',
    icon: ShoppingCart,
    palette: PALETTES.emerald,
    bullets: [
      { module: 'Image → SVG', text: 'Le packaging est décomposé : fond verrouillé, prix et textes éditables.' },
      { module: 'Fusion de données', text: 'Un template + un tableau → 200 étiquettes et PLV générées automatiquement.' },
      { module: 'Export PDF', text: 'Un seul fichier multi-pages, prêt pour l’impression hebdo.' },
    ],
    modules: ['Image → SVG', 'Data merge', 'Export PDF'],
  },
  {
    id: 'textile',
    kind: 'sector',
    eyebrow: 'SECTEUR 03 · B2C / B2B',
    sector: 'Textile & Mode',
    title: 'Une collection, toutes ses déclinaisons',
    icon: Shirt,
    palette: PALETTES.fuchsia,
    bullets: [
      { module: 'Import PDF → SVG', text: 'La maquette agence devient éditable, bloc par bloc.' },
      { module: 'Éditeur', text: 'Tailles, coloris et accroches ajustés sans rouvrir InDesign.' },
      { module: 'Export SVG + PPTX', text: 'Lookbook web et présentation showroom depuis le même document.' },
    ],
    modules: ['PDF → SVG', 'Éditeur', 'SVG', 'PPTX'],
  },
  {
    id: 'cosmetique',
    kind: 'sector',
    eyebrow: 'SECTEUR 04 · B2C premium',
    sector: 'Cosmétique & Beauté',
    title: 'Six ambiances fidèles à la charte',
    icon: Sparkles,
    palette: PALETTES.rose,
    bullets: [
      { module: 'Import PDF → SVG', text: 'L’affiche est détourée : photo, titre et prix isolés et modifiables.' },
      { module: 'IA créative', text: 'Nano Banana Pro génère les déclinaisons par parfum, fidèles à la marque.' },
      { module: 'DAM + Export', text: 'Visuels rangés, réutilisables, exportés en print boutique et en social.' },
    ],
    modules: ['PDF → SVG', 'Nano Banana', 'DAM', 'Export'],
  },
  {
    id: 'auto-moto',
    kind: 'sector',
    eyebrow: 'SECTEUR 05 · B2B terrain',
    sector: 'Accessoires auto / moto',
    title: 'Une fiche sur-mesure, par simple message',
    icon: Car,
    palette: PALETTES.sky,
    bullets: [
      { module: 'Telegram', text: 'Le commercial demande la fiche depuis son téléphone, en clientèle.' },
      { module: 'Prompt-to-Flow', text: 'L’IA génère le workflow : enrichir → composer → exporter.' },
      { module: 'Diffusion', text: 'Le PDF revient dans la conversation, Drive et Gmail en copie.' },
    ],
    modules: ['Telegram', 'Prompt-to-Flow', 'Workflows', 'Drive', 'Gmail'],
  },
  {
    id: 'recap',
    kind: 'recap',
    eyebrow: 'EN RÉSUMÉ',
    title: 'Cinq métiers, une seule chaîne',
    subtitle: 'Enrichir · Importer · Composer · Fusionner · Exporter · Diffuser',
    icon: Compass,
    palette: PALETTES.cyan,
    modules: [
      'PIM', 'Bright Data', 'Taxonomies', 'DAM', 'Import PDF / IDML',
      'Image → SVG', 'Éditeur', 'Data merge', 'Nano Banana',
      'IDML', 'EasyCatalog', 'PPTX', 'SVG', 'Export PDF',
      'Workflows', 'Prompt-to-Flow', 'Telegram', 'Drive', 'Gmail',
    ],
  },
]
