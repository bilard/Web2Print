// Légende des couleurs de liens.
//
// ⚠ Les liens étaient DÉJÀ colorés par type de donnée, mais rien ne disait ce que les
// couleurs signifiaient : sur un graphe d'une douzaine de cartes, un fil vert et un fil
// turquoise se lisaient comme une décoration. Une couleur sans légende n'informe pas,
// elle décore — et fait croire à une logique qu'on n'arrive pas à retrouver.
//
// Repliée par défaut : elle sert à comprendre une fois, pas à occuper le canevas.
import { useState } from 'react'
import { Panel } from '@xyflow/react'
import { ChevronDown, Waypoints } from 'lucide-react'
import { portTypeRegistry } from '../runtime/ports'

/** Types montrés, dans l'ordre où on les rencontre en construisant un workflow. Tous les
 *  types déclarés n'ont pas à figurer : `any` ne dit rien, et une légende exhaustive
 *  redevient illisible. */
const SHOWN = ['sheet', 'sites', 'rules', 'product[]', 'asset[]', 'file', 'files', 'export-result', 'chart']

export function EdgeLegend() {
  const [open, setOpen] = useState(false)

  return (
    <Panel position="bottom-center" className="!mb-2">
      <div className="rounded-md border border-white/10 bg-surface/95 backdrop-blur px-2 py-1 shadow-lg">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 hover:text-white/70">
          <Waypoints className="w-3 h-3" />
          Flux
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pb-0.5">
            {SHOWN.map((type) => {
              const spec = portTypeRegistry.get(type)
              if (!spec) return null
              return (
                <span key={type} className="flex items-center gap-1 text-[10px] text-white/55">
                  <span className="h-0.5 w-4 rounded" style={{ background: spec.color }} />
                  {spec.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}
