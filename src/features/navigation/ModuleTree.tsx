import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useModuleViewStore } from '@/stores/moduleView.store'
import { useAccessStore } from '@/stores/access.store'
import { groupModules, type ModuleItem, type ModuleChild, type Section } from './modules'
import { useTranslation } from '@/lib/i18n'
import { isPlainClick } from '@/lib/plainClick'

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
  ref?: React.Ref<HTMLAnchorElement>
  className?: string
  tabIndex?: number
  title?: string
  role?: string
  'data-help-id'?: string
  'aria-label'?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLAnchorElement>
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean
}

interface ModuleTreeProps {
  modules: ModuleItem[]
  activeSection?: Section
  onOpen: (section: Section) => void
  onOpenChild: (section: Section, intent: string, routeTo?: string) => void
  moduleRowExtras?: (m: ModuleItem) => ModuleRowExtras | undefined
  /** Adresse de cette entrée, pour que la rangée soit un VRAI lien. Sans elle, l'entrée
   *  reste cliquable mais le ⌘-clic ne peut rien ouvrir : le navigateur n'a pas de
   *  destination. Cf. `isPlainClick`. */
  linkFor?: (section: Section, intent?: string, routeTo?: string) => string | undefined
}

export function ModuleTree({ modules, activeSection, onOpen, onOpenChild, moduleRowExtras, linkFor }: ModuleTreeProps) {
  const isAdmin = useIsAdmin()
  const permissions = useAccessStore((s) => s.permissions)
  const moduleViews = useModuleViewStore((s) => s.views)
  const { t } = useTranslation()
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
    const activeChild = moduleViews[m.id] ?? null
    const extras = moduleRowExtras?.(m)
    const { ref: rowRef, className: rowExtraClass, ...rowRest } = extras ?? {}
    return (
      <div key={m.id}>
        <div className={`group flex items-center rounded-md ${isActive ? m.activeBg : 'hover:bg-white/[0.04]'}`}>
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(m.id)}
              aria-label={t(isOpen ? 'nav.tree.collapse' : 'nav.tree.expand', { module: t(m.labelKey) })}
              aria-expanded={isOpen}
              className="p-1.5 text-white/30 hover:text-white/70 transition-transform"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-[26px]" aria-hidden="true" />
          )}
          {/* Rangée = VRAI lien. `href` donne au navigateur une destination : ⌘-clic,
              clic du milieu, « ouvrir dans un nouvel onglet » et l'aperçu d'adresse au
              survol marchent alors sans une ligne de code. Le clic gauche nu, lui, reste
              à l'application — qui ouvre le module sans recharger la page. */}
          <a
            href={linkFor?.(m.id) ?? '#'}
            ref={rowRef}
            onClick={(e) => {
              if (!isPlainClick(e)) return // ⌘/Ctrl/Maj/clic du milieu : au navigateur
              e.preventDefault()
              onOpen(m.id)
              if (kids.length > 0) toggle(m.id)
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex items-center gap-2.5 pr-3 py-[7px] rounded-md text-[13px] text-left transition-colors
              ${isActive ? m.activeText : 'text-white/55 hover:text-white/85'} ${rowExtraClass ?? ''}`}
            {...rowRest}
          >
            <Icon className={`w-4 h-4 shrink-0 opacity-70 ${m.accent}`} />
            <span className="flex-1">{t(m.labelKey)}</span>
          </a>
        </div>
        {isOpen && kids.length > 0 && (
          <div className="ml-[26px] pl-2 border-l border-white/[0.06]">
            {kids.map((c) => {
              // Enfant actif : seulement quand SON module est ouvert. Sinon deux modules
              // afficheraient chacun une fonction allumée, et le menu dirait deux endroits
              // à la fois.
              const childActive = isActive && activeChild === c.id
              return (
                <a
                  key={c.id}
                  href={linkFor?.(m.id, c.intent, c.routeTo) ?? '#'}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return
                    e.preventDefault()
                    onOpenChild(m.id, c.intent, c.routeTo)
                  }}
                  aria-current={childActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12.5px] text-left
                    transition-colors ${childActive
                      ? `bg-white/[0.06] ${m.activeText}`
                      : 'text-white/40 hover:text-white/75 hover:bg-white/[0.04]'}`}
                >
                  <span className="flex-1">{t(c.labelKey)}</span>
                </a>
              )
            })}
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
            {t(group.labelKey)}
          </div>
          {items.map(renderModule)}
        </div>
      ))}
    </div>
  )
}
