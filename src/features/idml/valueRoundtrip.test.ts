import { describe, it, expect } from 'vitest'
import { resolveText } from '@/features/merge/mergeEngine'
import { serializedTextFor } from '@/features/editor/useAutoSave'
import type { MergeRow } from '@/stores/merge.store'

describe('round-trip valeur ↔ merge', () => {
  it('la valeur stable est sérialisée, et le template résout la data', () => {
    const data = { templateText: '{{Prix_normal}}', originText: '22,99', mergeFields: ['Prix_normal'] }
    // sauvegarde déconnecté : on persiste la valeur stable (= obj.text quand non connecté et non édité)
    expect(serializedTextFor({ text: '22,99', data }, false)).toBe('22,99')
    // merge : le template résout la ligne
    const row: MergeRow = { _id: 'r1', Prix_normal: '49,90' }
    expect(resolveText(data.templateText, row)).toBe('49,90')
  })
})
