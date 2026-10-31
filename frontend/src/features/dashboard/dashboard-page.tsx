import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Clock } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ActivityList } from '@/components/activity-list'
import { ApiErrorAlert } from '@/components/api-error-alert'
import { ListSkeleton, Page, PageHeader } from '@/components/page-parts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AiInsights } from '@/features/ai/ai-insights'
import { useCurrentUser } from '@/features/auth/use-auth'
import { OrderStatusBadge } from '@/features/orders/order-status-badge'
import { useWorkspace } from '@/features/workspace/workspace-context'
import i18n from '@/i18n'
import { formatDate, formatMoney, todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { reportsApi, type CurrencyAmount } from './api'
import { Receivables } from './receivables'
import { RevenueChart } from './revenue-chart'
import { StatusBarChart } from './status-bar-chart'

type Period = 'thisMonth' | 'last30' | 'thisYear'

function periodRange(period: Period): { from: string; to: string } {
  const to = todayIso()
  const now = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (period === 'thisMonth') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  if (period === 'thisYear') return { from: iso(new Date(now.getFullYear(), 0, 1)), to }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to }
}

function dayPart(hour: number) {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'day'
  return 'evening'
}

/** "Good evening, Aigerim · Thursday, 29 October" */
function Greeting() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const [now] = useState(() => new Date())
  const lng = i18n.resolvedLanguage
  const date = new Intl.DateTimeFormat(lng === 'kk' ? 'kk-KZ' : lng === 'en' ? 'en-US' : 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  const name = user?.fullName.split(/\s+/)[0] ?? ''
  return (
    <>
      {t(`dashboard.greeting.${dayPart(now.getHours())}`, { name })}
      <span className="mx-2 text-foreground/20" aria-hidden>/</span>
      <span className="inline-block first-letter:uppercase">{date}</span>
    </>
  )
}

const delay = (i: number) => ({ '--cf-i': i }) as CSSProperties

/*
 * The dashboard is three sheets, not a wall of tiles:
 *   1. one ledger strip with the four counts side by side,
 *   2. the money sheet: received / outstanding figures over the revenue columns,
 *   3. the work sheet: orders by status and the nearest deadlines,
 * then the money still to collect (with payment reminders) and the team activity.
 */

/** One figure in the ledger strip. */
function Figure({ label, value, to, tone, index }: {
  label: string
  value: number
  to?: string
  tone?: 'warning'
  index: number
}) {
  const warn = tone === 'warning' && value > 0
  const body = (
    <>
      <span className="cf-eyebrow flex items-center gap-1.5">
        {label}
        {to ? <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /> : null}
      </span>
      <span className={cn('cf-num mt-2 block font-mono text-[2.4rem] leading-none font-medium tracking-[-0.04em] tabular-nums', warn && 'text-destructive')}>
        {value}
      </span>
    </>
  )
  const cls = 'group block px-5 py-5 outline-none sm:px-6 focus-visible:ring-2 focus-visible:ring-ring'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:bg-muted/60')} style={delay(index)}>{body}</Link>
  ) : (
    <div className={cls} style={delay(index)}>{body}</div>
  )
}

/** Money figures: one line per currency (amounts in different currencies are never added up). */
function Money({ title, items, countKey, action }: {
  title: string
  items: CurrencyAmount[]
  countKey: string
  action?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="cf-eyebrow">{title}</span>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 font-mono text-2xl text-muted-foreground">{t('dashboard.nothing')}</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {items.map((item) => (
            <li key={item.currency} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="cf-num font-mono text-[1.75rem] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[2rem]">
                {formatMoney(item.amount, item.currency)}
              </span>
              <span className="text-sm text-muted-foreground">{t(countKey, { count: item.count })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { workspaceId } = useWorkspace()
  const [period, setPeriod] = useState<Period>('thisMonth')
  const range = periodRange(period)

  const dashboard = useQuery({
    queryKey: ['ws', workspaceId, 'dashboard', range],
    queryFn: () => reportsApi.dashboard(workspaceId, range.from, range.to),
    placeholderData: keepPreviousData,
  })

  if (dashboard.isPending) return <ListSkeleton rows={8} />
  if (!dashboard.data) return <ApiErrorAlert error={dashboard.error} />
  const d = dashboard.data

  return (
    <Page>
      <PageHeader
        title={t('dashboard.title')}
        description={
          <>
            <Greeting />
            {d.onlyAssignedOrders ? <span className="block">{t('dashboard.onlyAssigned')}</span> : null}
          </>
        }
      />

      {/* 1. ledger strip */}
      <section className="cf-sheet cf-stagger grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-foreground/8 [&>*+*]:border-t sm:[&>*:nth-child(2n)]:border-l sm:[&>*:nth-child(-n+2)]:border-t-0 xl:[&>*]:border-t-0 xl:[&>*+*]:border-l">
        <Figure index={0} label={t('dashboard.clients')} value={d.totalClients} to="/clients" />
        <Figure index={1} label={t('dashboard.activeOrders')} value={d.activeOrders} to="/orders" />
        <Figure index={2} label={t('dashboard.completedOrders')} value={d.completedOrders} />
        <Figure index={3} label={t('dashboard.overdueOrders')} value={d.overdueOrders} tone="warning" to="/orders" />
      </section>

      <AiInsights />

      <div className="cf-stagger mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* 2. money sheet */}
        <section className="cf-sheet min-w-0 p-5 sm:p-6" style={delay(4)}>
          <div className="grid gap-6 border-b border-foreground/8 pb-6 sm:grid-cols-2">
            <Money
              title={t('dashboard.paymentsReceived')}
              items={d.paymentsReceived}
              countKey="dashboard.paymentsCount"
              action={
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 border-0 bg-transparent px-1.5 font-mono text-[11px] tracking-wide shadow-none" aria-label={t('dashboard.period')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thisMonth">{t('dashboard.thisMonth')}</SelectItem>
                    <SelectItem value="last30">{t('dashboard.last30')}</SelectItem>
                    <SelectItem value="thisYear">{t('dashboard.thisYear')}</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            <Money title={t('dashboard.outstanding')} items={d.outstandingBalances} countKey="dashboard.ordersCount" />
          </div>
          <div className="pt-6">
            <RevenueChart />
          </div>
        </section>

        {/* 3. work sheet */}
        <section className="cf-sheet grid min-w-0 content-start" style={delay(5)}>
          <div className="p-5 sm:p-6">
            <span className="cf-eyebrow">{t('dashboard.byStatus')}</span>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('dashboard.byStatusHint')}</p>
            <StatusBarChart counts={d.ordersByStatus} />
          </div>
          <div className="border-t border-foreground/8 p-5 sm:p-6">
            <span className="cf-eyebrow flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden />
              {t('dashboard.upcoming')}
            </span>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">{t('dashboard.upcomingHint')}</p>
            {d.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>
            ) : (
              <ul className="cf-stagger -mx-2 grid">
                {d.upcomingDeadlines.map((o, i) => (
                  <li key={o.id} style={delay(i)}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="grid min-w-0 gap-1 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                        <span translate="no">{o.orderNumber}</span>
                        <span className="text-foreground tabular-nums">{formatDate(o.deadline)}</span>
                      </span>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{o.title}</span>
                        <OrderStatusBadge status={o.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Receivables />

      {d.recentActivity ? (
        <section className="cf-sheet cf-stagger mt-5 p-5 sm:p-6" style={delay(6)}>
          <span className="cf-eyebrow">{t('dashboard.recent')}</span>
          <div className="mt-4">
            <ActivityList items={d.recentActivity} />
          </div>
        </section>
      ) : null}
    </Page>
  )
}
