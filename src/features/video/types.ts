/** Format d'aspect d'une animation. Les autres dérivés (templates HyperFrames,
 *  dimensions de référence) sont calculés à partir de cette valeur. */
export type AspectFormat = 'portrait' | 'square' | 'landscape'

export function detectAspect(width: number, height: number): AspectFormat {
  const ratio = width / height
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.85) return 'portrait'
  return 'square'
}
