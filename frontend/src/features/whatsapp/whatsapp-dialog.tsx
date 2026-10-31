import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Link2, MessageCircle, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { aiApi, useAiEnabled, type MessagePurpose, type MessageTone } from '@/features/ai/api'
import { ordersApi, type Order } from '@/features/orders/api'
import { orderExtrasApi } from '@/features/orders/extras-api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useErrorToast } from '@/hooks/use-api-toast'
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n'
import { whatsappNumber, whatsappUrl } from '@/lib/phone'
import { cn } from '@/lib/utils'

/*
 * "Write in WhatsApp": pick what the message is about, get a ready text (template or
 * written by the AI from the real order data), edit it, and open the chat with the
 * client — wa.me opens WhatsApp on the phone or WhatsApp Web with the text typed in.
 */

export interface WhatsAppClient {
  id: string
  name: string
  phone: string | null
}

const PURPOSES: MessagePurpose[] = ['GREETING', 'ORDER_CONFIRMED', 'ORDER_READY', 'PAYMENT_REMINDER', 'THANK_YOU', 'REVIEW_REQUEST', 'CUSTOM']
const NEEDS_ORDER: MessagePurpose[] = ['ORDER_CONFIRMED', 'ORDER_READY', 'PAYMENT_REMINDER']
const TONES: MessageTone[] = ['FRIENDLY', 'NEUTRAL', 'FORMAL']
const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const
const NO_ORDER = 'none'

function moneyIn(lang: string, amount: number, currency: string) {
  return new Intl.NumberFormat(LOCALES[lang as keyof typeof LOCALES] ?? 'ru-RU', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function dateIn(lang: string, iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALES[lang as keyof typeof LOCALES] ?? 'ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(y, m - 1, d),
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: WhatsAppClient
  /** Preselected order; on the client page the user may pick one of the client's orders. */
  order?: Order
  purpose?: MessagePurpose
}

export function WhatsAppDialog({ open, onOpenChange, client, order, purpose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <Body client={client} order={order} initialPurpose={purpose} /> : null}
    </Dialog>
  )
}

function Body({ client, order: fixedOrder, initialPurpose }: { client: WhatsAppClient; order?: Order; initialPurpose?: MessagePurpose }) {
  const { t } = useTranslation()
  const { workspaceId, workspaceName, canManageRecords } = useWorkspace()
  const aiEnabled = useAiEnabled()
  const showError = useErrorToast()

  const [orderId, setOrderId] = useState<string>(fixedOrder?.id ?? NO_ORDER)
  const [purpose, setPurpose] = useState<MessagePurpose>(initialPurpose ?? (fixedOrder ? 'ORDER_READY' : 'GREETING'))
  const [lang, setLang] = useState<string>(i18n.resolvedLanguage ?? 'ru')
  const [tone, setTone] = useState<MessageTone>('FRIENDLY')
  const [instructions, setInstructions] = useState('')
  const [edited, setEdited] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [phone, setPhone] = useState(client.phone ?? '')

  const clientOrders = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'for-whatsapp', client.id],
    queryFn: () => ordersApi.list(workspaceId, { clientId: client.id, archive: 'ACTIVE', sort: 'CREATED_AT', direction: 'DESC', size: 20 }),
    enabled: !fixedOrder,
  })
  const order = fixedOrder ?? clientOrders.data?.items.find((o) => o.id === orderId)
  const needsOrder = NEEDS_ORDER.includes(purpose)

  const share = useMutation({
    mutationFn: () => orderExtrasApi.createShare(workspaceId, order!.id),
    onSuccess: (r) => {
      setLink(r.url)
      setEdited((text) => (text === null ? null : `${text}\n\n${i18n.getFixedT(lang)('remind.link', { url: r.url, interpolation: { escapeValue: false } })}`))
    },
    onError: () => toast.error(t('collect.linkFailed')),
  })

  const ai = useMutation({
    mutationFn: () =>
      aiApi.message(workspaceId, {
        clientId: client.id,
        orderId: order?.id,
        purpose,
        tone,
        language: lang,
        instructions: instructions.trim() || undefined,
      }),
    onSuccess: (r) => {
      const ft = i18n.getFixedT(lang)
      setEdited(link ? `${r.text}\n\n${ft('remind.link', { url: link, interpolation: { escapeValue: false } })}` : r.text)
    },
    onError: showError,
  })

  const template = useMemo(() => {
    const ft = i18n.getFixedT(lang)
    const vars = {
      name: client.name,
      business: workspaceName,
      number: order?.orderNumber ?? '',
      title: order?.title ?? '',
      amount: order ? moneyIn(lang, order.balance, order.currency) : '',
      total: order ? moneyIn(lang, order.totalAmount, order.currency) : '',
      due: order?.deadline ? ft('wa.due', { date: dateIn(lang, order.deadline) }) : '',
      interpolation: { escapeValue: false },
    }
    const parts = [ft(`wa.templates.${purpose}`, vars)]
    if (link) parts.push(ft('remind.link', { url: link, interpolation: { escapeValue: false } }))
    parts.push(`— ${workspaceName}`)
    return parts.join('\n\n')
  }, [lang, purpose, order, client.name, workspaceName, link])

  const text = edited ?? template
  const number = whatsappNumber(phone)
  const blocked = needsOrder && !order

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
    )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('collect.copied'))
    } catch {
      toast.error(t('collect.copyFailed'))
    }
  }

  return (
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="cf-wa grid size-7 place-items-center rounded-full">
            <MessageCircle className="size-4" aria-hidden />
          </span>
          {t('wa.title', { name: client.name })}
        </DialogTitle>
        <DialogDescription>{t('wa.hint')}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="wa-phone">{t('clients.phone')}</Label>
            <Input
              id="wa-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="+7 701 123 45 67"
              aria-invalid={phone && !number ? true : undefined}
            />
          </div>
          {fixedOrder ? null : (
            <div className="grid gap-2">
              <Label htmlFor="wa-order">{t('wa.order')}</Label>
              <Select value={orderId} onValueChange={(v) => { setOrderId(v); setEdited(null); setLink(null) }}>
                <SelectTrigger id="wa-order" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ORDER}>{t('wa.noOrder')}</SelectItem>
                  {clientOrders.data?.items.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNumber} · {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <span className="cf-eyebrow">{t('wa.purpose')}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('wa.purpose')}>
            {PURPOSES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={purpose === p}
                className={pill(purpose === p)}
                onClick={() => { setPurpose(p); setEdited(null) }}
              >
                {t(`wa.purposes.${p}`)}
              </button>
            ))}
          </div>
          {blocked ? <p className="text-xs text-muted-foreground">{t('wa.pickOrder')}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('collect.language')}>
          <span className="cf-eyebrow mr-1">{t('collect.language')}</span>
          {SUPPORTED_LANGUAGES.map((x) => (
            <button key={x} type="button" aria-pressed={lang === x} className={cn(pill(lang === x), 'font-mono')} onClick={() => { setLang(x); setEdited(null) }}>
              {t(`language.${x}`)}
            </button>
          ))}
        </div>

        {aiEnabled ? (
          <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('collect.tone')}>
              <span className="cf-eyebrow mr-1 flex items-center gap-1 text-primary">
                <Sparkles className="size-3" aria-hidden />
                {t('wa.aiTitle')}
              </span>
              {TONES.map((x) => (
                <button key={x} type="button" aria-pressed={tone === x} className={pill(tone === x)} onClick={() => setTone(x)}>
                  {t(`wa.tones.${x}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={1000}
                placeholder={t('wa.aiPlaceholder')}
                aria-label={t('wa.aiPlaceholder')}
                className="bg-background"
              />
              <Button type="button" className="shrink-0" disabled={ai.isPending || blocked} onClick={() => ai.mutate()}>
                <Sparkles className={ai.isPending ? 'animate-pulse' : undefined} />
                {ai.isPending ? t('ai.thinking') : t('wa.aiWrite')}
              </Button>
            </div>
          </div>
        ) : null}

        <Textarea
          value={text}
          onChange={(e) => setEdited(e.target.value)}
          rows={7}
          className="resize-y text-sm leading-relaxed"
          aria-label={t('collect.message')}
        />

        {order && (canManageRecords || order.canEdit) ? (
          <Button type="button" size="sm" variant="ghost" className="justify-self-start" disabled={share.isPending || link !== null} onClick={() => share.mutate()}>
            <Link2 />
            {link ? t('collect.linkAdded') : t('collect.addLink')}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {number && !blocked ? (
          <Button asChild className="cf-wa">
            <a href={whatsappUrl(number, text)} target="_blank" rel="noreferrer">
              <MessageCircle />
              {t('wa.open')}
            </a>
          </Button>
        ) : (
          <Button className="cf-wa" disabled>
            <MessageCircle />
            {t('wa.open')}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={copy}>
          <Copy />
          {t('collect.copy')}
        </Button>
        {!number ? <p className="w-full text-xs text-muted-foreground">{t('wa.noPhone')}</p> : null}
      </div>
    </DialogContent>
  )
}
