import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Link2, Mail, MessageCircle, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { clientsApi } from '@/features/clients/api'
import { ordersApi, type Order } from '@/features/orders/api'
import { orderExtrasApi } from '@/features/orders/extras-api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n'
import { formatMoney, todayIso } from '@/lib/format'
import { whatsappNumber, whatsappUrl } from '@/lib/phone'
import { cn } from '@/lib/utils'

/*
 * "Money to collect": every active order that still has a balance, laid out on
 * a short timeline (overdue / this week / this month / later) and listed with a
 * one-click payment reminder. The reminder is written in the client's language,
 * in one of three tones, and goes out through WhatsApp, Telegram or e-mail.
 */

type Bucket = 'overdue' | 'week' | 'month' | 'later'
const BUCKETS: Bucket[] = ['overdue', 'week', 'month', 'later']
const BUCKET_COLOR: Record<Bucket, string> = {
  overdue: 'bg-destructive',
  week: 'bg-[var(--viz-highlight)]',
  month: 'bg-[var(--viz-series-1)]',
  later: 'bg-muted-foreground/35',
}

const DAY = 86_400_000

/** Whole days from today to an ISO date (negative = in the past). */
function daysFrom(today: string, date: string) {
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = date.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY)
}

function bucketOf(today: string, order: Order): Bucket {
  if (!order.deadline) return 'later'
  const days = daysFrom(today, order.deadline)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'week'
  if (days <= 31) return 'month'
  return 'later'
}

export function Receivables() {
  const { t } = useTranslation()
  const { workspaceId } = useWorkspace()
  const today = todayIso()
  const [currency, setCurrency] = useState<string | null>(null)
  const [reminding, setReminding] = useState<Order | null>(null)

  const query = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'receivables'],
    queryFn: async () => {
      const params = { archive: 'ACTIVE' as const, size: 100, sort: 'DEADLINE' as const, direction: 'ASC' as const }
      const [unpaid, partial] = await Promise.all([
        ordersApi.list(workspaceId, { ...params, paymentState: 'UNPAID' }),
        ordersApi.list(workspaceId, { ...params, paymentState: 'PARTIALLY_PAID' }),
      ])
      return [...unpaid.items, ...partial.items].filter((o) => o.status !== 'CANCELLED' && o.balance > 0)
    },
  })

  const orders = useMemo(() => query.data ?? [], [query.data])
  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) map.set(o.currency, (map.get(o.currency) ?? 0) + o.balance)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [orders])
  const selected = currency && totals.some(([c]) => c === currency) ? currency : totals[0]?.[0]

  const byBucket = useMemo(() => {
    const sums = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>
    for (const o of orders) if (o.currency === selected) sums[bucketOf(today, o)] += o.balance
    return sums
  }, [orders, selected, today])
  const total = BUCKETS.reduce((s, b) => s + byBucket[b], 0)

  // Overdue first (oldest first), then by the nearest deadline, undated last
  const list = useMemo(
    () =>
      [...orders]
        .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || b.balance - a.balance)
        .slice(0, 6),
    [orders],
  )

  if (query.isPending || orders.length === 0) return null

  return (
    <section className="cf-sheet mt-5 min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="cf-eyebrow">{t('collect.title')}</span>
          <p className="mt-1 text-sm text-muted-foreground">{t('collect.hint')}</p>
        </div>
        {totals.length > 1 ? (
          <div className="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label={t('revenue.currency')}>
            {totals.map(([c]) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === selected}
                onClick={() => setCurrency(c)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  c === selected ? 'bg-card text-foreground shadow-[var(--shadow-button)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="mt-5">
          <p className="font-mono text-[2rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{formatMoney(total, selected)}</p>
          {/* timeline: one bar, four segments */}
          <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {BUCKETS.map((b, i) =>
              byBucket[b] > 0 ? (
                <span
                  key={b}
                  className={cn('cf-grow-x h-full first:rounded-l-full last:rounded-r-full', BUCKET_COLOR[b])}
                  style={{ width: `${(byBucket[b] / total) * 100}%`, '--cf-i': i } as React.CSSProperties}
                />
              ) : null,
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {BUCKETS.map((b) => (
              <div key={b} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', BUCKET_COLOR[b])} aria-hidden />
                  {t(`collect.bucket.${b}`)}
                </dt>
                <dd className={cn('mt-0.5 font-mono text-sm tabular-nums', b === 'overdue' && byBucket[b] > 0 && 'text-destructive')}>
                  {formatMoney(byBucket[b], selected)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <ul className="mt-5 -mx-2 grid border-t border-foreground/8 pt-3">
        {list.map((o) => {
          const days = o.deadline ? daysFrom(today, o.deadline) : null
          return (
            <li key={o.id} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
              <Link to={`/orders/${o.id}`} className="grid min-w-0 flex-1 gap-0.5 outline-none focus-visible:underline">
                <span className="truncate text-sm font-medium">{o.client.name}</span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono" translate="no">{o.orderNumber}</span>
                  <span className={cn('truncate', days !== null && days < 0 && 'text-destructive')}>
                    {days === null
                      ? t('collect.noDeadline')
                      : days < 0
                        ? t('collect.overdueBy', { count: -days })
                        : days === 0
                          ? t('collect.today')
                          : t('collect.dueIn', { count: days })}
                  </span>
                </span>
              </Link>
              <span className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(o.balance, o.currency)}</span>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReminding(o)}>
                <MessageCircle />
                <span className="hidden sm:inline">{t('collect.remind')}</span>
              </Button>
            </li>
          )
        })}
      </ul>

      <ReminderDialog order={reminding} onClose={() => setReminding(null)} />
    </section>
  )
}

/* ------------------------------------------------------------------ reminder */

type Tone = 'soft' | 'neutral' | 'firm'
const TONES: Tone[] = ['soft', 'neutral', 'firm']
const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const

function ReminderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <Dialog open={order !== null} onOpenChange={(open) => (open ? null : onClose())}>
      {order ? <ReminderBody key={order.id} order={order} /> : null}
    </Dialog>
  )
}

function ReminderBody({ order }: { order: Order }) {
  const { t } = useTranslation()
  const { workspaceId, workspaceName, canManageRecords } = useWorkspace()
  const [tone, setTone] = useState<Tone>('soft')
  const [lang, setLang] = useState<string>(i18n.resolvedLanguage ?? 'ru')
  const [link, setLink] = useState<string | null>(null)
  const [withRequisites, setWithRequisites] = useState(false)
  const [edited, setEdited] = useState<string | null>(null)

  const client = useQuery({
    queryKey: ['ws', workspaceId, 'clients', order.client.id],
    queryFn: () => clientsApi.get(workspaceId, order.client.id),
  })
  const requisites = useQuery({
    queryKey: ['ws', workspaceId, 'requisites'],
    queryFn: () => orderExtrasApi.requisites(workspaceId),
    enabled: withRequisites,
  })
  const share = useMutation({
    mutationFn: () => orderExtrasApi.createShare(workspaceId, order.id),
    onSuccess: (r) => {
      setLink(r.url)
      setEdited(null)
    },
    onError: () => toast.error(t('collect.linkFailed')),
  })

  const generated = useMemo(() => {
    const ft = i18n.getFixedT(lang)
    const locale = LOCALES[lang as keyof typeof LOCALES] ?? 'ru-RU'
    const amount = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: order.currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(order.balance) ? 0 : 2,
    }).format(order.balance)
    let due = ''
    if (order.deadline) {
      const [y, m, d] = order.deadline.split('-').map(Number)
      const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
      due = ft(order.overdue ? 'remind.dueWas' : 'remind.dueBy', { date })
    }
    const parts = [
      ft(`remind.${tone}`, { name: order.client.name, number: order.orderNumber, title: order.title, amount, due, interpolation: { escapeValue: false } }),
    ]
    const r = requisites.data
    if (withRequisites && r && (r.iban || r.bin)) {
      parts.push(
        [ft('remind.requisites'), r.legalName, r.bin ? `${ft('requisites.bin')} ${r.bin}` : null, r.bankName, r.iban ? `IBAN ${r.iban}` : null, r.bik ? `${ft('requisites.bik')} ${r.bik}` : null]
          .filter(Boolean)
          .join('\n'),
      )
    }
    if (link) parts.push(ft('remind.link', { url: link, interpolation: { escapeValue: false } }))
    parts.push(`— ${workspaceName}`)
    return parts.join('\n\n')
  }, [lang, tone, order, link, withRequisites, requisites.data, workspaceName])

  const text = edited ?? generated
  const phone = whatsappNumber(client.data?.client.phone)
  const email = client.data?.client.email ?? ''
  const subject = i18n.getFixedT(lang)('remind.subject', { number: order.orderNumber })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('collect.copied'))
    } catch {
      toast.error(t('collect.copyFailed'))
    }
  }

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
    )

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('collect.dialogTitle', { name: order.client.name })}</DialogTitle>
        <DialogDescription>
          <span className="font-mono" translate="no">{order.orderNumber}</span> · {t('collect.balance')} {formatMoney(order.balance, order.currency)}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('collect.tone')}>
          <span className="cf-eyebrow mr-1 w-full sm:w-auto">{t('collect.tone')}</span>
          {TONES.map((x) => (
            <button key={x} type="button" aria-pressed={tone === x} className={pill(tone === x)} onClick={() => { setTone(x); setEdited(null) }}>
              {t(`collect.tones.${x}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('collect.language')}>
          <span className="cf-eyebrow mr-1 w-full sm:w-auto">{t('collect.language')}</span>
          {SUPPORTED_LANGUAGES.map((x) => (
            <button key={x} type="button" aria-pressed={lang === x} className={cn(pill(lang === x), 'font-mono')} onClick={() => { setLang(x); setEdited(null) }}>
              {t(`language.${x}`)}
            </button>
          ))}
        </div>

        <Textarea
          value={text}
          onChange={(e) => setEdited(e.target.value)}
          rows={8}
          className="resize-y text-sm leading-relaxed"
          aria-label={t('collect.message')}
        />

        <div className="flex flex-wrap gap-2">
          {canManageRecords || order.canEdit ? (
            <Button type="button" size="sm" variant="ghost" disabled={share.isPending || link !== null} onClick={() => share.mutate()}>
              <Link2 />
              {link ? t('collect.linkAdded') : t('collect.addLink')}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" aria-pressed={withRequisites} onClick={() => { setWithRequisites((v) => !v); setEdited(null) }}>
            <span className={cn('size-2 rounded-full border border-current', withRequisites && 'bg-current')} aria-hidden />
            {t('collect.addRequisites')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" onClick={copy}>
          <Copy />
          {t('collect.copy')}
        </Button>
        {phone ? (
          <Button asChild variant="outline">
            <a href={whatsappUrl(phone, text)} target="_blank" rel="noreferrer">
              <MessageCircle />
              WhatsApp
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <a href={`https://t.me/share/url?url=${encodeURIComponent(link ?? '')}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <Send />
            Telegram
          </a>
        </Button>
        {email ? (
          <Button asChild variant="outline">
            <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>
              <Mail />
              Email
            </a>
          </Button>
        ) : null}
      </div>
      {!phone && client.data ? <p className="text-xs text-muted-foreground">{t('collect.noPhone')}</p> : null}
    </DialogContent>
  )
}
