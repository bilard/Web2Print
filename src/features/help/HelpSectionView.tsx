import type { HelpSection, HelpBlock } from './content/types'
import { TextBlock } from './blocks/TextBlock'
import { ScreenshotBlock } from './blocks/ScreenshotBlock'
import { MockupBlock } from './blocks/MockupBlock'
import { ShortcutBlock } from './blocks/ShortcutBlock'
import { AccordionBlock } from './blocks/AccordionBlock'
import { ModuleLinksBlock } from './blocks/ModuleLinksBlock'
import { MenuLink } from './MenuLink'
import { useHelpStore } from './help.store'
import { highlightNode } from './highlightText'
import { useHelpText } from './helpI18n'

interface HelpSectionViewProps {
  section: HelpSection
}

export function HelpSectionView({ section }: HelpSectionViewProps) {
  const query = useHelpStore((s) => s.searchQuery)
  const h = useHelpText()
  return (
    <article className="flex flex-col gap-1">
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-indigo-400/80 font-medium">
          {h(section.category)}
        </div>
        <h2 className="text-lg font-semibold text-white mt-0.5">
          {highlightNode(h(section.title), query)}
        </h2>
        <p className="text-sm text-white/60 mt-1">{highlightNode(h(section.intro), query)}</p>
      </header>
      {section.blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} h={h} />
      ))}
    </article>
  )
}

function BlockRenderer({ block, h }: { block: HelpBlock; h: (fr: string) => string }) {
  switch (block.type) {
    case 'text':
      return <TextBlock md={h(block.md)} />
    case 'screenshot':
      return <ScreenshotBlock src={block.src} alt={h(block.alt)} caption={block.caption ? h(block.caption) : block.caption} />
    case 'mockup':
      return <MockupBlock Component={block.Component} />
    case 'menu-link':
      return <MenuLink target={block.target} label={h(block.label)} icon={block.icon} />
    case 'module-links':
      return <ModuleLinksBlock />
    case 'shortcut':
      return <ShortcutBlock keys={block.keys} label={h(block.label)} />
    case 'accordion':
      return <AccordionBlock items={block.items.map((it) => ({ ...it, title: h(it.title), md: h(it.md) }))} />
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}
