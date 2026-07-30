import { Network } from 'lucide-react'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { buildTaxNodesFromLevels } from '@/features/excel/taxonomyBuilder'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import type { ExcelSheet, TaxonomyLevelMap } from '@/features/excel/types'
import type { Taxonomy } from '@/features/taxonomy/types'
import { t } from '@/lib/i18n'

interface ImportTaxonomyConfig {
  name: string
  /** Mapping `colKey:level,colKey:level` — vide = utilise sheet.taxonomyLevels. */
  levelMap: string
}

interface ImportTaxonomyInputs {
  sheet: ExcelSheet | null
}

interface ImportTaxonomyOutputs {
  result: { taxonomyId: string; nodeCount: number; name: string }
}

function parseLevelMap(raw: string): TaxonomyLevelMap {
  const out: TaxonomyLevelMap = {}
  for (const part of raw.split(',')) {
    const [key, lvl] = part.split(':').map((s) => s.trim())
    if (key && lvl && /^\d+$/.test(lvl)) out[key] = Number(lvl)
  }
  return out
}

const importTaxonomyNode: NodeSpec<
  ImportTaxonomyConfig,
  ImportTaxonomyInputs,
  ImportTaxonomyOutputs
> = {
  type: 'import-taxonomy',
  category: 'persistence',
  labelKey: 'node.import-taxonomy.label',
  descriptionKey: 'node.import-taxonomy.desc',
  icon: Network,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'pim-products' }],
  configSchema: [
    {
      name: 'name',
      kind: 'text',
      labelKey: 'node.import-taxonomy.f1',
      required: true,
      default: 'Taxonomie importée',
    },
    {
      name: 'levelMap',
      kind: 'text',
      labelKey: 'node.import-taxonomy.f2',
      default: '',
      help:
        'Format `colKey:1,colKey:2,...`. Si vide, utilise `taxonomyLevels` de la Sheet (auto-rempli par le scrape avec breadcrumb).',
    },
  ],
  defaultConfig: { name: 'Taxonomie importée', levelMap: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = inputs.sheet
    if (!sheet) {
      throw new Error(t('run.tax.noSheet'))
    }

    const user = useAuthStore.getState().user
    if (!user) {
      throw new Error(t('run.tax.notSignedIn'))
    }

    const levels = config.levelMap.trim()
      ? parseLevelMap(config.levelMap)
      : (sheet.taxonomyLevels ?? {})

    if (Object.keys(levels).length === 0) {
      throw new Error(t('run.tax.noLevels'))
    }

    ctx.log('info', t('run.tax.building', { count: Object.keys(levels).length }))
    const nodes = buildTaxNodesFromLevels(sheet, levels)
    const nodeCount = Object.keys(nodes).length
    if (nodeCount === 0) {
      throw new Error(t('run.tax.noNode'))
    }

    const id = crypto.randomUUID()
    const now = Timestamp.now()
    const taxonomy: Taxonomy = {
      id,
      name: config.name || 'Taxonomie importée',
      ownerId: user.uid,
      createdAt: now,
      updatedAt: now,
      nodes,
      formTemplate: createDefaultFormTemplate(),
    }

    ctx.log('info', t('run.tax.saved', { count: nodeCount, id }))
    await setDoc(doc(db, 'taxonomies', id), taxonomy)

    return { result: { taxonomyId: id, nodeCount, name: taxonomy.name } }
  },
}

nodeRegistry.register(importTaxonomyNode)
