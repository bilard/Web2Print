import { useState, useCallback } from 'react'
import { Upload, FileText, X, Check } from 'lucide-react'
import { DndContext } from '@dnd-kit/core'
import { useCreateTaxonomy } from '@/features/taxonomy/useTaxonomyMutations'
import { parseMarkdown } from '@/features/taxonomy/parsers/parseMarkdown'
import { parseCsv } from '@/features/taxonomy/parsers/parseCsv'
import { parseXlsx } from '@/features/taxonomy/parsers/parseXlsx'
import { buildTree } from '@/features/taxonomy/taxonomyUtils'
import { TaxonomyNode as TaxonomyNodeComponent } from './TaxonomyNode'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import type { TaxonomyNode } from '@/features/taxonomy/types'

interface TaxonomyImportModalProps {
  open: boolean
  onClose: () => void
}

type Step = 'upload' | 'preview'

export function TaxonomyImportModal({ open, onClose }: TaxonomyImportModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsedNodes, setParsedNodes] = useState<TaxonomyNode[]>([])
  const [taxName, setTaxName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTaxonomy = useCreateTaxonomy()
  const { setSelectedTaxonomy } = useTaxonomyStore()

  const processFile = useCallback(async (file: File) => {
    setError(null)
    try {
      let nodes: TaxonomyNode[] = []
      const name = file.name.replace(/\.[^.]+$/, '')

      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const text = await file.text()
        nodes = parseMarkdown(text)
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text()
        nodes = parseCsv(text)
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer()
        nodes = parseXlsx(buffer)
      } else {
        setError('Format non supporté. Utilisez .md, .csv ou .xlsx')
        return
      }

      if (nodes.length === 0) {
        setError('Aucun nœud détecté dans ce fichier.')
        return
      }

      setFileName(file.name)
      setTaxName(name)
      setParsedNodes(nodes)
      setStep('preview')
    } catch {
      setError('Erreur lors du parsing du fichier.')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleConfirm = async () => {
    if (!taxName.trim() || parsedNodes.length === 0) return
    const nodesMap: Record<string, TaxonomyNode> = {}
    for (const node of parsedNodes) nodesMap[node.id] = node

    try {
      const result = await createTaxonomy.mutateAsync({ name: taxName.trim(), nodes: nodesMap })
      setSelectedTaxonomy(result.id)
      handleClose()
    } catch {
      // onError dans la mutation gère le toast
    }
  }

  const handleClose = () => {
    setStep('upload')
    setFileName('')
    setParsedNodes([])
    setTaxName('')
    setError(null)
    onClose()
  }

  if (!open) return null

  const previewNodesMap: Record<string, TaxonomyNode> = {}
  for (const n of parsedNodes) previewNodesMap[n.id] = n
  const previewTree = buildTree(previewNodesMap)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[14px] font-semibold text-white/90">
            {step === 'upload' ? 'Importer une taxonomie' : `Prévisualisation — ${parsedNodes.length} nœuds`}
          </h2>
          <button onClick={handleClose} className="text-white/30 hover:text-white/70 transition-colors" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'upload' ? (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors ${
                  isDragOver ? 'border-teal-500/60 bg-teal-500/5' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <Upload className="w-10 h-10 text-white/20" />
                <div className="text-center">
                  <p className="text-[13px] text-white/60 mb-1">Glissez votre fichier ici</p>
                  <p className="text-[11px] text-white/30">Formats : .md, .csv, .xlsx</p>
                </div>
                <label className="cursor-pointer bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white/60 text-[12px] px-4 py-2 rounded-lg transition-colors">
                  Parcourir
                  <input type="file" accept=".md,.csv,.xlsx,.xls,.txt" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
              {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-4 h-4 text-white/40 flex-shrink-0" />
                <span className="text-[11px] text-white/40 truncate">{fileName}</span>
              </div>
              <div className="mb-4">
                <label className="text-[11px] text-white/50 block mb-1.5">Nom de la taxonomie</label>
                <input
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 outline-none focus:border-indigo-500/50"
                />
              </div>
              <div className="bg-[#141414] rounded-lg border border-white/[0.06] max-h-64 overflow-y-auto py-1">
                <DndContext>
                  {previewTree.map((node) => (
                    <TaxonomyNodeComponent key={node.id} node={node} taxonomyId="" onLinkProjects={() => {}} searchQuery="" />
                  ))}
                </DndContext>
              </div>
            </div>
          )}
        </div>
        {step === 'preview' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <button onClick={() => setStep('upload')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors">
              ← Changer de fichier
            </button>
            <button
              onClick={handleConfirm}
              disabled={createTaxonomy.isPending || !taxName.trim()}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-[12px] font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Importer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
