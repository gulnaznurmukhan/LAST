import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { ApiErrorAlert } from '@/components/api-error-alert'
import { EmptyState, ListSkeleton, PageHeader, PaginationBar, TableFrame, Page } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WhatsAppButton } from '@/features/whatsapp/whatsapp-button'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDateTime } from '@/lib/format'
import { clientsApi, type ClientListParams } from './api'
import { ClientFormDialog } from './client-form-dialog'
import { ImportClientsDialog } from './import-dialog'

type SortOption = 'NAME:ASC' | 'CREATED_AT:DESC' | 'UPDATED_AT:DESC'

export function ClientsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId, canManageRecords } = useWorkspace()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<NonNullable<ClientListParams['status']>>('ACTIVE')
  const [sort, setSort] = useState<SortOption>('NAME:ASC')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const debouncedSearch = useDebouncedValue(search)

  const [sortField, direction] = sort.split(':') as [ClientListParams['sort'], ClientListParams['direction']]
  const params: ClientListParams = { search: debouncedSearch, status, sort: sortField, direction, page, size: 20 }
  const clients = useQuery({
    queryKey: ['ws', workspaceId, 'clients', 'list', params],
    queryFn: () => clientsApi.list(workspaceId, params),
    placeholderData: keepPreviousData,
  })

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }

  return (
    <Page>
      <PageHeader
        title={t('clients.title')}
        actions={
          canManageRecords ? (
            <>
              <ImportClientsDialog />
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('clients.new')}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            className="pl-9"
            placeholder={t('clients.searchPlaceholder')}
            aria-label={t('common.search')}
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={resetPage((v: string) => setStatus(v as typeof status))}>
          <SelectTrigger className="w-40" aria-label={t('orders.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
            <SelectItem value="ARCHIVED">{t('common.archived')}</SelectItem>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={resetPage((v: string) => setSort(v as SortOption))}>
          <SelectTrigger className="w-48" aria-label={t('common.sortBy')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NAME:ASC">{t('clients.name')}</SelectItem>
            <SelectItem value="CREATED_AT:DESC">{t('common.createdAt')}</SelectItem>
            <SelectItem value="UPDATED_AT:DESC">{t('common.updatedAt')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ApiErrorAlert error={clients.error} />
      {clients.isPending ? (
        <ListSkeleton />
      ) : clients.data && clients.data.totalItems === 0 ? (
        <EmptyState
          icon={Users}
          title={debouncedSearch || status !== 'ACTIVE' ? t('common.noResults') : t('clients.empty')}
          hint={debouncedSearch || status !== 'ACTIVE' ? undefined : t('clients.emptyHint')}
          action={
            canManageRecords && !debouncedSearch && status === 'ACTIVE' ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('clients.new')}
              </Button>
            ) : null
          }
        />
      ) : clients.data ? (
        <>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('clients.name')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('clients.company')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('clients.email')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('clients.phone')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('common.updatedAt')}</TableHead>
                  <TableHead className="w-10"><span className="sr-only">WhatsApp</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link to={`/clients/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      {c.archived ? (
                        <Badge variant="outline" className="ml-2">
                          {t('common.archived')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{c.company ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.email ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{c.phone ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDateTime(c.updatedAt)}
                    </TableCell>
                    <TableCell className="w-10 py-1 text-right">
                      {c.phone ? <WhatsAppButton variant="icon" client={c} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <PaginationBar page={page} totalPages={clients.data.totalPages} onChange={setPage} />
        </>
      ) : null}

      <ClientFormDialog open={creating} onOpenChange={setCreating} onSaved={(c) => navigate(`/clients/${c.id}`)} />
    </Page>
  )
}
