// src/features/access/admin/PermissionTree.tsx
import { ChevronRight, Check, Lock } from 'lucide-react'
import { permissionParent, permissionLabel, type PermissionDef } from '@/features/access/permissions'
import { moduleMeta, type ModuleMeta } from '@/features/access/moduleMeta'
import { useThemeStore } from '@/stores/theme.store'

/** Mode « Arbre » de la matrice de rôle : liste indentée navigable (modules → actions),
 *  dans l'ordre de la navigation de l'app. Sélection binaire (coché / décoché). */
export function PermissionTree({
  entries,
  isSelected,
  onToggle,
  openSet,
  onToggleModule,
}: {
  entries: [string, PermissionDef[]][]
  isSelected: (key: string) => boolean
  onToggle: (key: string) => void
  openSet: Set<string>
  onToggleModule: (module: string) => void
}) {
  // En clair, on densifie nettement les libellés (le sombre garde sa hiérarchie atténuée).
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {entries.map(([module, defs]) => {
        const m = moduleMeta(module)
        const Icon = m.icon
        const viewDef = defs.find((d) => permissionParent(d.key) === null)
        const childDefs = defs.filter((d) => permissionParent(d.key) !== null)
        const sel = defs.filter((d) => isSelected(d.key)).length
        const open = openSet.has(module)
        const viewOn = viewDef ? isSelected(viewDef.key) : true
        return (
          <div key={module} className="border-b border-white/[0.05] last:border-0">
            <button onClick={() => onToggleModule(module)}
              className="w-full flex items-center gap-2 py-2 px-2.5 text-left hover:bg-white/[0.025] transition-colors">
              <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-white/35 transition-transform ${open ? 'rotate-90' : ''}`} />
              <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${m.dot}`}><Icon className="w-3 h-3" /></span>
              <span className={`text-[12px] font-medium ${sel > 0 ? m.text : (isLight ? 'text-white/85' : 'text-white/55')}`}>{module}</span>
              {sel > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />}
              <span className="ml-auto text-[10px] tabular-nums text-white/30">{sel}/{defs.length}</span>
            </button>
            {open && (
              <div className="ml-[1.45rem] pl-3 border-l border-white/[0.08] pb-2 flex flex-col gap-0.5">
                {viewDef && <TreeLeaf def={viewDef} on={viewOn} locked={false} accent={m} onClick={() => onToggle(viewDef.key)} />}
                {childDefs.map((d) => (
                  <TreeLeaf key={d.key} def={d} on={isSelected(d.key)} locked={!viewOn} accent={m}
                    lockHint={viewDef ? permissionLabel(viewDef.key) : undefined}
                    onClick={() => onToggle(d.key)} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TreeLeaf({
  def, on, locked, accent, onClick, lockHint,
}: {
  def: PermissionDef
  on: boolean
  locked: boolean
  accent: ModuleMeta
  onClick: () => void
  lockHint?: string
}) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  return (
    <button disabled={locked} onClick={onClick}
      title={locked ? `Nécessite : ${lockHint}` : def.key}
      className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] text-left transition-colors ${
        locked ? (isLight ? 'text-white/45 cursor-not-allowed' : 'text-white/20 cursor-not-allowed')
          : on ? 'text-white/90 bg-white/[0.04] hover:bg-white/[0.06]'
            : (isLight ? 'text-white/80 hover:bg-white/[0.05] hover:text-white/90' : 'text-white/55 hover:bg-white/[0.03] hover:text-white/80')
      }`}>
      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
        locked ? 'border-white/10'
          : on ? accent.chipOn
            : 'border-white/25'
      }`}>
        {locked ? <Lock className="w-2 h-2" /> : on ? <Check className="w-2.5 h-2.5" /> : null}
      </span>
      {def.label}
    </button>
  )
}
