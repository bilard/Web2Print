// src/features/workflows/registry/persistenceNodes.ts
import { Database } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { saveProducts } from '@/features/pim/usePimFirebase'
import type { Product, ProductField } from '@/features/pim/types'
import type { CellValue } from '@/features/excel/types'

interface SavePimConfig {
  projectId: string
  sourceId: string
}

interface SavePimInputs {
  sheet: { rows?: Array<Record<string, unknown>>; [key: string]: unknown } | null
}

export const savePimNode: NodeSpec<
  SavePimConfig,
  SavePimInputs,
  { result: { count: number; projectId: string } }
> = {
  type: 'save-pim',
  category: 'persistence',
  label: 'Save PIM',
  description: 'Persiste les rows comme produits PIM dans le projet cible.',
  icon: Database,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'pim-products' }],
  configSchema: [
    {
      name: 'projectId',
      kind: 'text',
      label: 'Project ID PIM',
      required: true,
      help: 'ID Firestore du projet PIM cible',
    },
    {
      name: 'sourceId',
      kind: 'text',
      label: 'Source ID',
      required: true,
      default: 'workflow-import',
      help: 'ID de la source. Si elle n\'existe pas dans le projet, les produits seront créés mais invisibles dans la liste des sources (à corriger en phase 2).',
    },
  ],
  defaultConfig: { projectId: '', sourceId: 'workflow-import' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    if (!config.projectId) {
      ctx.log('error', 'Project ID PIM manquant dans la config')
      return { result: { count: 0, projectId: '' } }
    }

    ctx.log(
      'warn',
      `Source "${config.sourceId}" non auto-enregistrée — si elle n'existe pas dans le projet, les produits seront créés mais invisibles dans la liste des sources (à corriger en phase 2)`,
    )

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

    ctx.log(
      'info',
      `Saving ${products.length} products to PIM project ${config.projectId}`,
    )
    await saveProducts(config.projectId, products)
    return { result: { count: products.length, projectId: config.projectId } }
  },
}

// NB : le node « Save DAM » a migré vers gdriveNodes.tsx — il fait désormais un vrai upload des
// assets vers Google Drive (réutilise l'intégration Drive et son picker de dossier).

nodeRegistry.register(savePimNode)
