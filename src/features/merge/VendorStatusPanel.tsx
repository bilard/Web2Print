import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, CheckCircle2, Link2, AlertTriangle, Plus, ExternalLink, Store, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSourceVendors, type VendorSummary } from './useSourceVendors'
import { saveTemplate, emptyTemplate, listTemplates } from '@/features/scraping-templates/templatesStore'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'

/**
 * Panneau "Fournisseurs" — affiche les marques uniques de la source Excel
 * active, leur statut de matching avec les templates (matched / alias /
 * absent), et les actions disponibles : lier à un template existant
 * (brandAliases) ou créer un nouveau template.
 *
 * Rend visible le lien implicite entre les lignes de la source et les
 * templates de scraping qui enrichiront ces produits.
 */
export function VendorStatusPanel() {
  const [open, setOpen] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const { vendors, brandColumnKey, loading } = useSourceVendors(refreshKey)
  const [linkTarget, setLinkTarget] = useState<VendorSummary | null>(null)

  if (!brandColumnKey) {
    return (
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-wider">
          <Store className="w-3 h-3" />
          Fournisseurs
        </div>
        <p className="text-[11px] text-white/30 italic mt-1.5">
          Aucune colonne « Marque » détectée dans la source.
        </p>
      </div>
    )
  }

  if (vendors.length === 0) {
    return null
  }

  const stats = {
    matched: vendors.filter((v) => v.status === 'matched').length,
    alias: vendors.filter((v) => v.status === 'alias').length,
    absent: vendors.filter((v) => v.status === 'absent').length,
  }

  return (
    <>
      <div className="border-b border-white/5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
        >
          {open ? <ChevronDown className="w-3 h-3 text-white/40" /> : <ChevronRight className="w-3 h-3 text-white/40" />}
          <Store className="w-3 h-3 text-white/40" />
          <span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">
            Fournisseurs
          </span>
          <span className="text-[10px] text-white/30">({vendors.length})</span>
          <div className="ml-auto flex items-center gap-1.5">
            {stats.matched > 0 && (
              <span className="text-[9px] text-emerald-400/70 tabular-nums" title={`${stats.matched} matché${stats.matched > 1 ? 's' : ''}`}>
                ✓{stats.matched}
              </span>
            )}
            {stats.alias > 0 && (
              <span className="text-[9px] text-sky-400/70 tabular-nums" title={`${stats.alias} lien manuel`}>
                ⚠{stats.alias}
              </span>
            )}
            {stats.absent > 0 && (
              <span className="text-[9px] text-amber-400/80 tabular-nums" title={`${stats.absent} sans template`}>
                ⚠{stats.absent}
              </span>
            )}
          </div>
        </button>

        {open && (
          <div className="px-2 pb-2 space-y-0.5 max-h-64 overflow-y-auto">
            {loading && vendors.length === 0 ? (
              <div className="flex items-center justify-center py-4 gap-2 text-[10px] text-white/40">
                <Loader2 className="w-3 h-3 animate-spin" />
                Chargement…
              </div>
            ) : (
              vendors.map((v) => (
                <VendorRow
                  key={v.brand}
                  vendor={v}
                  onLink={() => setLinkTarget(v)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {linkTarget && (
        <LinkVendorModal
          vendor={linkTarget}
          onClose={() => setLinkTarget(null)}
          onSaved={() => {
            setLinkTarget(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

function VendorRow({ vendor, onLink }: { vendor: VendorSummary; onLink: () => void }) {
  const navigate = useNavigate()

  const statusConfig = {
    matched: {
      Icon: CheckCircle2,
      color: 'text-emerald-400/80',
      bg: 'bg-emerald-500/[0.03] border-emerald-500/10',
      label: vendor.template?.vendorDomain ?? '—',
      labelColor: 'text-emerald-300/70',
    },
    alias: {
      Icon: Link2,
      color: 'text-sky-400/80',
      bg: 'bg-sky-500/[0.04] border-sky-500/15',
      label: vendor.template?.vendorDomain ?? '—',
      labelColor: 'text-sky-300/70',
    },
    absent: {
      Icon: AlertTriangle,
      color: 'text-amber-400/80',
      bg: 'bg-amber-500/[0.04] border-amber-500/15',
      label: 'Aucun template',
      labelColor: 'text-amber-300/60',
    },
  }[vendor.status]

  const { Icon, color, bg, label, labelColor } = statusConfig

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${bg}`}>
      <Icon className={`w-3 h-3 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-white/85 font-medium truncate">{vendor.brand}</span>
          <span className="text-[9px] text-white/35 tabular-nums shrink-0">×{vendor.productCount}</span>
        </div>
        <div className={`text-[9px] truncate ${labelColor}`}>{label}</div>
      </div>
      {vendor.status === 'matched' && vendor.template ? (
        <button
          onClick={() => navigate(`/scraping-templates?id=${vendor.template!.id}`)}
          className="shrink-0 p-1 text-white/30 hover:text-white/70 transition-colors"
          title="Ouvrir le template"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      ) : vendor.status === 'alias' && vendor.template ? (
        <button
          onClick={() => navigate(`/scraping-templates?id=${vendor.template!.id}`)}
          className="shrink-0 p-1 text-sky-400/50 hover:text-sky-400 transition-colors"
          title="Ouvrir le template lié"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onLink}
            className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-400/20 transition-colors"
            title="Lier à un template existant"
          >
            Lier
          </button>
          <button
            onClick={() => navigate('/scraping-templates?new=1')}
            className="p-1 rounded text-[9px] bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-400/20 transition-colors"
            title="Créer un template"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function LinkVendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: VendorSummary
  onClose: () => void
  onSaved: () => void
}) {
  const [allTemplates, setAllTemplates] = useState<ScrapingTemplate[] | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listTemplates()
      .then((list) => { if (!cancelled) setAllTemplates(list) })
      .catch((err) => toast.error(`Chargement templates échoué : ${err instanceof Error ? err.message : String(err)}`))
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!allTemplates) return []
    const q = query.trim().toLowerCase()
    if (!q) return allTemplates
    return allTemplates.filter(
      (t) =>
        t.vendorDomain.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.brandAliases ?? []).some((a) => a.toLowerCase().includes(q)),
    )
  }, [allTemplates, query])

  const handleLink = async (t: ScrapingTemplate) => {
    setSaving(t.id)
    try {
      const nextAliases = Array.from(new Set([...(t.brandAliases ?? []), vendor.brand]))
      const updated: ScrapingTemplate = {
        ...t,
        brandAliases: nextAliases,
        updatedAt: Date.now(),
      }
      await saveTemplate(updated)
      toast.success(`"${vendor.brand}" lié à ${t.vendorDomain}`)
      onSaved()
    } catch (err) {
      toast.error(`Sauvegarde échouée : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-lg flex flex-col max-h-[75vh]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
              <Link2 className="w-3.5 h-3.5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white/90">Lier "{vendor.brand}"</h3>
              <p className="text-[10px] text-white/40 mt-0.5">
                Associe cette marque à un template existant. Applique à {vendor.productCount} produit{vendor.productCount > 1 ? 's' : ''}.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-white/[0.06] shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un template (vendorDomain, nom, alias)…"
            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-white/25 focus:border-sky-500/50 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {allTemplates === null ? (
            <div className="flex items-center justify-center py-10 gap-2 text-white/50 text-[11px]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[11px] text-white/40 italic py-6 text-center">
              {allTemplates.length === 0 ? 'Aucun template existant.' : 'Aucun résultat.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((t) => {
                const isLoading = saving === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => handleLink(t)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2 px-2.5 py-2 bg-white/[0.03] hover:bg-sky-500/[0.08] border border-white/[0.06] hover:border-sky-400/30 rounded text-left transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white/90 font-medium truncate">{t.vendorDomain}</div>
                      <div className="text-[10px] text-white/40 truncate">
                        {t.name}
                        {t.brandAliases && t.brandAliases.length > 0 && (
                          <span className="ml-1.5 text-sky-300/60">· alias : {t.brandAliases.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-sky-300 animate-spin shrink-0" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
          <button
            onClick={async () => {
              try {
                const next = emptyTemplate(vendor.brand.toLowerCase().replace(/\s+/g, '-') + '.com')
                next.brandAliases = [vendor.brand]
                next.name = `${vendor.brand} — template`
                await saveTemplate(next)
                toast.success(`Template créé pour "${vendor.brand}"`)
                onSaved()
              } catch (err) {
                toast.error(`Création échouée : ${err instanceof Error ? err.message : String(err)}`)
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 border border-amber-400/25 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Créer un nouveau template pour "{vendor.brand}"
          </button>
        </div>
      </div>
    </div>
  )
}
