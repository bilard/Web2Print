import { useMemo } from 'react'
import type { DamImage } from '../types'

interface Props {
  images: DamImage[]
  columns?: number
  renderItem: (image: DamImage) => React.ReactNode
}

/**
 * Stable Pinterest-style masonry layout.
 *
 * Distribution is computed once in JS from the known image aspect ratios
 * (DamImage.width/height), so the layout never reflows on image load or hover.
 * Algorithm: greedy — each image goes into the column with the smallest
 * cumulative normalized height at the time it's placed.
 *
 * This avoids the classic CSS `column-fill: balance` vibration where the
 * browser reshuffles items between columns as content changes.
 */
export function DamMasonry({ images, columns = 4, renderItem }: Props) {
  const cols = useMemo(() => {
    const buckets: DamImage[][] = Array.from({ length: columns }, () => [])
    const heights = new Array<number>(columns).fill(0)

    for (const img of images) {
      // Normalized height = height / width (column-width is uniform)
      const ratio = img.width > 0 ? img.height / img.width : 1
      // Find shortest column
      let shortest = 0
      for (let i = 1; i < columns; i++) {
        if (heights[i] < heights[shortest]) shortest = i
      }
      buckets[shortest].push(img)
      heights[shortest] += ratio
    }
    return buckets
  }, [images, columns])

  return (
    <div className="flex gap-2 items-start">
      {cols.map((col, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col gap-2">
          {col.map((image) => (
            <div key={image.id}>{renderItem(image)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
