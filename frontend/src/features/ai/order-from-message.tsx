import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Sparkles, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { clientsApi } from '@/features/clients/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useErrorToast } from '@/hooks/use-api-toast'
import { cn } from '@/lib/utils'
import { aiApi, useAiEnabled, type OrderDraft } from './api'

interface Props {
  /** Fills the order form; only fields the AI found are passed. */
  onDraft: (draft: OrderDraft, clientId: string | null) => void
}

/**
 * "Paste the client's message": the AI turns a WhatsApp / Instagram message into
 * an order draft (title, details, price, deadline) and finds the client by phone or
 * name. If the client is new, it can be created in one click. Nothing is saved
 * until the user presses "Create".
 */
export function OrderFromMessage({ onDraft }: Props) {
  const { t } = useTranslation()
  const enabled = useAiEnabled()
  const { workspaceId } = useWorkspace()
  const queryClient = useQueryClient()
  const showError = useErrorToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [newClient, setNewClient] = useState<{ name: string; phone: string | null } | null>(null)

  const parse = useMutation({
    mutationFn: () => aiApi.parseOrder(workspaceId, text.trim()),
    onSuccess: (draft) => {
      onDraft(draft, draft.matchedClientId)
      setNewClient(!draft.matchedClientId && draft.clientName ? { name: draft.clientName, phone: draft.clientPhone } : null)
      toast.success(draft.matchedClientId ? t('ai.fromMessage.filledWithClient') : t('ai.fromMessage.filled'))
    },
    onError: showError,
  })
  const createClient = useMutation({
    mutationFn: (c: { name: string; phone: string | null }) => clientsApi.create(workspaceId, { name: c.name, phone: c.phone ?? undefined }),
    onSuccess: async (client) => {
      await queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'clients'] })
      onDraft({ title: null, description: null, totalAmount: null, currency: null, deadline: null, clientName: null, clientPhone: null, matchedClientId: client.id }, client.id)
      setNewClient(null)
      toast.success(t('ai.fromMessage.clientCreated', { name: client.name }))
    },
    onError: showError,
  })

  if (!enabled) return null

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="flex-1">{t('ai.fromMessage.title')}</span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="grid gap-2 px-3 pb-3">
          <p className="text-xs text-muted-foreground">{t('ai.fromMessage.hint')}</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder={t('ai.fromMessage.placeholder')}
            aria-label={t('ai.fromMessage.title')}
            className="bg-background"
          />
          <Button type="button" size="sm" className="justify-self-end" disabled={!text.trim() || parse.isPending} onClick={() => parse.mutate()}>
            <Sparkles className={parse.isPending ? 'animate-pulse' : undefined} />
            {parse.isPending ? t('ai.thinking') : t('ai.fromMessage.fill')}
          </Button>
          {newClient ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
              <span>
                {t('ai.fromMessage.newClient', { name: newClient.name })}
                {newClient.phone ? <span className="text-muted-foreground"> · {newClient.phone}</span> : null}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={createClient.isPending} onClick={() => createClient.mutate(newClient)}>
                <UserPlus />
                {t('ai.fromMessage.createClient')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
