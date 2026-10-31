import { Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** "**bold**" inside a line -> <strong>. Everything else stays plain text (no HTML from the model). */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/**
 * Renders the small subset of Markdown the assistant is asked to use:
 * paragraphs, "- " / "* " / "1. " lists and **bold**.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length === 0) return
    blocks.push(
      <ul key={blocks.length} className="grid gap-1.5">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
            <span className="min-w-0">{inline(item)}</span>
          </li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) {
      list.push(item[1])
      continue
    }
    flush()
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
  }
  flush()

  return <div className={cn('grid gap-2.5 leading-relaxed', className)}>{blocks}</div>
}
