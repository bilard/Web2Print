import { LayerRow } from './LayerRow'
import { TextSegmentRow } from '../TextSegmentRow'
import { getDisplayName } from '@/features/editor/getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'

interface Props {
  objects: CanvasObjectProps[]
  selectedObjectId: string | null
  columns: { key: string; label: string }[]
  textSegments: Record<string, TextSegment[]>
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  depth?: number
  isDraggable?: boolean
}

export function LayerTree({
  objects, selectedObjectId, columns, textSegments,
  expandedIds, onToggleExpand, depth = 0, isDraggable = true,
}: Props) {
  return (
    <>
      {objects.map((obj) => {
        const segments = textSegments[obj.id] ?? null
        const expanded = expandedIds.has(obj.id)
        const isGroup = obj.type === 'group'
        const displayName = getDisplayName(obj, columns)

        return (
          <div key={obj.id}>
            <LayerRow
              obj={obj}
              displayName={displayName}
              isSelected={obj.id === selectedObjectId}
              segments={segments}
              expanded={expanded}
              onToggleExpand={() => onToggleExpand(obj.id)}
              depth={depth}
              isDraggable={isDraggable}
            />

            {isGroup && expanded && obj.children && obj.children.length > 0 && (
              <div className="border-l border-white/10 ml-5">
                <LayerTree
                  objects={[...obj.children].reverse()}
                  selectedObjectId={selectedObjectId}
                  columns={columns}
                  textSegments={textSegments}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  depth={depth + 1}
                  isDraggable
                />
              </div>
            )}

            {!isGroup && expanded && segments && segments.map((seg, i) => (
              <TextSegmentRow key={i} segment={seg} index={i} objectId={obj.id} />
            ))}
          </div>
        )
      })}
    </>
  )
}
