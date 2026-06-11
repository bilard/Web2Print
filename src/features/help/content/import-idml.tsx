import { LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'

export const importIdmlSection: HelpSection = {
  id: 'import-idml',
  title: 'Import IDML',
  category: 'Import',
  intro: 'Récupérer une maquette InDesign et la transformer en template IBS-Studio.',
  blocks: [
    {
      type: 'text',
      md: `IDML (InDesign Markup Language) est le format d'échange officiel d'InDesign CC+. IBS-Studio parse ce format pour reconstruire la maquette dans son éditeur Fabric.js.`,
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
      md: `### Importer dans IBS-Studio

1. Tableau de bord → **Importer**
2. Sélectionne le \`.idml\`
3. Patiente : le parser extrait formes, textes, images, fonts, ombres et transparence — **toutes les pages** du document (chaque planche devient une page IBS-Studio)
4. Le projet s'ouvre dans l'éditeur

Sont aussi reconnus : les **gabarits (masters)** — leurs objets apparaissent en fond de chaque page —, les **cadres de texte non rectangulaires** (ovale, tracé personnalisé), la **cascade de styles** InDesign (styles de paragraphe/caractère + surcharges locales, styles imbriqués et GREP) et les liens graphiques **EPS / PDF / WMF / pages importées** en plus des images bitmap.

L'éditeur reconstitue la maquette à l'identique sur un canvas Fabric.js. Tu peux ensuite ajouter des placeholders (\`{{title}}\`, \`{{price}}\`…) pour le data-merge.`,
    },
    {
      type: 'text',
      md: `> **Gabarit issu d'EasyCatalog ?** Ses champs sont reconnus **automatiquement** (texte → \`{{placeholders}}\`, cadres image liés) et le réexport IDML les conserve. Voir la rubrique dédiée **EasyCatalog (InDesign)**.`,
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

- **Fonts custom** : si non installées sur la machine → fallback Arial. Pour une fidélité parfaite, charge tes fonts dans \`public/fonts/\`
- **Dégradés** : non importés — les objets dégradés reviennent en couleur unie (à recréer dans l'éditeur si besoin)
- **Effets avancés** (modes de fusion exotiques) : peuvent être approximés

Pour les cas complexes, garde InDesign comme outil de finition : exporte un IDML depuis IBS-Studio après merge, puis ouvre dans InDesign pour ajustement.`,
    },
    {
      type: 'text',
      md: `### Aller-retour InDesign ↔ IBS-Studio

Le cycle classique :

1. **Graphiste** crée la maquette dans InDesign
2. Exporte un IDML
3. **Imprimeur** importe dans IBS-Studio, ajoute placeholders, branche le data-merge
4. **Batch export IDML** (un par produit) ou PDF direct
5. Si finition graphique nécessaire : reimport InDesign sur les fichiers IDML générés

Pas de lock-in : tu retrouves toujours tes données en IDML standard.`,
    },
  ],
}
