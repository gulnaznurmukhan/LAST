import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { MessagePurpose } from '@/features/ai/api'
import type { Order } from '@/features/orders/api'
import { whatsappNumber } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { WhatsAppDialog, type WhatsAppClient } from './whatsapp-dialog'

interface Props {
  client: WhatsAppClient
  order?: Order
  purpose?: MessagePurpose
  /** "icon": a compact round button for table rows. */
  variant?: 'button' | 'icon'
  className?: string
}

export function WhatsAppButton({ client, order, purpose, variant = 'button', className }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hasPhone = whatsappNumber(client.phone) !== null

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('wa.write', { name: client.name })}
          title={t('wa.write', { name: client.name })}
          className={cn('text-[#1fa855] hover:bg-[#1fa855]/10 hover:text-[#1fa855]', !hasPhone && 'opacity-40', className)}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          <MessageCircle />
        </Button>
      ) : (
        <Button type="button" className={cn('cf-wa', className)} onClick={() => setOpen(true)}>
          <MessageCircle />
          WhatsApp
        </Button>
      )}
      <WhatsAppDialog open={open} onOpenChange={setOpen} client={client} order={order} purpose={purpose} />
    </>
  )
}
