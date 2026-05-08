// src/features/workflows/registry/taxonomyNodes.ts
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

export const importTaxonomyNode: NodeSpec<
  ImportTaxonomyConfig,
  ImportTaxonomyInputs,
  ImportTaxonomyOutputs
> = {
  type: 'import-taxonomy',
  category: 'persistence',
  label: 'Import Taxonomie',
  description:
    "Construit une taxonomie hiérarchique depuis les colonnes de niveau d'une Sheet et la persiste dans Firestore.",
  icon: Network,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'pim-products' }],
  configSchema: [
    {
      name: 'name',
      kind: 'text',
      label: 'Nom de la taxonomie',
      required: true,
      default: 'Taxonomie importée',
    },
    {
      name: 'levelMap',
      kind: 'text',
      label: 'Mapping niveaux (optionnel)',
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
      throw new Error('Sheet manquante en entrée — branchez un node qui produit une Sheet.')
    }

    const user = useAuthStore.getState().user
    if (!user) {
      throw new Error('Utilisateur non authentifié — connectez-vous avant de lancer ce node.')
    }

    const levels = config.levelMap.trim()
      ? parseLevelMap(config.levelMap)
      : (sheet.taxonomyLevels ?? {})

    if (Object.keys(levels).length === 0) {
      throw new Error(
        "Aucun niveau de taxonomie défini — la Sheet doit avoir `taxonomyLevels` ou la config doit lister les colonnes (ex: `categorie:1,sous_categorie:2`).",
      )
    }

    ctx.log(
      'info',
      `Construction de la taxonomie depuis ${Object.keys(levels).length} colonne(s) niveau`,
    )
    const nodes = buildTaxNodesFromLevels(sheet, levels)
    const nodeCount = Object.keys(nodes).length
    if (nodeCount === 0) {
      throw new Error('Aucun nœud de taxonomie produit — vérifiez que les colonnes contiennent bien des valeurs.')
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

    ctx.log('info', `Persistance Firestore — ${nodeCount} nœud(s) sous l'id ${id}`)
    await setDoc(doc(db, 'taxonomies', id), taxonomy)

    return { result: { taxonomyId: id, nodeCount, name: taxonomy.name } }
  },
}

nodeRegistry.register(importTaxonomyNode)
