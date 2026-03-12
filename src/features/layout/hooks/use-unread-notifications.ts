import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/context/auth-context'
import { supabase } from '@/lib/supabase'

const UNREAD_NOTIFICATIONS_CACHE_KEY = 'contas.notifications.unread-count.v1'

export function useUnreadNotifications() {
  const { currentUser } = useAuth()
  const [unreadCount, setUnreadCount] = useState(() => {
    const raw = localStorage.getItem(UNREAD_NOTIFICATIONS_CACHE_KEY)
    if (!raw) return 0
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  })

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }

    let cancelled = false

    const loadUnreadCount = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)

      if (cancelled || error) return
      const next = count ?? 0
      setUnreadCount(next)
      localStorage.setItem(UNREAD_NOTIFICATIONS_CACHE_KEY, String(next))
    }

    void loadUnreadCount()
    const pollId = window.setInterval(() => {
      void loadUnreadCount()
    }, 15000)

    const channel = supabase
      .channel(`notifications-unread-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        () => {
          void loadUnreadCount()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      window.clearInterval(pollId)
      void supabase.removeChannel(channel)
    }
  }, [currentUser?.id])

  return { unreadCount }
}
