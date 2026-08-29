import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { Profile } from '@/types/models'
import { cn } from '@/lib/utils'

export function PersonRow({
  person,
  subtitle,
  size = 'md',
  className,
}: {
  person: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'city'>
  subtitle?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Link to={`/u/${person.id}`} className={cn('flex items-center gap-3 group min-w-0', className)}>
      <Avatar
        name={person.display_name}
        src={person.avatar_url}
        id={person.id}
        size={size === 'sm' ? 'sm' : 'md'}
      />
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate group-hover:underline underline-offset-2">
          {person.display_name}
        </p>
        <p className="text-xs text-ink-faint truncate flex items-center gap-1">
          {subtitle ?? (
            <>
              <MapPin className="size-3 shrink-0" aria-hidden />
              {person.city ?? 'Somewhere'}
            </>
          )}
        </p>
      </div>
    </Link>
  )
}
