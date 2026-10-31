import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useErrorMessage } from '@/components/api-error-alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/features/workspace/workspace-context'
import i18n from '@/i18n'
import { aiApi, useAiEnabled } from './api'
import { RichText } from './rich-text'

/** Dashboard card: the AI reads the workspace numbers and writes today's briefing. */
export function AiInsights() {
  const { t } = useTranslation()
  const enabled = useAiEnabled()
  const { workspaceId } = useWorkspace()
  const errorMessage = useErrorMessage()
  const [requested, setRequested] = useState(false)

  // Kept for the session: the briefing is generated on request, not on every visit
  const insights = useQuery({
    queryKey: ['ws', workspaceId, 'ai', 'insights', i18n.resolvedLanguage],
    queryFn: () => aiApi.insights(workspaceId),
    enabled: enabled && requested,
    staleTime: 30 * 60_000,
    retry: false,
  })

  if (!enabled) return null

  return (
    <section className="cf-sheet cf-ai-card mt-5 min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          <div>
            <span className="cf-eyebrow">{t('ai.insights.title')}</span>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('ai.insights.hint')}</p>
          </div>
        </div>
        {insights.data ? (
          <Button size="sm" variant="ghost" onClick={() => void insights.refetch()} disabled={insights.isFetching}>
            <RefreshCw className={insights.isFetching ? 'animate-spin' : undefined} />
            {t('ai.insights.refresh')}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 text-sm" aria-live="polite">
        {!requested ? (
          <Button onClick={() => setRequested(true)}>
            <Sparkles />
            {t('ai.insights.generate')}
          </Button>
        ) : insights.isPending || (insights.isFetching && !insights.data) ? (
          <div className="grid gap-2.5" aria-label={t('ai.thinking')}>
            {[92, 78, 85, 64].map((w) => (
              <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : insights.data ? (
          <RichText text={insights.data.text} className="text-foreground/85" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-destructive">{errorMessage(insights.error)}</p>
            <Button size="sm" variant="outline" onClick={() => void insights.refetch()}>
              {t('ai.retry')}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
