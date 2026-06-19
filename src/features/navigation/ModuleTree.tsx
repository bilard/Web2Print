// src/features/navigation/ModuleTree.tsx
import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useAccessStore } from '@/stores/access.store'
import type { ModuleItem, ModuleChild, Section } from './modules'

const STORE_KEY = 'nav:tree:expanded'

function readExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface ModuleTreeProps {
  modules: ModuleItem[]
  activeSection?: Section
  onOpen: (section: Section) => void
  onOpenChild: (section: Section, intent: string, routeTo?: string) => void
}

export function ModuleTree({ modules, activeSection, onOpen, onOpenChild }: ModuleTreeProps) {
  const isAdmin = useIsAdmin()
  const permissions = useAccessStore((s) => s.permissions)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(readExpanded)

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  const canChild = (c: ModuleChild) => isAdmin || !c.permission || permissions.has(c.permission)

  return (
    <div role="tree" aria-label="Modules" className="space-y-0.5">
      {modules.map((m) => {
        const Icon = m.icon
        const kids = (m.children ?? []).filter(canChild)
        const isOpen = !!expanded[m.id]
        const isActive = activeSection === m.id
        return (
          <div key={m.id} role="treeitem" aria-expanded={kids.length ? isOpen : undefined}>
            <div className={`group flex items-center rounded-md ${isActive ? m.activeBg : 'hover:bg-white/[0.04]'}`}>
              {kids.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-label={`${isOpen ? 'Replier' : 'Déplier'} ${m.label}`}
                  className="p-1.5 text-white/30 hover:text-white/70 transition-transform"
                >
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span className="w-[26px]" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                className={`flex-1 flex items-center gap-2.5 pr-3 py-[7px] rounded-md text-[13px] text-left transition-colors
                  ${isActive ? m.activeText : 'text-white/55 hover:text-white/85'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 opacity-70 ${m.accent}`} />
                <span className="flex-1">{m.label}</span>
              </button>
            </div>
            {isOpen && kids.length > 0 && (
              <div role="group" className="ml-[26px] pl-2 border-l border-white/[0.06]">
                {kids.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="treeitem"
                    onClick={() => onOpenChild(m.id, c.intent, c.routeTo)}
                    className="w-full flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12.5px] text-left
                      text-white/40 hover:text-white/75 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="flex-1">{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
