import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { ApiErrorAlert } from '@/components/api-error-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { OrderDraft } from '@/features/ai/api'
import { OrderFromMessage } from '@/features/ai/order-from-message'
import { clientsApi } from '@/features/clients/api'
import { workspaceApi } from '@/features/workspace/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { ApiError } from '@/lib/api'
import { todayIso } from '@/lib/format'
import { CURRENCIES, ordersApi, type Order } from './api'
import { orderExtrasApi } from './extras-api'

const NONE = 'none'

const orderSchema = z.object({
  clientId: z.string().min(1, 'validation.required'),
  title: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  description: z.string().trim().max(5000, 'validation.tooLong'),
  // Kept as text: the backend parses it into BigDecimal, the browser never does money math
  totalAmount: z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.').replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'validation.amount').refine((v) => Number(v) > 0, 'validation.amount')),
  currency: z.enum(CURRENCIES),
  deadline: z.string(),
  assignedUserId: z.string(),
})
type OrderFormInput = z.input<typeof orderSchema>
type OrderValues = z.output<typeof orderSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order
  defaultClientId?: string
}

export function OrderFormDialog({ open, onOpenChange, order, defaultClientId }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId } = useWorkspace()
  const queryClient = useQueryClient()

  const clients = useQuery({
    queryKey: ['ws', workspaceId, 'clients', 'list', 'for-order'],
    queryFn: () => clientsApi.list(workspaceId, { status: 'ACTIVE', sort: 'NAME', direction: 'ASC', size: 100 }),
    enabled: open && !order,
  })
  const items = useQuery({
    queryKey: ['ws', workspaceId, 'orders', 'items', order?.id],
    queryFn: () => orderExtrasApi.items(workspaceId, order!.id),
    enabled: open && Boolean(order),
  })
  const managedByItems = (items.data?.items.length ?? 0) > 0
  const members = useQuery({
    queryKey: ['ws', workspaceId, 'members'],
    queryFn: () => workspaceApi.members(workspaceId),
    enabled: open,
  })

  const form = useForm<OrderFormInput, unknown, OrderValues>({
    resolver: zodResolver(orderSchema),
    values: {
      clientId: order?.client.id ?? defaultClientId ?? '',
      title: order?.title ?? '',
      description: order?.description ?? '',
      totalAmount: order ? String(order.totalAmount) : '',
      currency: (order?.currency as OrderValues['currency']) ?? 'KZT',
      deadline: order?.deadline ?? '',
      assignedUserId: order?.assignedUser?.id ?? NONE,
    },
  })
  const { errors, isSubmitting } = form.formState
  const err = (message?: string) => (message ? t(message) : undefined)

  const save = useMutation({
    mutationFn: (values: OrderValues) => {
      const input = {
        title: values.title,
        description: values.description,
        totalAmount: values.totalAmount,
        currency: values.currency,
        deadline: values.deadline || null,
        assignedUserId: values.assignedUserId === NONE ? null : values.assignedUserId,
      }
      return order
        ? ordersApi.update(workspaceId, order.id, { ...input, version: order.version })
        : ordersApi.create(workspaceId, { ...input, clientId: values.clientId })
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'orders'] })
      void queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'clients'] })
      toast.success(order ? t('orders.saved') : t('orders.created', { number: saved.orderNumber }))
      onOpenChange(false)
      if (!order) navigate(`/orders/${saved.id}`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'STALE_VERSION') {
        void queryClient.invalidateQueries({ queryKey: ['ws', workspaceId, 'orders'] })
      }
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync(values).catch(() => undefined)
  })

  const noClients = !order && clients.data?.totalItems === 0

  const applyDraft = (draft: OrderDraft, clientId: string | null) => {
    const set = (name: 'title' | 'description' | 'totalAmount' | 'deadline' | 'clientId', value: string | null) => {
      if (value) form.setValue(name, value, { shouldDirty: true })
    }
    set('clientId', clientId)
    set('title', draft.title)
    set('description', draft.description)
    set('totalAmount', draft.totalAmount)
    set('deadline', draft.deadline)
    const currency = CURRENCIES.find((c) => c === draft.currency)
    if (currency) form.setValue('currency', currency, { shouldDirty: true })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) save.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{order ? `${t('orders.editTitle')} ${order.orderNumber}` : t('orders.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <ApiErrorAlert error={save.error} />
          {order ? null : <OrderFromMessage onDraft={applyDraft} />}

          {order ? null : (
            <div className="grid gap-2">
              <Label htmlFor="order-client">{t('orders.client')}</Label>
              <Controller
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={noClients}>
                    <SelectTrigger id="order-client" className="w-full" aria-invalid={errors.clientId ? true : undefined}>
                      <SelectValue placeholder={t('orders.selectClient')} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.data?.items.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {noClients ? <p className="text-sm text-muted-foreground">{t('orders.noClients')}</p> : null}
              {errors.clientId?.message ? (
                <p className="text-sm text-destructive">{t(errors.clientId.message)}</p>
              ) : null}
            </div>
          )}

          <FormField label={t('orders.orderTitle')} error={err(errors.title?.message)} {...form.register('title')} />
          <div className="grid gap-2">
            <Label htmlFor="order-description">{t('orders.description')}</Label>
            <Textarea id="order-description" rows={3} {...form.register('description')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <FormField
              label={t('orders.amount')}
              inputMode="decimal"
              autoComplete="off"
              readOnly={managedByItems}
              hint={managedByItems ? t('items.managedTotal') : undefined}
              error={err(errors.totalAmount?.message)}
              {...form.register('totalAmount')}
            />
            <div className="grid gap-2">
              <Label htmlFor="order-currency">{t('orders.currency')}</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={managedByItems}>
                    <SelectTrigger id="order-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={`${t('orders.deadline')} (${t('common.optional')})`}
              type="date"
              min={order?.deadline && order.deadline < todayIso() ? undefined : todayIso()}
              error={err(errors.deadline?.message)}
              {...form.register('deadline')}
            />
            <div className="grid gap-2">
              <Label htmlFor="order-assignee">{t('orders.assignee')}</Label>
              <Controller
                control={form.control}
                name="assignedUserId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="order-assignee" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('orders.unassigned')}</SelectItem>
                      {members.data?.members.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || noClients}>
              {t(order ? 'common.save' : 'common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
