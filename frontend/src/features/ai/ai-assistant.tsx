import { useMutation } from '@tanstack/react-query'
import { ArrowUp, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useErrorMessage } from '@/components/api-error-alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { cn } from '@/lib/utils'
import { aiApi, useAiEnabled, type ChatMessage } from './api'
import { RichText } from './rich-text'

const SUGGESTIONS = ['today', 'debtors', 'overdue', 'week', 'growth'] as const

/** Floating "AI assistant" button on every signed-in page and the chat panel it opens. */
export function AiAssistant() {
  const enabled = useAiEnabled()
  const { workspaceId } = useWorkspace()
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  if (!enabled) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('ai.open')}
        className="cf-ai-fab fixed right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 sm:right-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('ai.fab')}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          {/* A new conversation per workspace: the assistant only knows the current one */}
          <Chat key={workspaceId} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function Chat() {
  const { t } = useTranslation()
  const { workspaceId, workspaceName } = useWorkspace()
  const errorMessage = useErrorMessage()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (history: ChatMessage[]) => aiApi.chat(workspaceId, history),
    onSuccess: (reply) => setMessages((m) => [...m, { role: 'assistant', text: reply.text }]),
  })

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, send.isPending])

  const ask = (text: string) => {
    const question = text.trim()
    if (!question || send.isPending) return
    const history: ChatMessage[] = [...messages, { role: 'user', text: question }]
    setMessages(history)
    setDraft('')
    send.mutate(history)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </span>
          {t('ai.title')}
        </SheetTitle>
        <SheetDescription>{t('ai.subtitle', { name: workspaceName })}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t('ai.intro')}</p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => ask(t(`ai.suggestions.${key}`))}
                  className="rounded-xl border bg-card px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(`ai.suggestions.${key}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-3">
            {messages.map((m, i) => (
              <li key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm',
                    m.role === 'user'
                      ? 'rounded-br-md bg-primary text-primary-foreground whitespace-pre-line'
                      : 'rounded-bl-md bg-muted text-foreground/90',
                  )}
                >
                  {m.role === 'user' ? m.text : <RichText text={m.text} />}
                </div>
              </li>
            ))}
            {send.isPending ? (
              <li className="flex">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3" aria-label={t('ai.thinking')}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="cf-ai-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </li>
            ) : null}
          </ul>
        )}
        {send.isError ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{errorMessage(send.error)}</span>
            <Button size="sm" variant="ghost" onClick={() => send.mutate(messages)}>
              {t('ai.retry')}
            </Button>
          </div>
        ) : null}
        <div ref={bottom} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(draft)
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={t('ai.placeholder')}
            aria-label={t('ai.placeholder')}
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending} aria-label={t('ai.send')}>
            <ArrowUp />
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{t('ai.disclaimer')}</span>
          {messages.length > 0 ? (
            <button
              type="button"
              className="flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setMessages([])
                send.reset()
              }}
            >
              <RotateCcw className="size-3" aria-hidden />
              {t('ai.newChat')}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
