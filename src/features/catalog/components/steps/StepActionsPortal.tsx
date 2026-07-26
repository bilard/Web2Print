// Téléporte les actions d'une étape (Générer, Continuer…) dans le slot de la
// barre d'étapes (CatalogStepsNav) — toujours visibles, même page scrollée.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { STEP_ACTIONS_SLOT_ID } from '../CatalogStepsNav'

export function StepActionsPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  // Le slot est monté par la nav AVANT les étapes (même render du builder),
  // mais on le résout après montage pour éviter tout ordre d'initialisation.
  useEffect(() => { setHost(document.getElementById(STEP_ACTIONS_SLOT_ID)) }, [])
  return host ? createPortal(children, host) : null
}
