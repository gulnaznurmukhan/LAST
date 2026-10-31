import { useQuery } from '@tanstack/react-query'

import i18n from '@/i18n'
import { apiFetch } from '@/lib/api'

export type MessagePurpose =
  | 'GREETING'
  | 'ORDER_CONFIRMED'
  | 'ORDER_READY'
  | 'PAYMENT_REMINDER'
  | 'THANK_YOU'
  | 'REVIEW_REQUEST'
  | 'CUSTOM'
export type MessageTone = 'FRIENDLY' | 'NEUTRAL' | 'FORMAL'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface OrderDraft {
  title: string | null
  description: string | null
  totalAmount: string | null
  currency: string | null
  deadline: string | null
  clientName: string | null
  clientPhone: string | null
  matchedClientId: string | null
}

const base = (ws: string) => `/workspaces/${ws}/ai`
const lang = () => i18n.resolvedLanguage ?? 'ru'
const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const aiApi = {
  status: () => apiFetch<{ enabled: boolean }>('/ai/status'),
  chat: (ws: string, messages: ChatMessage[]) =>
    post<{ text: string }>(`${base(ws)}/chat`, { messages, language: lang() }),
  insights: (ws: string) => post<{ text: string }>(`${base(ws)}/insights`, { language: lang() }),
  message: (
    ws: string,
    input: { clientId: string; orderId?: string; purpose: MessagePurpose; tone: MessageTone; language: string; instructions?: string },
  ) => post<{ text: string }>(`${base(ws)}/message`, input),
  parseOrder: (ws: string, text: string) => post<OrderDraft>(`${base(ws)}/parse-order`, { text, language: lang() }),
}

/** True when the server has a Gemini key; AI buttons are hidden otherwise. */
export function useAiEnabled() {
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status, staleTime: Infinity, retry: false })
  return status.data?.enabled ?? false
}
