import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Copy, ChevronRight, Database, ArrowLeft } from 'lucide-react'
import { TemplateEditor } from '@/features/scraping-templates/TemplateEditor'
import { emptyTemplate, listTemplates, deleteTemplate } from '@/features/scraping-templates/templatesStore'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'
import { toast } from 'sonner'

export default function ScrapingTemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<ScrapingTemplate[]>([])
  const [selected, setSelected] = useState<ScrapingTemplate | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await listTemplates()
      setTemplates(list)
      if (selected && list.find((t) => t.id === selected.id)) {
        setSelected(list.find((t) => t.id === selected.id) ?? null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const createNew = () => {
    const t = emptyTemplate('exemple.com')
    setSelected(t)
  }

  const clone = (source: ScrapingTemplate) => {
    const t: ScrapingTemplate = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      stats: { appliedCount: 0, successCount: 0 },
    }
    setSelected(t)
  }

  const onDelete = async (t: ScrapingTemplate) => {
    if (!confirm(`Supprimer le template "${t.name}" ?`)) return
    await deleteTemplate(t.id)
    if (selected?.id === t.id) setSelected(null)
    refresh()
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white/90">
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Database className="w-4 h-4 text-indigo-300" />
          <h1 className="text-sm font-semibold">Templates de scraping</h1>
          <span className="text-[10px] text-white/40">{templates.length} template(s)</span>
        </div>
        <button
          onClick={createNew}
          className="px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/30 text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Nouveau
        </button>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-0 h-[calc(100vh-52px)]">
        {/* Liste */}
        <div className="border-r border-white/[0.06] overflow-y-auto">
          {loading && <div className="p-4 text-[11px] text-white/40">Chargement…</div>}
          {!loading && templates.length === 0 && (
            <div className="p-4 text-[11px] text-white/40">
              Aucun template. Crée-en un avec "Nouveau" pour commencer à mapper un fournisseur.
            </div>
          )}
          {templates.map((t) => {
            const isActive = selected?.id === t.id
            return (
              <div
                key={t.id}
                onClick={() => setSelected(t)}
                className={`cursor-pointer px-3 py-2 border-b border-white/[0.04] transition-colors ${isActive ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-white/90 truncate">{t.name}</div>
                    <div className="text-[10px] text-white/40 truncate font-mono">{t.vendorDomain}</div>
                    <div className="text-[9px] text-white/30 mt-0.5">
                      {t.fields.length} champ{t.fields.length > 1 ? 's' : ''} · {t.specGroups.length} groupe{t.specGroups.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); clone(t) }}
                      className="text-white/40 hover:text-white/80"
                      title="Cloner"
                    ><Copy className="w-3 h-3" /></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(t) }}
                      className="text-red-400/60 hover:text-red-400"
                      title="Supprimer"
                    ><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {isActive && <ChevronRight className="w-3 h-3 text-indigo-300 shrink-0" />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Editeur */}
        <div className="overflow-y-auto p-4">
          {selected ? (
            <TemplateEditor
              template={selected}
              onChange={setSelected}
              onSaved={refresh}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-white/40 text-sm">
              Sélectionne un template ou crée-en un nouveau
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
