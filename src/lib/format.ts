import { format, formatDistanceToNowStrict, isToday, isTomorrow, isSameDay } from 'date-fns'

/** Everything is stored UTC and rendered in the viewer's own timezone. */
export function dayLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEE d MMM')
}

const lower = (s: string) => s.replace('AM', 'am').replace('PM', 'pm')

export function timeRange(startIso: string, endIso: string) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  // Keep the meridiem on the start time when it differs, so 11:00–12:00pm
  // cannot be read as an overnight session.
  const startFmt = format(s, 'a') === format(e, 'a') ? 'h:mm' : 'h:mma'
  return lower(`${format(s, startFmt)}–${format(e, 'h:mma')}`)
}

export function fullWhen(startIso: string, endIso: string) {
  return `${dayLabel(startIso)} · ${timeRange(startIso, endIso)}`
}

export function relative(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
}

export function sameDay(a: string, b: string) {
  return isSameDay(new Date(a), new Date(b))
}

export function clockTime(iso: string) {
  return lower(format(new Date(iso), 'h:mma'))
}
