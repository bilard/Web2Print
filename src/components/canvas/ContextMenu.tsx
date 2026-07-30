import { useEffect, useRef } from 'react'
import {
  Copy, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown,
  FlipHorizontal, FlipVertical, Lock, Group, Ungroup, Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { useObjectOperations } from '@/features/editor/useObjectOperations'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { repeatSelectedOnAllPages, removeSelectedFromOtherPages } from '@/features/editor/masterElements'
import { usePagesStore } from '@/stores/pages.store'
import { t } from '@/lib/i18n'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
}

export function ContextMenu({ x, y, onClose }: ContextMenuProps) {
  const ops = useObjectOperations()
  const menuRef = useRef<HTMLDivElement>(null)

  const activeObj = globalFabricCanvas?.getActiveObject()
  const isGroup = activeObj?.type === 'group'
  const isMulti = (globalFabricCanvas?.getActiveObjects().length ?? 0) > 1
  const hasMultiplePages = usePagesStore((s) => s.pages.length > 1)
  const isMaster = Boolean((activeObj?.data as Record<string, unknown> | undefined)?.masterId)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const action = (fn: () => void) => () => { fn(); onClose() }

  const Item = ({
    icon: Icon, label, onClick, danger, kbd,
  }: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick: () => void
    danger?: boolean
    kbd?: string
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded transition-colors text-left ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {kbd && <span className="text-white/25 text-[10px] font-mono">{kbd}</span>}
    </button>
  )

  const Divider = () => <div className="my-1 border-t border-white/10" />

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-surface-2 border border-white/15 rounded-xl shadow-2xl py-1.5 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      <Item icon={Copy} label="Dupliquer" onClick={action(ops.duplicateSelected)} kbd="⌘D" />
      <Divider />
      <Item icon={ChevronsUp} label="Premier plan" onClick={action(ops.bringToFront)} kbd="⌘⇧]" />
      <Item icon={ArrowUp} label="Avancer" onClick={action(ops.bringForward)} kbd="⌘]" />
      <Item icon={ArrowDown} label="Reculer" onClick={action(ops.sendBackward)} kbd="⌘[" />
      <Item icon={ChevronsDown} label="Arrière-plan" onClick={action(ops.sendToBack)} kbd="⌘⇧[" />
      <Divider />
      <Item icon={FlipHorizontal} label="Miroir horizontal" onClick={action(ops.flipHorizontal)} />
      <Item icon={FlipVertical} label="Miroir vertical" onClick={action(ops.flipVertical)} />
      <Divider />
      {isMulti && !isGroup && (
        <Item icon={Group} label="Grouper" onClick={action(ops.groupSelected)} kbd="⌘G" />
      )}
      {isGroup && (
        <Item icon={Ungroup} label="Dégrouper" onClick={action(ops.ungroupSelected)} kbd="⌘⇧G" />
      )}
      <Item icon={Lock} label="Verrouiller" onClick={action(ops.lockSelected)} />
      {hasMultiplePages && !isMulti && (
        <>
          <Divider />
          <Item
            icon={Layers}
            label="Répéter sur toutes les pages"
            onClick={action(() => {
              const r = repeatSelectedOnAllPages()
              if (!r) toast.warning(t('tst.cv.pickOneObject'))
              else if (r.applied === 0 && r.skipped > 0) toast.warning(t('tst.cv.noPageReady'))
              else toast.success(t('tst.cv.repeated', { count: r.applied, skipped: r.skipped ? t('tst.cv.repeatedSkipped', { count: r.skipped }) : '' }))
            })}
          />
          {isMaster && (
            <Item
              icon={Layers}
              label="Retirer des autres pages"
              onClick={action(() => {
                const n = removeSelectedFromOtherPages()
                toast.success(n > 0 ? t('tst.cv.copiesRemoved', { count: n }) : t('tst.cv.noCopy'))
              })}
            />
          )}
        </>
      )}
      <Divider />
      <Item icon={Trash2} label="Supprimer" onClick={action(ops.deleteSelected)} danger kbd="Del" />
    </div>
  )
}
