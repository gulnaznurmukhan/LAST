import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowLeft, FileText, PackageX, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { ActivityList } from '@/components/activity-list'
import { ApiErrorAlert } from '@/components/api-error-alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState, Field, ListSkeleton, PageHeader, Page } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { MessagePurpose } from '@/features/ai/api'
import { clientsApi } from '@/features/clients/api'
import { PaymentsCard } from '@/features/payments/payments-card'
import { WhatsAppButton } from '@/features/whatsapp/whatsapp-button'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useErrorToast } from '@/hooks/use-api-toast'
import { ApiError } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { ordersApi, type Order } from './api'
import { ItemsCard } from './items-card'
import { OrderFormDialog } from './order-form-dialog'
import { ShareLinkCard } from './share-link-card'
import { OrderStatusBadge, OverdueBadge } from './order-status-badge'
import { useOrderActions } from './use-order-actions'

function NotesSection({ orderId }: { orderId: string }) {
  const { t } = useTranslation()
  const { workspaceId } = useWorkspace()
  const queryClient = useQueryClient()
  const showError = useErrorToast()
  const [body, setBody] = useState('')

  const notes = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'notes', orderId],
    queryFn: () => ordersApi.notes(workspaceId, orderId),
  })
  const add = useMutation({
    mutationFn: () => ordersApi.addNote(workspaceId, orderId, body.trim()),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'orders'] })
    },
    onError: showError,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('notes.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notes.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t('notes.empty')}</p> : null}
        <ul className="grid gap-3">
          {notes.data?.map((note) => (
            <li key={note.id} className="rounded-md bg-muted/50 p-3">
              <p className="text-sm whitespace-pre-line">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.author?.name ?? t('common.deletedUser')} · {formatDateTime(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) add.mutate()
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={t('notes.placeholder')}
            aria-label={t('notes.placeholder')}
          />
          <Button type="submit" size="sm" className="justify-self-end" disabled={!body.trim() || add.isPending}>
            {t('notes.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** What the client most likely needs to hear about this order right now. */
function suggestedPurpose(o: Order): MessagePurpose {
  if (o.status === 'NEW' || o.status === 'CONFIRMED') return o.overdue && o.balance > 0 ? 'PAYMENT_REMINDER' : 'ORDER_CONFIRMED'
  if (o.status === 'IN_PROGRESS') return 'ORDER_READY'
  if (o.status === 'COMPLETED') return o.balance > 0 ? 'PAYMENT_REMINDER' : 'REVIEW_REQUEST'
  return 'CUSTOM'
}

export function OrderDetailPage() {
  const { t } = useTranslation()
  const { orderId = '' } = useParams()
  const { workspaceId, canManageRecords } = useWorkspace()
  const { changeStatus, archive, restore } = useOrderActions()
  const [editing, setEditing] = useState(false)

  const order = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'detail', orderId],
    queryFn: () => ordersApi.get(workspaceId, orderId),
  })
  const history = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'activity', orderId],
    queryFn: () => ordersApi.activity(workspaceId, orderId),
    enabled: order.isSuccess,
  })
  const clientId = order.data?.client.id
  const client = useQuery({
    queryKey: ['ws', workspaceId, 'clients', 'detail', clientId],
    queryFn: () => clientsApi.get(workspaceId, clientId!),
    enabled: Boolean(clientId),
  })

  if (order.isPending) return <ListSkeleton rows={6} />
  if (order.error instanceof ApiError && order.error.status === 404) {
    return (
      <EmptyState
        icon={PackageX}
        title={t('orders.notFound')}
        action={
          <Button asChild variant="outline">
            <Link to="/orders">{t('orders.back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!order.data) return <ApiErrorAlert error={order.error} />

  const o = order.data
  const finished = o.status === 'COMPLETED' || o.status === 'CANCELLED'
  const busy = changeStatus.isPending || archive.isPending || restore.isPending

  return (
    <Page>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/orders">
          <ArrowLeft />
          {t('orders.back')}
        </Link>
      </Button>
      <PageHeader
        title={o.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono" translate="no">{o.orderNumber}</span>
            <OrderStatusBadge status={o.status} />
            {o.overdue ? <OverdueBadge /> : null}
            {o.archived ? <Badge variant="outline">{t('common.archived')}</Badge> : null}
          </span>
        }
        actions={
          <>
            {client.data && !o.archived ? (
              <WhatsAppButton client={client.data.client} order={o} purpose={suggestedPurpose(o)} />
            ) : null}
            {o.allowedTransitions.map((status) =>
              status === 'CANCELLED' ? (
                <ConfirmDialog
                  key={status}
                  trigger={
                    <Button variant="outline" disabled={busy}>
                      {t('transition.CANCELLED')}
                    </Button>
                  }
                  title={`${t('transition.CANCELLED')}?`}
                  description={`${o.orderNumber} — ${o.title}`}
                  confirmLabel={t('transition.CANCELLED')}
                  destructive
                  onConfirm={() => changeStatus.mutate({ order: o, status })}
                />
              ) : (
                <Button key={status} disabled={busy} onClick={() => changeStatus.mutate({ order: o, status })}>
                  {t(`transition.${status}`)}
                </Button>
              ),
            )}
            {o.status !== 'CANCELLED' ? (
              <Button asChild variant="outline">
                <Link to={`/orders/${o.id}/invoice`}>
                  <FileText />
                  {t('invoice.open')}
                </Link>
              </Button>
            ) : null}
            {o.canEdit ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t('common.edit')}
              </Button>
            ) : null}
            {canManageRecords && finished && !o.archived ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={busy}>
                    <Archive />
                    {t('common.archive')}
                  </Button>
                }
                title={t('orders.archiveTitle')}
                description={t('orders.archiveText')}
                confirmLabel={t('common.archive')}
                onConfirm={() => archive.mutate(o)}
              />
            ) : null}
            {canManageRecords && o.archived ? (
              <Button variant="outline" disabled={busy} onClick={() => restore.mutate(o)}>
                <ArchiveRestore />
                {t('common.restore')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('common.details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label={t('orders.client')}>
                  <Link to={`/clients/${o.client.id}`} className="hover:underline">
                    {o.client.name}
                  </Link>
                </Field>
                <Field label={t('orders.amount')}>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(o.totalAmount, o.currency)}</span>
                </Field>
                <Field label={t('orders.deadline')}>
                  {o.deadline ? formatDate(o.deadline) : t('orders.noDeadline')}
                </Field>
                <Field label={t('orders.assignee')}>{o.assignedUser?.name ?? t('orders.unassigned')}</Field>
                <Field label={t('common.createdAt')}>{formatDateTime(o.createdAt)}</Field>
                <Field label={t('common.updatedAt')}>{formatDateTime(o.updatedAt)}</Field>
                <div className="sm:col-span-2">
                  <Field label={t('orders.description')}>
                    {o.description ? <span className="whitespace-pre-line">{o.description}</span> : null}
                  </Field>
                </div>
              </dl>
              {finished && canManageRecords ? (
                <p className="mt-4 text-sm text-muted-foreground">{t('orders.readOnly')}</p>
              ) : null}
            </CardContent>
          </Card>
          <ItemsCard order={o} />
          <PaymentsCard orderId={o.id} />
          <NotesSection orderId={o.id} />
        </div>

        <div className="grid h-fit gap-6">
          {canManageRecords ? <ShareLinkCard orderId={o.id} /> : null}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t('activity.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {history.data ? <ActivityList items={history.data.items} /> : <ListSkeleton rows={3} />}
            </CardContent>
          </Card>
        </div>
      </div>

      {o.canEdit ? <OrderFormDialog open={editing} onOpenChange={setEditing} order={o} /> : null}
    </Page>
  )
}
