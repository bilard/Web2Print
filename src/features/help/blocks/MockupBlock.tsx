import type { ComponentType } from 'react'

interface MockupBlockProps {
  Component: ComponentType
}

export function MockupBlock({ Component }: MockupBlockProps) {
  return (
    <div className="my-3 p-4 rounded-lg border border-white/10 bg-[#0f0f0f] flex items-center justify-center">
      <Component />
    </div>
  )
}
