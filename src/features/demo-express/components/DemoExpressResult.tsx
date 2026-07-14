// src/features/demo-express/components/DemoExpressResult.tsx
// Panneau « Découvrez vos données » : une carte par module ensemencé, chaque
// bouton deep-linke vers le module (section du Dashboard ou vraie route).
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Image as ImageIcon, BookText, Tag, Clapperboard, Workflow, RotateCcw } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import type { Section } from '@/features/navigation/modules'

interface Card {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  title: string
  desc: string
  action: () => void
  enabled: boolean
}

export function DemoExpressResult() {
  const navigate = useNavigate()
  const company = useDemoExpressStore((s) => s.company)
  const links = useDemoExpressStore((s) => s.links)
  const reset = useDemoExpressStore((s) => s.reset)

  const openSection = (section: Section, intent?: string) =>
    navigate('/dashboard', { state: { section, ...(intent ? { intent } : {}) } })

  const cards: Card[] = [
    {
      icon: FileSpreadsheet, accent: 'text-emerald-400',
      title: 'PIM — données produits',
      desc: `${links.productCount ?? 0} produits enrichis avec taxonomie, dans « ${links.sheetName ?? '—'} ».`,
      action: () => openSection('data'), enabled: !!links.sheetDocId,
    },
    {
      icon: ImageIcon, accent: 'text-pink-400',
      title: 'DAM — images',
      desc: `${links.damCount ?? 0} image(s) produit dans le Drive, dossier « Démo ${company} ».`,
      action: () => openSection('images'), enabled: (links.damCount ?? 0) > 0,
    },
    {
      icon: BookText, accent: 'text-cyan-400',
      title: 'Catalogue studio',
      desc: 'Catalogue monté avec la charte du site et une couverture générée.',
      action: () => links.catalogId && navigate(`/catalog/${links.catalogId}`), enabled: !!links.catalogId,
    },
    {
      icon: Tag, accent: 'text-rose-400',
      title: 'Fiche promo',
      desc: 'Carte promo data-driven aux couleurs du prospect.',
      action: () => openSection('retail-promo', 'retail-promo:action:list'), enabled: !!links.promoId,
    },
    {
      icon: Clapperboard, accent: 'text-violet-400',
      title: 'Animations HTML',
      desc: `${links.animCount ?? 0} fiche(s) produit animée(s) dans le DAM, prêtes à télécharger.`,
      action: () => openSection('images', 'images:tab:videos'), enabled: (links.animCount ?? 0) > 0,
    },
    {
      icon: Workflow, accent: 'text-indigo-400',
      title: `Workflow « Démo ${company} »`,
      desc: 'Un workflow prêt à rejouer le scraping et l’export Excel.',
      action: () => links.workflowId && navigate(`/workflows/${links.workflowId}`), enabled: !!links.workflowId,
    },
  ]

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-white/80 mb-3">Découvrez vos données</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <button
            key={c.title}
            onClick={c.action}
            disabled={!c.enabled}
            className="text-left rounded-xl border border-white/[0.08] bg-surface hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed p-4 transition-colors"
          >
            <c.icon className={`w-5 h-5 mb-2 ${c.accent}`} aria-hidden="true" />
            <p className="text-sm font-medium text-white">{c.title}</p>
            <p className="mt-1 text-xs text-white/50">{c.desc}</p>
          </button>
        ))}
      </div>
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 hover:bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        Nouvelle démo
      </button>
    </div>
  )
}
