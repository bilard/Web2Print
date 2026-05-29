import type { HelpSection, HelpBlock } from './content/types'
import { TextBlock } from './blocks/TextBlock'
import { ScreenshotBlock } from './blocks/ScreenshotBlock'
import { MockupBlock } from './blocks/MockupBlock'
import { ShortcutBlock } from './blocks/ShortcutBlock'
import { AccordionBlock } from './blocks/AccordionBlock'
import { MenuLink } from './MenuLink'
import { useHelpStore } from './help.store'
import { highlightNode } from './highlightText'

interface HelpSectionViewProps {
  section: HelpSection
}

export function HelpSectionView({ section }: HelpSectionViewProps) {
  const query = useHelpStore((s) => s.searchQuery)
  return (
    <article className="flex flex-col gap-1">
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-indigo-400/80 font-medium">
          {section.category}
        </div>
        <h2 className="text-lg font-semibold text-white mt-0.5">
          {highlightNode(section.title, query)}
        </h2>
        <p className="text-sm text-white/60 mt-1">{highlightNode(section.intro, query)}</p>
      </header>
      {section.blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} />
      ))}
    </article>
  )
}

function BlockRenderer({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock md={block.md} />
    case 'screenshot':
      return <ScreenshotBlock src={block.src} alt={block.alt} caption={block.caption} />
    case 'mockup':
      return <MockupBlock Component={block.Component} />
    case 'menu-link':
      return <MenuLink target={block.target} label={block.label} icon={block.icon} />
    case 'shortcut':
      return <ShortcutBlock keys={block.keys} label={block.label} />
    case 'accordion':
      return <AccordionBlock items={block.items} />
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}
