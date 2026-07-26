import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { useLayers } from '@/features/editor/useLayers'

export function TaggedBlocksList() {
  const { selectLayer } = useLayers()
  const [, setTick] = useState(0)

  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const redraw = () => setTick((n) => n + 1)
    canvas.on('object:added', redraw)
    canvas.on('object:removed', redraw)
    canvas.on('after:render', redraw)
    return () => {
      canvas.off('object:added', redraw)
      canvas.off('object:removed', redraw)
      canvas.off('after:render', redraw)
    }
  }, [])

  const canvas = globalFabricCanvas
  if (!canvas) return null

  const blocks = collectObjectsDeep(canvas.getObjects())
    .map((o) => {
      const fields = ((o as any).data?.mergeFields as string[] | undefined) ?? []
      const img = (o as any).data?.ecImageField as string | undefined
      const all = img ? [...fields, `${img} (image)`] : fields
      return { id: (o as any).data?.id as string | undefined, fields: all }
    })
    .filter((b) => b.id && b.fields.length > 0)

  if (blocks.length === 0) return null

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
        <Link2 className="w-3 h-3" /> Blocs balisés IDML
        <span className="ml-auto text-indigo-400/60 normal-case tracking-normal">{blocks.length}</span>
      </div>
      <div className="space-y-0.5">
        {blocks.map((b) => (
          <button
            key={b.id}
            onClick={() => selectLayer(b.id!)}
            className="w-full flex items-center gap-2 text-left text-[12px] text-white/80 hover:bg-white/5 rounded px-2 py-1 transition-colors"
          >
            <span className="text-indigo-400 shrink-0">▸</span>
            <span className="truncate">{b.fields.join(' · ')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
