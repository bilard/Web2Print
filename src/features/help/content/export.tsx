import { Download } from 'lucide-react'
import type { HelpSection } from './types'

export const exportSection: HelpSection = {
  id: 'export',
  title: 'Export multi-format',
  category: 'Export',
  intro: 'Sortir un PDF imprimeur, un IDML, un PPTX, un SVG ou un PNG — unitaire ou en série.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur exporte vers cinq formats. Chaque format vise un usage précis.`,
    },
    {
      type: 'text',
      md: `### Formats disponibles

| Format | Usage |
|---|---|
| **PDF** | Catalogue, BAT, fichier imprimeur — supporte print marks et bleed |
| **IDML** | Retour à InDesign pour finition graphique |
| **PPTX** | Présentation commerciale, démo client |
| **SVG** | Web, intégration site, réseaux sociaux statiques |
| **PNG** | Vignettes, miniatures, social media |

Tous les exports sont fidèles à la maquette en cours dans l'éditeur. Le data-merge actif influence le contenu mais pas le format.`,
    },
    {
      type: 'text',
      md: `### Export PDF avec options imprimeur

1. Dans l'éditeur, ouvre le panneau **Export** (icône Download)
2. Choisis **PDF**
3. Active **Marques de coupe** pour ajouter les crop marks aux 4 coins
4. Configure le **bleed** (en mm) : surimpression demandée par ton imprimeur
5. Lance l'export

Les print marks sont rendus en taille physique constante (3.5 mm de longueur, 1 mm d'offset) — identiques quelle que soit la taille du document.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard' },
      label: 'Retour au tableau de bord',
      icon: Download,
    },
    {
      type: 'text',
      md: `### Export batch (plusieurs fichiers)

Quand le data-merge est actif, l'export génère **une variante par ligne** de la BDD :

1. Ouvre le panneau Data Merge → vérifie le mapping placeholders ↔ colonnes
2. Lance l'export → un fichier par ligne (ou un ZIP groupé)
3. Le streaming progressif affiche l'avancement, abandon possible à tout moment

Concrètement : 200 lignes × PDF = 200 PDFs en quelques minutes. Les performances dépendent du modèle de la machine et du nombre d'images embarquées.`,
    },
    {
      type: 'text',
      md: `### Export IDML (retour InDesign)

Quand tu veux que ta graphiste finisse à la main dans InDesign :

1. Configure ta maquette + data-merge dans Web2Print
2. Export **IDML** → Web2Print reconstruit un fichier IDML standard avec les valeurs déjà mergées
3. Ouvre dans InDesign → ajustements graphiques fins
4. Exporte le PDF final depuis InDesign

Ce flow combine **automatisation** (Web2Print fait le merge en série) et **contrôle créatif** (InDesign fait la finition).`,
    },
    {
      type: 'text',
      md: `### Bonnes pratiques

- **Toujours faire un export test** sur 1 ligne avant de lancer un batch de 200 — tu détectes les problèmes de fonts ou d'images manquantes plus vite
- **Vérifier les fonts** : si un fallback Arial s'est appliqué, ton imprimeur le verra. Charge tes fonts dans \`public/fonts/\` au préalable
- **PDF imprimeur** : demande à ton imprimeur la valeur de bleed exacte (souvent 3 ou 5 mm) avant l'export final
- **PPTX** : évite-le pour les cas complexes (multi-masters), préfère PDF + conversion PPTX externe si besoin`,
    },
  ],
}
