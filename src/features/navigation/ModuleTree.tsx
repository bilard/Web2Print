import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useAccessStore } from '@/stores/access.store'
import { groupModules, type ModuleItem, type ModuleChild, type Section } from './modules'

const STORE_KEY = 'nav:tree:expanded'

function readExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface ModuleRowExtras {
  id?: string
  ref?: React.Ref<HTMLButtonElement>
  className?: string
  tabIndex?: number
  title?: string
  role?: string
  'data-help-id'?: string
  'aria-label'?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean
}

interface ModuleTreeProps {
  modules: ModuleItem[]
  activeSection?: Section
  onOpen: (section: Section) => void
  onOpenChild: (section: Section, intent: string, routeTo?: string) => void
  moduleRowExtras?: (m: ModuleItem) => ModuleRowExtras | undefined
}

export function ModuleTree({ modules, activeSection, onOpen, onOpenChild, moduleRowExtras }: ModuleTreeProps) {
  const isAdmin = useIsAdmin()
  const permissions = useAccessStore((s) => s.permissions)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(readExpanded)

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      // Accordéon : un seul module déplié à la fois — ouvrir un module referme les autres.
      const next = prev[id] ? {} : { [id]: true }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  const canChild = (c: ModuleChild) => isAdmin || !c.permission || permissions.has(c.permission)

  const renderModule = (m: ModuleItem) => {
    const Icon = m.icon
    const kids = (m.children ?? []).filter(canChild)
    const isOpen = !!expanded[m.id]
    const isActive = activeSection === m.id
    const extras = moduleRowExtras?.(m)
    const { ref: rowRef, className: rowExtraClass, ...rowRest } = extras ?? {}
    return (
      <div key={m.id}>
        <div className={`group flex items-center rounded-md ${isActive ? m.activeBg : 'hover:bg-white/[0.04]'}`}>
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(m.id)}
              aria-label={`${isOpen ? 'Replier' : 'Déplier'} ${m.label}`}
              aria-expanded={isOpen}
              className="p-1.5 text-white/30 hover:text-white/70 transition-transform"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-[26px]" aria-hidden="true" />
          )}
          <button
            type="button"
            ref={rowRef}
            onClick={() => {
              onOpen(m.id)
              if (kids.length > 0) toggle(m.id)
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex items-center gap-2.5 pr-3 py-[7px] rounded-md text-[13px] text-left transition-colors
              ${isActive ? m.activeText : 'text-white/55 hover:text-white/85'} ${rowExtraClass ?? ''}`}
            {...rowRest}
          >
            <Icon className={`w-4 h-4 shrink-0 opacity-70 ${m.accent}`} />
            <span className="flex-1">{m.label}</span>
          </button>
        </div>
        {isOpen && kids.length > 0 && (
          <div className="ml-[26px] pl-2 border-l border-white/[0.06]">
            {kids.map((c) => (
              <button
                key={c.id}
                type="button"
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
  }

  return (
    <div className="space-y-0.5">
      {groupModules(modules).map(({ group, items }, gi) => (
        <div key={group.id} className={gi > 0 ? 'pt-3' : ''}>
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25 select-none">
            {group.label}
          </div>
          {items.map(renderModule)}
        </div>
      ))}
    </div>
  )
}
