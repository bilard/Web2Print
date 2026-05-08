import { LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'

export const importIdmlSection: HelpSection = {
  id: 'import-idml',
  title: 'Import InDesign (IDML)',
  category: 'Import',
  intro: 'Récupérer une maquette InDesign et la transformer en template Web2Print.',
  blocks: [
    {
      type: 'text',
      md: `IDML (InDesign Markup Language) est le format d'échange officiel d'InDesign CC+. Web2Print parse ce format pour reconstruire la maquette dans son éditeur Fabric.js.`,
    },
    {
      type: 'text',
      md: `### Comment exporter un IDML depuis InDesign

1. Ouvre ton document dans InDesign CC ou plus récent
2. **Fichier → Exporter…**
3. Choisis le format **InDesign Markup (IDML)**
4. Enregistre

Le fichier IDML est en réalité un ZIP contenant XML + ressources (fonts, images).`,
    },
    {
      type: 'text',
      md: `### Importer dans Web2Print

1. Tableau de bord → **Importer**
2. Sélectionne le \`.idml\`
3. Patiente : le parser extrait formes, textes, images, fonts, gradients, ombres et transparence
4. Le projet s'ouvre dans l'éditeur

L'éditeur reconstitue la maquette à l'identique sur un canvas Fabric.js. Tu peux ensuite ajouter des placeholders (\`{{title}}\`, \`{{price}}\`…) pour le data-merge.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Importer un fichier',
      icon: LayoutGrid,
    },
    {
      type: 'text',
      md: `### Limites connues

- **Masters InDesign** (pasteboard global) non supportés → utilise des artboards classiques
- **Fonts custom** : si non installées sur la machine → fallback Arial. Pour une fidélité parfaite, charge tes fonts dans \`public/fonts/\`
- **Gradients radiaux/coniques** : simplifiés en linéaires
- **Effets avancés** (modes de fusion exotiques) : peuvent être approximés

Pour les cas complexes, garde InDesign comme outil de finition : exporte un IDML depuis Web2Print après merge, puis ouvre dans InDesign pour ajustement.`,
    },
    {
      type: 'text',
      md: `### Aller-retour InDesign ↔ Web2Print

Le cycle classique :

1. **Graphiste** crée la maquette dans InDesign
2. Exporte un IDML
3. **Imprimeur** importe dans Web2Print, ajoute placeholders, branche le data-merge
4. **Batch export IDML** (un par produit) ou PDF direct
5. Si finition graphique nécessaire : reimport InDesign sur les fichiers IDML générés

Pas de lock-in : tu retrouves toujours tes données en IDML standard.`,
    },
  ],
}
