import { Database } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { saveProducts } from '@/features/pim/usePimFirebase'
import type { Product, ProductField } from '@/features/pim/types'
import type { CellValue } from '@/features/excel/types'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface SavePimConfig {
  projectId: string
  sourceId: string
}

interface SavePimInputs {
  sheet: { rows?: Array<Record<string, unknown>>; [key: string]: unknown } | null
}

const savePimNode: NodeSpec<
  SavePimConfig,
  SavePimInputs,
  { result: { count: number; projectId: string } }
> = {
  type: 'save-pim',
  category: 'persistence',
  labelKey: 'node.save-pim.label',
  descriptionKey: 'node.save-pim.desc',
  icon: Database,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'pim-products' }],
  configSchema: [
    {
      name: 'projectId',
      kind: 'text',
      labelKey: 'node.save-pim.f1',
      required: true,
      helpKey: 'node.save-pim.f2',
    },
    {
      name: 'sourceId',
      kind: 'text',
      labelKey: 'node.save-pim.f3',
      required: true,
      default: 'workflow-import',
      helpKey: 'node.save-pim.sourceId.help',
    },
  ],
  defaultConfig: { projectId: '', sourceId: 'workflow-import' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    if (!config.projectId) {
      ctx.log('error', t('run.pim.missingProjectConfig'))
      return { result: { count: 0, projectId: '' } }
    }

    ctx.log('warn', t('run.pim.sourceNotRegistered', { source: config.sourceId }))

    const rows = (inputs.sheet?.rows ?? []) as Array<Record<string, unknown>>
    const now = Date.now()

    const products: Product[] = rows.map((row, idx) => {
      const rowId =
        typeof row._id === 'string' && row._id ? row._id : `wf_${now}_${idx}`

      const fields: Record<string, ProductField> = {}
      // Build a snapshot for the SourceLink (all non-_id fields as CellValue)
      const snapshot: Record<string, CellValue> = {}

      for (const [k, v] of Object.entries(row)) {
        if (k === '_id') continue
        const cellVal = v as CellValue
        fields[k] = { value: cellVal, winningSourceId: config.sourceId }
        snapshot[k] = cellVal
      }

      // NOTE: saveProducts will not register the source on the Project document.
      // If the target project doesn't already have a Source with config.sourceId,
      // the product will be saved but won't appear in the source list.
      // Phase 2 should call saveSources() first to register the source.
      return {
        _id: rowId,
        masterSku: null,
        masterEan: null,
        primarySourceId: config.sourceId,
        fields,
        sourceLinks: [
          {
            sourceId: config.sourceId,
            snapshot,
          },
        ],
        taxonomyPath: [],
        needsDedup: false,
        createdAt: now,
        updatedAt: now,
      } satisfies Product
    })

    ctx.log('info', t('run.pim.saving', { count: products.length, project: config.projectId }))
    await saveProducts(config.projectId, products)
    return { result: { count: products.length, projectId: config.projectId } }
  },
}

// NB : le node « Save DAM » a migré vers gdriveNodes.tsx — il fait désormais un vrai upload des
// assets vers Google Drive (réutilise l'intégration Drive et son picker de dossier).

nodeRegistry.register(savePimNode)
