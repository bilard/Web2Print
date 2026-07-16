/**
 * Contrôleur du flux « Vérification Fabricant » à la demande (une fiche).
 * Machine à états : idle → resolving → candidates → scraping → done | error.
 */

import { useCallback, useState } from 'react'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { resolveManufacturerCandidates } from './resolveManufacturer'
import { verifyAgainstManufacturer } from './runVerify'
import { useSaveManufacturerData } from './useSaveManufacturerData'
import type { FieldComparison, ManufacturerCandidate, VerdictSummary } from './types'

export type VerifyPhase = 'idle' | 'resolving' | 'candidates' | 'scraping' | 'done' | 'error'

export function useManufacturerVerify(rowId: string) {
  const [phase, setPhase] = useState<VerifyPhase>('idle')
  const [candidates, setCandidates] = useState<ManufacturerCandidate[]>([])
  const [comparisons, setComparisons] = useState<FieldComparison[]>([])
  const [summary, setSummary] = useState<VerdictSummary | null>(null)
  const [mfrName, setMfrName] = useState<string | null>(null)
  const [mfrUrl, setMfrUrl] = useState<string | null>(null)
  const [eanMatch, setEanMatch] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const { save, saving } = useSaveManufacturerData()

  const pushLog = useCallback((m: string) => setLogs((l) => [...l, m]), [])

  const reset = useCallback(() => {
    setPhase('idle'); setCandidates([]); setComparisons([]); setSummary(null); setError(null); setMfrName(null); setMfrUrl(null); setEanMatch(null); setLogs([])
  }, [])

  /** Étape 1 : proposer les pages fabricant candidates (avec réf en clair). */
  const resolve = useCallback(async (source: EnrichedProduct) => {
    setPhase('resolving'); setError(null); setLogs([])
    try {
      const found = await resolveManufacturerCandidates({
        url: source.sourceUrl ?? '',
        brand: source.brand,
        manufacturerRef: source.manufacturerRef,
        name: source.name,
        ean: source.ean,
      }, pushLog)
      if (found.length === 0) {
        setError("Aucune page fabricant n'a pu être identifiée pour ce produit (marque ou référence manquante).")
        setPhase('error')
        return
      }
      setCandidates(found)
      setPhase('candidates')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant la recherche du site fabricant.')
      setPhase('error')
    }
  }, [pushLog])

  /** Étape 2 : l'utilisateur confirme une page → scrape + compare + sauvegarde. */
  const confirm = useCallback(async (candidate: ManufacturerCandidate, source: EnrichedProduct) => {
    setPhase('scraping'); setError(null)
    pushLog(`Page confirmée : ${candidate.title}`)
    try {
      const res = await verifyAgainstManufacturer(source, candidate, pushLog)
      if (res.blocked) {
        setError('Le site fabricant a bloqué l’extraction (page dynamique / anti-bot). Réessayez plus tard.')
        setPhase('error')
        return
      }
      setComparisons(res.comparisons)
      setSummary(res.summary)
      setMfrName(res.mfr.name ?? candidate.brand)
      setMfrUrl(candidate.url)
      setEanMatch(res.eanMatch)
      pushLog('Enregistrement dans la fiche…')
      await save(rowId, res.mfr, { candidate, alignment: res.alignment })
      pushLog('Terminé ✓')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant le scraping fabricant.')
      setPhase('error')
    }
  }, [rowId, save, pushLog])

  return { phase, candidates, comparisons, summary, mfrName, mfrUrl, eanMatch, error, saving, logs, resolve, confirm, reset }
}
