import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, UserX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiErrorAlert } from '@/components/api-error-alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState, Field, ListSkeleton, PageHeader, Page } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderFormDialog } from '@/features/orders/order-form-dialog'
import { OrdersTable } from '@/features/orders/orders-table'
import { WhatsAppButton } from '@/features/whatsapp/whatsapp-button'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useErrorToast } from '@/hooks/use-api-toast'
import { ApiError } from '@/lib/api'
import { clientsApi } from './api'
import { ClientFormDialog } from './client-form-dialog'

export function ClientDetailPage() {
  const { t } = useTranslation()
  const { clientId = '' } = useParams()
  const { workspaceId, canManageRecords } = useWorkspace()
  const queryClient = useQueryClient()
  const showError = useErrorToast()
  const [editing, setEditing] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)

  const details = useQuery({
    queryKey: ['ws', workspaceId, 'clients', 'detail', clientId],
    queryFn: () => clientsApi.get(workspaceId, clientId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'clients'] })
  const archive = useMutation({
    mutationFn: () => clientsApi.archive(workspaceId, clientId),
    onSuccess: () => {
      toast.success(t('clients.archivedToast'))
      void invalidate()
    },
    onError: showError,
  })
  const restore = useMutation({
    mutationFn: () => clientsApi.restore(workspaceId, clientId),
    onSuccess: () => {
      toast.success(t('clients.restoredToast'))
      void invalidate()
    },
    onError: showError,
  })

  if (details.isPending) return <ListSkeleton rows={6} />
  if (details.error instanceof ApiError && details.error.status === 404) {
    return (
      <EmptyState
        icon={UserX}
        title={t('clients.notFound')}
        action={
          <Button asChild variant="outline">
            <Link to="/clients">{t('clients.back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!details.data) return <ApiErrorAlert error={details.error} />

  const { client, totalOrders, activeOrders } = details.data

  return (
    <Page>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/clients">
          <ArrowLeft />
          {t('clients.back')}
        </Link>
      </Button>
      <PageHeader
        title={client.name}
        description={
          <>
            {client.company}
            {client.archived ? (
              <Badge variant="outline" className="ml-2">
                {t('common.archived')}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            {client.archived ? null : <WhatsAppButton client={client} />}
            {canManageRecords ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t('common.edit')}
              </Button>
              {client.archived ? (
                <Button variant="outline" onClick={() => restore.mutate()} disabled={restore.isPending}>
                  <ArchiveRestore />
                  {t('common.restore')}
                </Button>
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" disabled={archive.isPending}>
                      <Archive />
                      {t('common.archive')}
                    </Button>
                  }
                  title={t('clients.archiveTitle')}
                  description={t('clients.archiveText')}
                  confirmLabel={t('common.archive')}
                  onConfirm={() => archive.mutate()}
                />
              )}
            </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('clients.contact')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label={t('clients.email')}>
                {client.email ? <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a> : null}
              </Field>
              <Field label={t('clients.phone')}>
                {client.phone ? (
                  <span className="flex items-center gap-1">
                    <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>
                    <WhatsAppButton variant="icon" client={client} />
                  </span>
                ) : null}
              </Field>
              <Field label={t('clients.address')}>{client.address}</Field>
              <Field label={t('clients.notes')}>
                {client.notes ? <span className="whitespace-pre-line">{client.notes}</span> : null}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('clients.totalOrders')}>{totalOrders}</Field>
                <Field label={t('clients.activeOrders')}>{activeOrders}</Field>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('clients.orderHistory')}</h2>
            {canManageRecords && !client.archived ? (
              <Button size="sm" onClick={() => setCreatingOrder(true)}>
                <Plus />
                {t('orders.new')}
              </Button>
            ) : null}
          </div>
          <OrdersTable filters={{ clientId: client.id, archive: 'ALL' }} hideClient />
        </div>
      </div>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={client} />
      <OrderFormDialog open={creatingOrder} onOpenChange={setCreatingOrder} defaultClientId={client.id} />
    </Page>
  )
}
