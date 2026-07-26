//
// Applique l'effet visuel résolu (conditionalRules.ts) sur un objet Fabric, de
// façon RÉVERSIBLE par ligne : on mémorise la valeur d'origine de chaque
// propriété qu'une règle écrase (obj.data._ruleSaved) et on la restaure dès
// qu'une passe ne réclame plus cet effet. Sans ça, un « cacher » sur la ligne 1
// resterait collé sur la ligne 2.

import type { Canvas, FabricObject } from 'fabric'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { resolveEffect, type ConditionalRule, type RuleEffect } from './conditionalRules'
import type { MergeRow, MergeColumn } from '@/stores/merge.store'

/** Propriétés Fabric gérées par les règles (l'ordre n'importe pas). */
const MANAGED_PROPS = ['visible', 'fill', 'opacity', 'scaleX', 'scaleY'] as const

type RuleData = {
  conditionalRules?: ConditionalRule[]
  _ruleSaved?: Record<string, unknown>
  [k: string]: unknown
}

function getData(obj: FabricObject): RuleData {
  const o = obj as FabricObject & { data?: RuleData }
  if (!o.data) o.data = {}
  return o.data as RuleData
}

/**
 * Écrit l'effet sur l'objet. Capture la baseline d'une propriété la 1re fois
 * qu'elle est écrasée, restaure celles qui ne sont plus pilotées cette passe.
 */
function applyRuleEffect(obj: FabricObject, effect: RuleEffect, canvas: Canvas): void {
  const data = getData(obj)
  const saved = (data._ruleSaved ??= {})

  // Valeurs cibles de cette passe (undefined = non piloté → restaurer).
  const desired: Record<string, unknown | undefined> = {
    visible: effect.visible,
    fill: effect.fill,
    opacity: effect.opacity,
  }
  if (effect.scale !== undefined) {
    // L'échelle est un FACTEUR relatif à la baseline (jamais cumulé entre passes).
    const baseX = 'scaleX' in saved ? (saved.scaleX as number) : (obj.scaleX ?? 1)
    const baseY = 'scaleY' in saved ? (saved.scaleY as number) : (obj.scaleY ?? 1)
    desired.scaleX = baseX * effect.scale
    desired.scaleY = baseY * effect.scale
  }

  let touched = false
  for (const p of MANAGED_PROPS) {
    if (desired[p] !== undefined) {
      if (!(p in saved)) saved[p] = (obj as unknown as Record<string, unknown>)[p]
      obj.set(p as keyof FabricObject, desired[p] as never)
      touched = true
    } else if (p in saved) {
      obj.set(p as keyof FabricObject, saved[p] as never)
      delete saved[p]
      touched = true
    }
  }

  // z-order : appliqué seulement quand la condition matche (non restauré — le
  // réordonnancement InDesign n'a pas d'inverse trivial sur un canvas libre).
  if (effect.zOrder === 'front') { canvas.bringObjectToFront(obj); touched = true }
  else if (effect.zOrder === 'back') { canvas.sendObjectToBack(obj); touched = true }

  if (touched) {
    obj.setCoords()
    ;(obj as unknown as { dirty?: boolean }).dirty = true
  }
}

/**
 * Évalue + applique les règles de TOUS les objets du canvas pour la ligne
 * donnée. Appelé en fin de passe de fusion (après texte + bindings).
 */
export function applyConditionalRulesForRow(
  canvas: Canvas,
  row: MergeRow,
  columns?: MergeColumn[],
  fieldMap?: Record<string, string>,
): void {
  for (const obj of collectObjectsDeep(canvas.getObjects())) {
    const data = (obj as FabricObject & { data?: RuleData }).data
    const rules = data?.conditionalRules
    const hasState = data?._ruleSaved && Object.keys(data._ruleSaved).length > 0
    if ((!rules || rules.length === 0) && !hasState) continue
    const effect = resolveEffect(rules, row, columns, fieldMap)
    applyRuleEffect(obj, effect, canvas)
  }
}

/**
 * Pour la sauvegarde : restaure les baselines (l'aperçu d'une ligne ne doit pas
 * être persisté) et purge l'état transitoire avant `toObject`. Retourne un
 * thunk qui ré-applique l'aperçu après sérialisation. Miroir du swap texte de
 * useAutoSave.
 */
export function suspendRuleEffectsForSave(canvas: Canvas): () => void {
  const restore: { obj: FabricObject; data: RuleData; saved: Record<string, unknown>; overridden: Record<string, unknown> }[] = []
  for (const obj of collectObjectsDeep(canvas.getObjects())) {
    const data = (obj as FabricObject & { data?: RuleData }).data
    const saved = data?._ruleSaved
    if (!data || !saved || Object.keys(saved).length === 0) continue
    const overridden: Record<string, unknown> = {}
    for (const p of Object.keys(saved)) overridden[p] = (obj as unknown as Record<string, unknown>)[p]
    for (const [p, v] of Object.entries(saved)) obj.set(p as keyof FabricObject, v as never)
    obj.setCoords()
    delete data._ruleSaved
    restore.push({ obj, data, saved, overridden })
  }
  return () => {
    for (const { obj, data, saved, overridden } of restore) {
      data._ruleSaved = saved
      for (const [p, v] of Object.entries(overridden)) obj.set(p as keyof FabricObject, v as never)
      obj.setCoords()
    }
  }
}
