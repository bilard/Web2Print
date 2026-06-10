import { useEffect, useState } from 'react'
import { Canvas, FabricObject, IText } from 'fabric'
import {
  Copy, Trash2, ArrowUp, ArrowDown, Lock, LockOpen, Group, Ungroup,
} from 'lucide-react'
import { useObjectOperations } from '@/features/editor/useObjectOperations'
import { useCroppingImage } from '@/features/editor/useImageMask'

interface Props {
  canvas: Canvas | null
}

/**
 * Barre contextuelle flottante sous la sélection : les 4-5 actions les plus
 * fréquentes sans aller-retour vers le panneau de droite. Positionnée SOUS
 * l'objet (la toolbar de crop image occupe déjà le dessus). Masquée pendant
 * l'édition de texte inline et le mode crop.
 */
export function SelectionToolbar({ canvas }: Props) {
  const ops = useObjectOperations()
  const cropping = useCroppingImage()
  const [, setTick] = useState(0)
  const [target, setTarget] = useState<FabricObject | null>(null)
  const [transforming, setTransforming] = useState(false)

  // Suivre la sélection active.
  useEffect(() => {
    if (!canvas) return
    const update = () => setTarget(canvas.getActiveObject() ?? null)
    update()
    canvas.on('selection:created', update)
    canvas.on('selection:updated', update)
    canvas.on('selection:cleared', update)
    return () => {
      canvas.off('selection:created', update)
      canvas.off('selection:updated', update)
      canvas.off('selection:cleared', update)
    }
  }, [canvas])

  // Suivre déplacements / zoom / pan pour rester collé à l'objet. Pendant une
  // manipulation (drag/scale/rotate), la barre est masquée — c'est le TransformBadge
  // qui prend le relais — puis réapparaît au relâchement.
  useEffect(() => {
    if (!canvas) return
    const force = () => setTick((n) => n + 1)
    const onTransform = () => setTransforming(true)
    const onRelease = () => setTransforming(false)
    canvas.on('object:moving', onTransform)
    canvas.on('object:scaling', onTransform)
    canvas.on('object:rotating', onTransform)
    canvas.on('object:modified', onRelease)
    canvas.on('mouse:up', onRelease)
    canvas.on('after:render', force)
    return () => {
      canvas.off('object:moving', onTransform)
      canvas.off('object:scaling', onTransform)
      canvas.off('object:rotating', onTransform)
      canvas.off('object:modified', onRelease)
      canvas.off('mouse:up', onRelease)
      canvas.off('after:render', force)
    }
  }, [canvas])

  if (!canvas || !target || cropping || transforming) return null
  if (target instanceof IText && target.isEditing) return null

  const isLocked = Boolean((target as FabricObject & { data?: { locked?: boolean } }).data?.locked)
  const isGroup = target.type === 'group'
  const isMulti = canvas.getActiveObjects().length > 1

  const rect = target.getBoundingRect()
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  const centerX = (rect.left + rect.width / 2) * zoom + vt[4]
  const screenBottom = (rect.top + rect.height) * zoom + vt[5]

  const Btn = ({
    icon: Icon, title, onClick, danger,
  }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    onClick: () => void
    danger?: boolean
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center px-2.5 py-2 text-xs transition-colors ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
  const Sep = () => <div className="w-px bg-white/10" />

  return (
    <div
      className="absolute z-30 -translate-x-1/2 pointer-events-auto"
      style={{ left: centerX, top: screenBottom + 12 }}
    >
      <div className="flex items-stretch rounded-md border border-white/10 bg-surface shadow-xl overflow-hidden">
        {isLocked ? (
          <Btn icon={LockOpen} title="Déverrouiller" onClick={ops.lockSelected} />
        ) : (
          <>
            <Btn icon={Copy} title="Dupliquer (⌘D)" onClick={() => void ops.duplicateSelected()} />
            <Sep />
            <Btn icon={ArrowUp} title="Avancer (⌘])" onClick={ops.bringForward} />
            <Btn icon={ArrowDown} title="Reculer (⌘[)" onClick={ops.sendBackward} />
            {isMulti && !isGroup && (
              <>
                <Sep />
                <Btn icon={Group} title="Grouper (⌘G)" onClick={ops.groupSelected} />
              </>
            )}
            {isGroup && (
              <>
                <Sep />
                <Btn icon={Ungroup} title="Dégrouper (⌘⇧G)" onClick={ops.ungroupSelected} />
              </>
            )}
            <Sep />
            <Btn icon={Lock} title="Verrouiller" onClick={ops.lockSelected} />
            <Sep />
            <Btn icon={Trash2} title="Supprimer (⌫)" onClick={ops.deleteSelected} danger />
          </>
        )}
      </div>
    </div>
  )
}
