// src/features/priceWatch/components/SitesTab.tsx
import { useState } from 'react'
import { useCompetitorSites, usePriceWatchMutations } from '../usePriceWatch'
import type { CompetitorSite } from '../types'

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500/50'
const btnPrimaryCls = 'text-sm bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors'
const btnGhostCls = 'text-xs text-white/40 hover:text-red-400 px-2 py-1 rounded transition-colors'

export function SitesTab() {
  const sites = useCompetitorSites()
  const { saveSite, deleteSite } = usePriceWatchMutations()
  const [draft, setDraft] = useState<Partial<CompetitorSite>>({})

  const add = async () => {
    if (!draft.domain?.trim()) return
    await saveSite({
      id: crypto.randomUUID(),
      domain: draft.domain.trim().replace(/^https?:\/\//, ''),
      urlPattern: draft.urlPattern?.trim() || undefined,
    })
    setDraft({})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputCls} w-48`}
          placeholder="Domaine (exemple.com) *"
          value={draft.domain ?? ''}
          onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
        />
        <input
          className={`${inputCls} w-72`}
          placeholder="Pattern d'URL (https://…/p/{sku})"
          value={draft.urlPattern ?? ''}
          onChange={(e) => setDraft({ ...draft, urlPattern: e.target.value })}
        />
        <button type="button" className={btnPrimaryCls} onClick={add}>
          Ajouter
        </button>
      </div>
      <ul className="divide-y divide-white/10 rounded-md bg-surface">
        {sites.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-white/80">
              {s.domain}
              {s.urlPattern && (
                <span className="text-white/50"> · {s.urlPattern}</span>
              )}
            </span>
            <button type="button" className={btnGhostCls} onClick={() => deleteSite(s.id)}>
              Supprimer
            </button>
          </li>
        ))}
        {sites.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-white/50">
            Aucun site concurrent.
          </li>
        )}
      </ul>
    </div>
  )
}
