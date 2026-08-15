// L'article d'aide du module Dashboard BI.
//
// ⚠⚠ Il ne RECOPIE pas la documentation : il la RÉCITE. Le texte vient de
// `features/bi/help/biDocContent`, les illustrations sont les vrais visuels montés sur les
// jeux d'exemple, et le PDF (`npm run doc:bi`) part exactement des mêmes sources. Une aide
// rédigée à part aurait divergé au premier visuel modifié.
import { lazy } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { meta, wells, visuals, gestures, rules } from '@/features/bi/help/biDocContent'
import type { HelpBlock, HelpSection } from './types'

/**
 * ⚠⚠ Chargé À LA DEMANDE, et c'est indispensable : le site /docs/ est généré en Node à
 * partir de cet index, et un import direct y tirerait chart.js, three.js et tout l'éditeur
 * de tuiles dans un processus sans `document`. Le contenu TEXTUEL, lui, reste importé — il
 * est pur, et c'est lui que le générateur statique lit.
 */
const BiVisualSample = lazy(() => import('@/features/bi/help/BiVisualSample')
  .then((m) => ({ default: m.BiVisualSample })))

/** Un tableau à deux colonnes en markdown — la forme que `HelpSectionView` sait rendre. */
const table = (head: [string, string], rows: [string, string][]): string => [
  `| ${head[0]} | ${head[1]} |`,
  '| --- | --- |',
  ...rows.map(([k, v]) => `| **${k}** | ${v.replace(/\s*\n\s*/g, ' ')} |`),
].join('\n')

const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ')

/** Un visuel : son illustration VIVANTE, puis les trois choses qu'il faut en savoir. */
const visualBlocks = (v: (typeof visuals)[number]): HelpBlock[] => [
  { type: 'text', md: `### ${v.name}\n\n${clean(v.what)}` },
  { type: 'mockup', Component: () => <BiVisualSample id={v.shot} /> },
  {
    type: 'text',
    md: `**Il lui faut** ${clean(v.needs)}\n\n> **À savoir** ${clean(v.trap)}`,
  },
]

export const dashboardBiSection: HelpSection = {
  id: 'dashboard-bi',
  title: meta.title,
  category: 'Données',
  intro: meta.subtitle,
  blocks: [
    { type: 'text', md: clean(meta.intro) },
    { type: 'menu-link', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.bi' },
      label: 'Ouvrir le Dashboard BI', icon: LayoutDashboard },

    { type: 'text', md: `## ${wells.title}\n\n${clean(wells.intro)}` },
    { type: 'text', md: table(['Zone', 'Ce qu’elle prend'], wells.rows as [string, string][]) },
    { type: 'text',
      md: `**Trois refus qu’on rencontre vite**\n\n${wells.traps.map((x) => `- ${clean(x)}`).join('\n')}` },

    { type: 'text', md: '## Les visuels' },
    ...visuals.flatMap(visualBlocks),

    { type: 'text', md: `## ${gestures.title}` },
    { type: 'text', md: table(['Geste', 'Ce qu’il fait'], gestures.rows as [string, string][]) },

    { type: 'text', md: `## ${rules.title}\n\n${clean(rules.intro)}` },
    { type: 'text', md: table(['Règle', 'Pourquoi'], rules.rows as [string, string][]) },
  ],
}
