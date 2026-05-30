// Lightweight markdown renderer: **bold**, ## heading, - list, paragraphs.
// Cukup untuk AI-generated insight/recommendation cards.

import type { ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[1]}</strong>)
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts
}

export default function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let listBuf: string[] = []
  let key = 0

  const flushList = () => {
    if (listBuf.length === 0) return
    blocks.push(
      <ul key={key++} style={{ margin: '6px 0 10px 0', paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {listBuf.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
      </ul>,
    )
    listBuf = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushList(); continue }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuf.push(line.slice(2))
      continue
    }
    flushList()
    if (line.startsWith('### ')) {
      blocks.push(<h4 key={key++} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 6px' }}>{line.slice(4)}</h4>)
    } else if (line.startsWith('## ')) {
      blocks.push(<h3 key={key++} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px' }}>{line.slice(3)}</h3>)
    } else if (line.startsWith('# ')) {
      blocks.push(<h3 key={key++} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px' }}>{line.slice(2)}</h3>)
    } else {
      blocks.push(<p key={key++} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '4px 0' }}>{renderInline(line)}</p>)
    }
  }
  flushList()

  return <>{blocks}</>
}
