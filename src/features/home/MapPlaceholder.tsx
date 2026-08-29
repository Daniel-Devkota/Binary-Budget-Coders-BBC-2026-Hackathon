import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

/**
 * Parked, but the schema already carries lat/lng on profiles and slots, so this
 * page becomes real without a migration.
 */
export function MapPlaceholder() {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <EmptyState
        icon={MapPin}
        title="The map is coming"
        body="In-person sessions already carry coordinates. When the map lands you will see who is teaching within walking distance — with locations blurred until a booking is confirmed."
        action={
          <Link to="/search">
            <Button variant="outline">Browse sessions instead</Button>
          </Link>
        }
      />
    </div>
  )
}
