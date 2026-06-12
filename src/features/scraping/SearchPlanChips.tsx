import { Wand2 } from 'lucide-react'
import type { SearchPlan } from './searchPlanner'

/** Ligne « Recherche interprétée » : une chip par requête générée + champs demandés. */
export function SearchPlanChips({ plan }: { plan: SearchPlan }) {
  if (plan.queries.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="inline-flex items-center gap-1 text-white/35 shrink-0">
        <Wand2 className="w-3 h-3" /> Recherche interprétée :
      </span>
      {plan.queries.map((q, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20"
          title={q.query}
        >
          {q.site ? `${q.site} · ${plan.subject}` : plan.subject}
        </span>
      ))}
      {plan.wantedFields.length > 0 && (
        <span className="text-white/30">→ {plan.wantedFields.join(', ')}</span>
      )}
    </div>
  )
}
