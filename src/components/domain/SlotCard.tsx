import { useState } from 'react'
import { Video, MapPin, Clock, Repeat2, Coins } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PersonRow } from './PersonRow'
import { SkillPill } from './SkillPill'
import { BookSlotDialog } from '@/features/booking/BookSlotDialog'
import { dayLabel, timeRange } from '@/lib/format'
import type { SlotWithContext } from '@/types/models'
import { useAuth } from '@/stores/authStore'
import { cn } from '@/lib/utils'

export function SlotCard({
  slot,
  onChanged,
  hideTeacher,
  className,
}: {
  slot: SlotWithContext
  onChanged?: () => void
  hideTeacher?: boolean
  className?: string
}) {
  const userId = useAuth((s) => s.userId)
  const [open, setOpen] = useState(false)
  const mine = slot.teacher_id === userId

  return (
    <Card lift className={cn('flex flex-col', className)}>
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <SkillPill skill={slot.skill} />
          <Badge tone={slot.mode === 'online' ? 'indigo' : 'amber'}>
            {slot.mode === 'online' ? (
              <><Video className="size-3" aria-hidden /> Online</>
            ) : (
              <><MapPin className="size-3" aria-hidden /> In person</>
            )}
          </Badge>
        </div>

        <div className="flex items-baseline gap-2">
          <p className="font-display font-bold text-lg leading-none">{dayLabel(slot.starts_at!)}</p>
          <p className="text-sm text-ink-soft flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {timeRange(slot.starts_at!, slot.ends_at!)}
          </p>
        </div>

        {!hideTeacher && slot.teacher && (
          <PersonRow person={slot.teacher} size="sm" />
        )}
      </div>

      <div className="px-4 pb-4 flex items-center gap-2">
        {mine ? (
          <Badge tone="neutral" className="h-8 px-3">Your slot</Badge>
        ) : (
          <>
            <Button size="sm" className="flex-1" onClick={() => setOpen(true)}>
              <Coins className="size-3.5" aria-hidden /> Book
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label="Propose a swap">
              <Repeat2 className="size-3.5" aria-hidden /> Swap
            </Button>
          </>
        )}
      </div>

      {open && (
        <BookSlotDialog
          slot={slot}
          open={open}
          onOpenChange={setOpen}
          onDone={() => { setOpen(false); onChanged?.() }}
        />
      )}
    </Card>
  )
}
