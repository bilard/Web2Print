import { Link2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { collectObjectsDeep } from '@/features/editor/deepObjects'

export function MergeConnectorSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const canvas = globalFabricCanvas
  if (!canvas || !selectedObjectId) return null
  const obj = collectObjectsDeep(canvas.getObjects()).find((o) => (o as any).data?.id === selectedObjectId)
  if (!obj) return null
  const fields = ((obj as any).data?.mergeFields as string[] | undefined) ?? []
  const imageField = (obj as any).data?.ecImageField as string | undefined
  if (fields.length === 0 && !imageField) return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
        <Link2 className="w-3 h-3" /> Connecteur IDML
      </div>
      <div className="flex flex-col gap-1">
        {fields.map((f) => (
          <div key={f} className="flex items-center gap-2 text-[12px] text-white/80 bg-well rounded px-2 py-1">
            <span className="text-indigo-400">▸</span> {f}
          </div>
        ))}
        {imageField && (
          <div className="flex items-center gap-2 text-[12px] text-white/80 bg-well rounded px-2 py-1">
            <span className="text-indigo-400">▸</span> {imageField} <span className="text-white/40">(image)</span>
          </div>
        )}
      </div>
    </section>
  )
}
