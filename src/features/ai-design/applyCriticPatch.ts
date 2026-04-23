/**
 * Applique un CriticPatch au DesignPlan courant et retourne un NOUVEAU plan.
 * Immuable — le plan original n'est jamais mutable.
 *
 * Règles d'application :
 *  - upsert-zone : si id existe, merge (les champs définis remplacent, les autres
 *                 sont préservés) ; sinon push nouvelle zone.
 *  - remove-zone : filtre la zone par id.
 *  - upsert-slot : idem zones mais sur plan.slots.
 *  - remove-slot : filtre le slot par id.
 *
 * Les ops sont appliquées dans l'ordre fourni par le critic — ce qui permet par
 * exemple de supprimer 5 zones bullets puis d'en créer 1 seule consolidée.
 */

import type { DesignPlan } from './artDirectorSchema'
import type { CriticOp, CriticPatch } from './visionCritic'

type Zone = DesignPlan['zones'][number]
type Slot = DesignPlan['slots'][number]
type ZoneRole = Zone['role']

const ZONE_ROLES: ZoneRole[] = ['background', 'title', 'subtitle', 'body', 'cta', 'accent', 'price', 'logo-slot', 'image-slot']

function isZoneRole(v: string | undefined): v is ZoneRole {
  return !!v && (ZONE_ROLES as string[]).includes(v)
}

/**
 * Plancher de lisibilité par rôle. Le Critic ayant tendance à shrinker trop
 * agressivement (observé : cta à 3.2 pt, mentions à 3 pt — illisibles), on
 * clampe AUCUN op `upsert-zone` ne peut imposer une fontSize sous ce seuil.
 * Un texte à 2-4 pt n'a pas de valeur : mieux vaut un bbox trop petit (et donc
 * un texte qui déborde) qu'un texte invisible.
 */
const FONT_SIZE_FLOOR_PT: Record<string, number> = {
  title: 10,
  subtitle: 7,
  body: 5,
  cta: 6,
  price: 7,
  accent: 3,
}

function clampFontSize(role: string | undefined, requested: number): number {
  const floor = (role && FONT_SIZE_FLOOR_PT[role]) ?? 5
  if (requested >= floor) return requested
  console.warn(
    `[CriticPatch] fontSize=${requested}pt demandé pour role=${role ?? '?'} — remonté au plancher lisible ${floor}pt`,
  )
  return floor
}

function applyOp(plan: DesignPlan, op: CriticOp): DesignPlan {
  switch (op.op) {
    case 'upsert-zone': {
      const existing = plan.zones.find((z) => z.id === op.id)
      const effectiveRole = isZoneRole(op.role) ? op.role : existing?.role
      const clampedFontSize =
        op.fontSize !== undefined ? clampFontSize(effectiveRole, op.fontSize) : undefined
      if (existing) {
        const merged: Zone = {
          ...existing,
          ...(isZoneRole(op.role) ? { role: op.role } : {}),
          ...(op.bboxMm ? { bboxMm: op.bboxMm } : {}),
          ...(op.fill !== undefined ? { fill: op.fill } : {}),
          ...(op.content !== undefined ? { content: op.content } : {}),
          ...(clampedFontSize !== undefined ? { fontSize: clampedFontSize } : {}),
          ...(op.textColor !== undefined ? { textColor: op.textColor } : {}),
          ...(op.decoration !== undefined ? { decoration: op.decoration } : {}),
          ...(op.align !== undefined ? { align: op.align } : {}),
        }
        return { ...plan, zones: plan.zones.map((z) => (z.id === op.id ? merged : z)) }
      }
      // Création : role + bboxMm sont requis, on skip l'op si manquants
      if (!isZoneRole(op.role) || !op.bboxMm) {
        console.warn('[CriticPatch] upsert-zone skipped (no role or bbox):', op.id)
        return plan
      }
      const created: Zone = {
        id: op.id,
        role: op.role,
        bboxMm: op.bboxMm,
        ...(op.fill !== undefined ? { fill: op.fill } : {}),
        ...(op.content !== undefined ? { content: op.content } : {}),
        ...(clampedFontSize !== undefined ? { fontSize: clampedFontSize } : {}),
        ...(op.textColor !== undefined ? { textColor: op.textColor } : {}),
        ...(op.decoration !== undefined ? { decoration: op.decoration } : {}),
        ...(op.align !== undefined ? { align: op.align } : {}),
      }
      return { ...plan, zones: [...plan.zones, created] }
    }
    case 'remove-zone': {
      return { ...plan, zones: plan.zones.filter((z) => z.id !== op.id) }
    }
    case 'upsert-slot': {
      const existing = plan.slots.find((s) => s.id === op.id)
      if (existing) {
        const merged: Slot = {
          ...existing,
          ...(op.role !== undefined ? { role: op.role } : {}),
          ...(op.bboxMm ? { bboxMm: op.bboxMm } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(op.assetIndex !== undefined ? { assetIndex: op.assetIndex } : {}),
        }
        return { ...plan, slots: plan.slots.map((s) => (s.id === op.id ? merged : s)) }
      }
      if (!op.role || !op.bboxMm || !op.description) {
        console.warn('[CriticPatch] upsert-slot skipped (missing role/bbox/desc):', op.id)
        return plan
      }
      const created: Slot = {
        id: op.id,
        role: op.role,
        bboxMm: op.bboxMm,
        description: op.description,
        ...(op.assetIndex !== undefined ? { assetIndex: op.assetIndex } : {}),
      }
      return { ...plan, slots: [...plan.slots, created] }
    }
    case 'remove-slot': {
      return { ...plan, slots: plan.slots.filter((s) => s.id !== op.id) }
    }
  }
}

export function applyCriticPatch(plan: DesignPlan, patch: CriticPatch): DesignPlan {
  return patch.ops.reduce((acc, op) => applyOp(acc, op), plan)
}
