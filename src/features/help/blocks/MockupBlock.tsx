import { Suspense, type ComponentType } from 'react'

interface MockupBlockProps {
  Component: ComponentType
}

export function MockupBlock({ Component }: MockupBlockProps) {
  return (
    <div className="my-3 p-4 rounded-lg border border-white/10 bg-background flex items-center justify-center">
      {/* ⚠ Un mockup peut être chargé À LA DEMANDE — le générateur du site /docs/ lit cet
          index en Node, et un visuel importé directement y tirerait tout le moteur de rendu.
          Sans cette limite de suspension, React lèverait au premier de ces mockups. */}
      <Suspense fallback={<div className="h-24 w-full animate-pulse rounded-md bg-well" />}>
        <Component />
      </Suspense>
    </div>
  )
}
