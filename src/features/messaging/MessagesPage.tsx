import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Send, MessagesSquare, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import {
  fetchConversations, fetchMessages, markConversationRead, sendMessage,
} from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from '@/components/ui/Toast'
import { clockTime, dayLabel, sameDay } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import type { Message, Profile } from '@/types/models'

export function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const userId = useAuth((s) => s.userId)!
  const navigate = useNavigate()

  const convos = useAsync(() => fetchConversations(userId), [userId])
  const active = (convos.data ?? []).find((c) => c.id === conversationId) ?? null

  // A new message anywhere refreshes the list, so unread counts and ordering stay honest.
  useEffect(() => {
    const channel = supabase
      .channel('conversation-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
        void convos.reload(),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 lg:h-[calc(100dvh-11rem)]">
      <aside className={cn('block-card overflow-hidden flex flex-col', conversationId && 'hidden lg:flex')}>
        <div className="px-4 py-3 border-b-2 border-line">
          <h1 className="text-lg font-display font-bold">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convos.loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
            </div>
          ) : convos.data?.length ? (
            <ul className="divide-y-2 divide-line">
              {convos.data.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate(`/messages/${c.id}`)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-paper-deep transition-colors',
                      c.id === conversationId && 'bg-indigo-50',
                    )}
                  >
                    <Avatar name={c.other?.display_name} src={c.other?.avatar_url} id={c.other?.id} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{c.other?.display_name}</span>
                        {c.unread > 0 && (
                          <span className="ml-auto grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-clay-500 text-white text-[10px] font-bold">
                            {c.unread}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-faint truncate">
                        {c.last?.body ?? 'No messages yet'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={MessagesSquare}
                title="No conversations"
                body="Open someone's profile and say hello — no booking required."
                className="border-none shadow-none"
              />
            </div>
          )}
        </div>
      </aside>

      <section className={cn('block-card overflow-hidden flex flex-col min-h-[60vh]', !conversationId && 'hidden lg:flex')}>
        {active ? (
          <Thread conversationId={active.id} other={active.other} onRead={() => void convos.reload()} />
        ) : (
          <div className="flex-1 grid place-items-center p-8">
            <EmptyState
              icon={MessagesSquare}
              title="Pick a conversation"
              body="Ask about a time, propose a swap, or just check they teach absolute beginners."
              className="border-none shadow-none"
            />
          </div>
        )}
      </section>
    </div>
  )
}

function Thread({
  conversationId,
  other,
  onRead,
}: {
  conversationId: string
  other: Profile
  onRead: () => void
}) {
  const userId = useAuth((s) => s.userId)!
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void fetchMessages(conversationId).then((rows) => {
      if (!alive) return
      setMessages(rows)
      setLoading(false)
      void markConversationRead(conversationId, userId).then(onRead)
    })

    // RLS applies to realtime too — if this ever goes silent, suspect the policy.
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          if (m.sender_id !== userId) void markConversationRead(conversationId, userId).then(onRead)
        },
      )
      .subscribe()

    return () => { alive = false; void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setDraft('')
    try {
      await sendMessage(conversationId, userId, body)
    } catch (err) {
      setDraft(body)
      toast.error(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b-2 border-line">
        <Link to="/messages" className="lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Link to={`/u/${other.id}`} className="flex items-center gap-3 min-w-0 group">
          <Avatar name={other.display_name} src={other.avatar_url} id={other.id} size="sm" />
          <span className="min-w-0">
            <span className="block font-semibold text-sm truncate group-hover:underline underline-offset-2">
              {other.display_name}
            </span>
            <span className="block text-xs text-ink-faint truncate">{other.city ?? 'Online'}</span>
          </span>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-10 w-1/2 ml-auto" /></div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-ink-faint py-8">
            Say hello. Most sessions start with a question about timing.
          </p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === userId
            const showDay = i === 0 || !sameDay(m.created_at, messages[i - 1].created_at)
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint py-3">
                    {dayLabel(m.created_at)}
                  </p>
                )}
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[78%] px-3 py-2 rounded-[14px] border-2 text-sm',
                      mine
                        ? 'bg-indigo-500 text-white border-indigo-700 rounded-br-[4px]'
                        : 'bg-white border-line-strong rounded-bl-[4px]',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn('text-[10px] mt-1', mine ? 'text-indigo-100' : 'text-ink-faint')}>
                      {clockTime(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3 border-t-2 border-line">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${other.display_name.split(' ')[0]}…`}
          maxLength={4000}
          aria-label="Message"
        />
        <Button type="submit" size="icon" loading={sending} aria-label="Send">
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </>
  )
}
