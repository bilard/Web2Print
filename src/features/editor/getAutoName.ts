import type { CanvasObjectProps } from '@/stores/editor.store'

const MAP: Record<CanvasObjectProps['type'], string> = {
  rect: '<Rectangle>',
  ellipse: '<Ellipse>',
  path: '<Tracé>',
  line: '<Ligne>',
  text: '<Texte>',
  image: '<Image>',
  group: '<Groupe>',
  polygon: '<Polygone>',
  triangle: '<Triangle>',
  star: '<Étoile>',
  arrow: '<Flèche>',
  hexagon: '<Hexagone>',
  diamond: '<Losange>',
  callout: '<Bulle>',
}

export function getAutoName(type: CanvasObjectProps['type']): string {
  return MAP[type] ?? '<Calque>'
}
