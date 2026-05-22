import { useUIStore } from '@/stores/ui.store'

/** Valeurs par défaut canoniques des paramètres d'impression (vocabulaire InDesign).
 *  Source unique pour `PrintPanel` (bouton Défauts) et l'import depuis le dashboard. */
export const PRINT_DEFAULTS = {
  dpi: 300,
  bleedMm: 2,
  safeAreaMm: 2,
  cropMarkLengthMm: 3.5,
  cropMarkOffsetMm: 1,
  cropStroke: 1,
  cropColor: '#ffffff',
  bleedStroke: 1,
  bleedColor: '#ffffff',
  regRadiusMm: 2.5,
  regStroke: 1,
  regColor: '#ffffff',
  regOffsetMm: 0,
  safeStroke: 0.6,
  safeColor: '#ef4444',
  safeDash: 4,
  safeGap: 3,
} as const

/** Applique les défauts d'impression au store UI. Tous les repères (traits de
 *  coupe, fond perdu, montage, zone de sécurité) sont désactivés — l'utilisateur
 *  les active à la demande depuis le panneau. */
export function applyPrintDefaults(): void {
  const ui = useUIStore.getState()
  ui.setDpi(PRINT_DEFAULTS.dpi)
  ui.setBleedMm(PRINT_DEFAULTS.bleedMm)
  ui.setSafeAreaMm(PRINT_DEFAULTS.safeAreaMm)
  ui.setCropMarkLengthMm(PRINT_DEFAULTS.cropMarkLengthMm)
  ui.setCropMarkOffsetMm(PRINT_DEFAULTS.cropMarkOffsetMm)
  ui.setShowPrintMarks(false)
  ui.setShowSafeArea(false)
  ui.setShowRegistrationMarks(false)
  ui.setCropStroke(PRINT_DEFAULTS.cropStroke)
  ui.setCropColor(PRINT_DEFAULTS.cropColor)
  ui.setBleedStroke(PRINT_DEFAULTS.bleedStroke)
  ui.setBleedColor(PRINT_DEFAULTS.bleedColor)
  ui.setRegRadiusMm(PRINT_DEFAULTS.regRadiusMm)
  ui.setRegStroke(PRINT_DEFAULTS.regStroke)
  ui.setRegColor(PRINT_DEFAULTS.regColor)
  ui.setRegOffsetMm(PRINT_DEFAULTS.regOffsetMm)
  ui.setSafeStroke(PRINT_DEFAULTS.safeStroke)
  ui.setSafeColor(PRINT_DEFAULTS.safeColor)
  ui.setSafeDash(PRINT_DEFAULTS.safeDash)
  ui.setSafeGap(PRINT_DEFAULTS.safeGap)
}
