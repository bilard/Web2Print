// src/features/workflows/registry/cronNodes.ts
import { CalendarClock } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { describeCron, type CronConfig } from '../runtime/cronSchedule'

const SERVER_UNITS = [
  { value: 'minute', label: 'minute(s)' },
  { value: 'hour', label: 'heure(s)' },
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
]

const WEEKDAY_OPTIONS = [
  { value: '-1', label: 'Tous les jours' },
  { value: '1', label: 'Lundi' },
  { value: '2', label: 'Mardi' },
  { value: '3', label: 'Mercredi' },
  { value: '4', label: 'Jeudi' },
  { value: '5', label: 'Vendredi' },
  { value: '6', label: 'Samedi' },
  { value: '0', label: 'Dimanche' },
]

const cronNode: NodeSpec<CronConfig, Record<string, never>, { tick: { at: string } }> = {
  type: 'cron',
  category: 'import',
  label: 'Cron (planifié)',
  description:
    "Déclencheur planifié : exécute le workflow côté serveur à cadence régulière (minute / heure / jour / semaine / mois). « Heure » = à HH:MM (jour/semaine/mois) ; « Jour » = jour de semaine ciblé (unité semaine). Fuseau Europe/Paris. ⚠️ Plancher effectif : 10 min (le scanner serveur tourne toutes les 10 min) — une cadence < 10 min sera traitée toutes les 10 min. Active « Planification » et sauvegarde pour enregistrer.",
  icon: CalendarClock,
  inputs: [],
  outputs: [{ name: 'tick', type: 'any' }],
  configSchema: [
    { name: 'enabled', kind: 'checkbox', label: 'Planification active' },
    { name: 'every', kind: 'number', label: 'Tous les', default: 1 },
    { name: 'unit', kind: 'select', label: 'Unité', options: SERVER_UNITS, default: 'day' },
    {
      name: 'atTime',
      kind: 'text',
      label: 'Heure (HH:MM)',
      help: 'Heure de déclenchement pour jour / semaine / mois (Europe/Paris). Ex : 14:30. Ignoré pour « heure(s) ».',
    },
    {
      name: 'weekday',
      kind: 'select',
      label: 'Jour (unité semaine)',
      options: WEEKDAY_OPTIONS,
      default: '1',
    },
  ],
  defaultConfig: { enabled: false, every: 1, unit: 'day', atTime: '09:00', weekday: 1 },
  runtime: 'server',
  run: async (ctx, config) => {
    const at = new Date().toISOString()
    ctx.log('info', `Tick cron (tous les ${describeCron(config)}).`)
    return { tick: { at } }
  },
}

nodeRegistry.register(cronNode)
