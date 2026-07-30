import { CalendarClock } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { describeCron, describeCycle, type CronConfig } from '../runtime/cronSchedule'
import { CronConfigUi } from './cronConfigUi'
import { DEFAULT_CYCLE } from './cronCycleUi'

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
  labelKey: 'node.cron.label',
  descriptionKey: 'node.cron.desc',
  icon: CalendarClock,
  inputs: [],
  outputs: [{ name: 'tick', type: 'any' }],
  configSchema: [
    { name: 'enabled', kind: 'checkbox', label: 'Planification active' },
    { name: 'every', kind: 'number', label: 'Tous les', default: 1 },
    { name: 'unit', kind: 'select', labelKey: 'node.cron.unit.label', options: SERVER_UNITS, default: 'day' },
    {
      name: 'afterCompletion',
      kind: 'checkbox',
      labelKey: 'node.cron.f1',
      helpKey: 'node.cron.afterEnd.help',
    },
    {
      name: 'atTime',
      kind: 'text',
      labelKey: 'node.cron.f2',
      helpKey: 'node.cron.f3',
      // Grisé UNIQUEMENT en mode « après la fin » (demande utilisateur) — sinon éditable.
      disabledWhen: (c) => !!c.afterCompletion,
    },
    {
      name: 'weekday',
      kind: 'select',
      labelKey: 'node.cron.f4',
      options: WEEKDAY_OPTIONS,
      default: '1',
      // Grisé UNIQUEMENT en mode « après la fin » (demande utilisateur) — sinon éditable.
      disabledWhen: (c) => !!c.afterCompletion,
    },
  ],
  defaultConfig: {
    enabled: false, every: 1, unit: 'day', afterCompletion: false, atTime: '09:00', weekday: 1,
    cycle: { ...DEFAULT_CYCLE },
  },
  // Résumé du planning affiché directement sur la carte (préfixe ⏸ si inactif).
  cardSummary: (config) =>
    `${config.enabled ? '' : '⏸ '}${describeCron(config)}${config.cycle?.enabled ? ` · ${describeCycle(config.cycle)}` : ''}`,
  ConfigComponent: CronConfigUi,
  runtime: 'server',
  run: async (ctx, config) => {
    const at = new Date().toISOString()
    ctx.log('info', `Tick cron (tous les ${describeCron(config)}).`)
    return { tick: { at } }
  },
}

nodeRegistry.register(cronNode)
