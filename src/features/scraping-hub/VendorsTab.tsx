import { useEffect, useMemo, useState } from 'react'
import { Loader2, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { listTemplates } from '@/features/scraping-templates/templatesStore'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'

export function VendorsTab() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<ScrapingTemplate[] | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((err) => {
        toast.error('Échec du chargement : ' + (err as Error).message)
        setTemplates([])
      })
  }, [])

  const grouped = useMemo(() => {
    if (!templates) return {} as Record<string, ScrapingTemplate[]>
    return templates.reduce<Record<string, ScrapingTemplate[]>>((acc, t) => {
      const key = t.vendorDomain || '(sans domaine)'
      if (!acc[key]) acc[key] = []
      acc[key].push(t)
      return acc
    }, {})
  }, [templates])

  if (!templates) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
        Aucun template. Crée-en un dans « Templates scraping ».
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-4xl mx-auto space-y-2">
        {entries.map(([vendor, items]) => {
          const vendorPrompt = items.find((t) => t.vendorPrompt)?.vendorPrompt ?? ''
          const isOpen = expanded[vendor] ?? true
          return (
            <div key={vendor} className="border border-white/10 rounded-lg overflow-hidden bg-black/30">
              <button
                onClick={() => setExpanded((e) => ({ ...e, [vendor]: !isOpen }))}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/40" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
                <span className="text-[13px] font-semibold text-white/80">{vendor}</span>
                <span className="text-[11px] text-white/40">{items.length} template{items.length > 1 ? 's' : ''}</span>
                {vendorPrompt && <span className="ml-auto text-[10px] text-sky-400/60">prompt fournisseur défini</span>}
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  {vendorPrompt && (
                    <div className="mb-2 p-2 bg-sky-500/[0.05] border border-sky-400/20 rounded">
                      <div className="text-[10px] text-sky-300/70 uppercase tracking-wider mb-1">Prompt fournisseur</div>
                      <div className="text-[11px] text-white/70 whitespace-pre-wrap font-mono leading-relaxed">{vendorPrompt}</div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => navigate(`/scraping-templates?id=${t.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] text-left text-[11px] group"
                      >
                        <span className="text-white/80 flex-1">{t.name}</span>
                        <span className="text-white/30">{t.fields.length} champs</span>
                        {t.stats && t.stats.appliedCount > 0 && (
                          <span className="text-emerald-400/60">{t.stats.successCount}/{t.stats.appliedCount} ok</span>
                        )}
                        <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
