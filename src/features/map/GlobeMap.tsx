import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Marker, Popup, NavigationControl, type MapRef } from 'react-map-gl/maplibre'
import { config as maplibreConfig, type Map as MapLibreMap } from 'maplibre-gl'
// maplibre resolves its tile worker at runtime by string, which no bundler can
// see, so the file never lands in the build and the globe renders with no map
// on it. Handing it a URL that Vite does emit is the whole fix.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Coins, MapPin, Repeat2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { dayLabel, timeRange } from '@/lib/format'
import type { MapPoint } from '@/types/models'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'

maplibreConfig.WORKER_URL = workerUrl

/** Free vector tiles, no API key and no card — one less thing to babysit while judging. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

export type Viewport = {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
  zoom: number
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Cluster cell size in degrees, chosen so two pins merge when they are within
 * roughly 50 screen pixels. It shrinks as you zoom, which is what makes a
 * cluster spider apart into individual sessions on the way in.
 */
const cellSize = (zoom: number) => 35.2 / 2 ** zoom

/**
 * OpenFreeMap's positron is grey on grey. Rather than fork a whole style, walk
 * the layers once on load and repaint the few that carry the most colour, so
 * the map sits in the same warm palette as the rest of the app.
 */
function recolour(map: MapLibreMap) {
  const paint: [RegExp, 'fill' | 'line', string][] = [
    [/water|ocean|sea/, 'fill', '#DAD7F6'],
    [/water|river|stream/, 'line', '#B6B0ED'],
    [/park|wood|grass|forest|landcover/, 'fill', '#DCEFE1'],
    [/building/, 'fill', '#EFE7DA'],
  ]
  for (const layer of map.getStyle().layers ?? []) {
    try {
      if (layer.id === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#FBF7F0')
        continue
      }
      const hit = paint.find(([re, type]) => layer.type === type && re.test(layer.id))
      if (hit) map.setPaintProperty(layer.id, `${hit[1]}-color`, hit[2])
    } catch {
      // A style we do not control may drop or rename a layer at any time. A
      // miss is cosmetic, never fatal.
    }
  }
}

type Cell = { key: string; lat: number; lng: number; points: MapPoint[] }

function groupByCell(points: MapPoint[], zoom: number): Cell[] {
  const size = cellSize(zoom)
  const cells = new Map<string, Cell>()
  for (const p of points) {
    const key = `${Math.floor(p.lat / size)}:${Math.floor(p.lng / size)}`
    const cell = cells.get(key)
    if (cell) cell.points.push(p)
    else cells.set(key, { key, lat: p.lat, lng: p.lng, points: [p] })
  }
  return [...cells.values()]
}

export function GlobeMap({
  points,
  loading,
  swapPartnerIds,
  initialCentre,
  focus,
  onViewportChange,
  onBook,
}: {
  points: MapPoint[]
  loading: boolean
  /** Teachers you already form a perfect swap with — their pins get the amber treatment. */
  swapPartnerIds: Set<string>
  initialCentre: { lat: number; lng: number } | null
  /** Imperative camera request from the page — "use my location", say. The
   *  nonce is what lets the same coordinates be requested twice. */
  focus: { lat: number; lng: number; zoom: number; nonce: number } | null
  onViewportChange: (v: Viewport) => void
  onBook: (point: MapPoint) => void
}) {
  const mapRef = useRef<MapRef>(null)
  const [zoom, setZoom] = useState(1.6)
  const [selected, setSelected] = useState<MapPoint | null>(null)
  const [loaded, setLoaded] = useState(false)
  const dived = useRef(false)

  const report = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const zoomNow = map.getZoom()
    const b = map.getBounds()
    // Pulled all the way back, the viewport is one hemisphere but the user is
    // looking at a globe they can spin. Ask for the whole world so the halos —
    // and the list under the map — cover both sides of it.
    const whole = zoomNow <= 2.5
    onViewportChange({
      minLat: whole ? -90 : b.getSouth(),
      minLng: whole ? -180 : b.getWest(),
      maxLat: whole ? 90 : b.getNorth(),
      maxLng: whole ? 180 : b.getEast(),
      zoom: zoomNow,
    })
  }, [onViewportChange])

  // One debounce for the whole gesture: a drag fires moveend once, but a
  // pinch-zoom on a trackpad fires it repeatedly.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedReport = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(report, 250)
  }, [report])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flyTo = useCallback((lat: number, lng: number, z: number) => {
    const map = mapRef.current
    if (!map) return
    if (prefersReducedMotion()) map.jumpTo({ center: [lng, lat], zoom: z })
    else map.flyTo({ center: [lng, lat], zoom: z, duration: 2200, curve: 1.6, essential: true })
  }, [])

  const onLoad = useCallback((e: { target: MapLibreMap }) => {
    recolour(e.target)
    setLoaded(true)
    report()
  }, [report])

  /**
   * The dive: open on the whole planet, then drop into the viewer's own city.
   * It waits for both the map and the profile, because on a cold load the
   * profile usually arrives second.
   */
  useEffect(() => {
    if (!loaded || !initialCentre || dived.current) return
    dived.current = true
    const t = setTimeout(() => flyTo(initialCentre.lat, initialCentre.lng, 10.5), 500)
    return () => clearTimeout(t)
  }, [loaded, initialCentre, flyTo])

  useEffect(() => {
    if (focus) flyTo(focus.lat, focus.lng, focus.zoom)
    // Only the nonce should retrigger the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  // Zooming out past the pin band leaves a popup floating over a globe with no
  // pin under it.
  useEffect(() => {
    if (zoom <= 6) setSelected(null)
  }, [zoom])

  const cells = useMemo(
    () => (zoom > 6 ? groupByCell(points, zoom) : []),
    [points, zoom],
  )

  // Sydney, Newtown, Bondi and Surry Hills are one pixel apart on a globe, so
  // the city halos get the same merge treatment the session pins get. The
  // busiest city in a cell gives the group its name.
  const cities = useMemo(() => {
    if (zoom > 6) return []
    return groupByCell(points, zoom).map((cell) => {
      const total = cell.points.reduce((n, p) => n + p.session_count, 0)
      const biggest = cell.points.reduce((a, b) => (b.session_count > a.session_count ? b : a))
      return { key: cell.key, lat: cell.lat, lng: cell.lng, total, label: biggest.label }
    })
  }, [points, zoom])

  return (
    <div
      className="relative rounded-[14px] border-2 border-line-strong shadow-block overflow-hidden bg-indigo-50"
      style={{ height: 'min(62vh, 560px)' }}
      // A WebGL canvas is invisible to a screen reader; the session list under
      // the map is the accessible path to exactly the same data.
      role="application"
      aria-label="Globe of in-person sessions. The same sessions are listed below the map."
    >
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: initialCentre?.lng ?? 20, latitude: initialCentre?.lat ?? 5, zoom: 1.6 }}
        projection="globe"
        mapStyle={STYLE_URL}
        minZoom={0.6}
        maxZoom={17}
        attributionControl={{ compact: true }}
        onLoad={onLoad}
        onMove={(e) => setZoom(e.viewState.zoom)}
        onMoveEnd={debouncedReport}
        onClick={() => setSelected(null)}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass visualizePitch={false} />

        {/* Zoom 0–6: one halo per city, pre-aggregated by the RPC. */}
        {cities.map((c) => (
          <Marker key={c.key} latitude={c.lat} longitude={c.lng} anchor="center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); flyTo(c.lat, c.lng, 11) }}
              className="group grid place-items-center"
              aria-label={`${c.total} sessions around ${c.label}. Zoom in.`}
            >
              <span className="absolute size-12 rounded-full bg-indigo-400/20 group-hover:bg-indigo-400/30" aria-hidden />
              <span className="relative flex items-center gap-1.5 px-2 py-1 rounded-[10px] bg-white border-2 border-indigo-500 shadow-block text-[12px] font-bold">
                <span className="tabular-nums">{c.total}</span>
                <span className="text-ink-soft font-semibold">{c.label}</span>
              </span>
            </button>
          </Marker>
        ))}

        {/* Zoom 6+: sessions, merged into a count where they would overlap. */}
        {cells.map((cell) =>
          cell.points.length > 1 ? (
            <Marker key={cell.key} latitude={cell.lat} longitude={cell.lng} anchor="center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); flyTo(cell.lat, cell.lng, Math.min(16, zoom + 2.5)) }}
                aria-label={`${cell.points.length} sessions here. Zoom in to see each one.`}
                className="flex items-center gap-1 px-2 h-8 rounded-[10px] bg-indigo-500 text-white border-2 border-indigo-700 shadow-block text-[13px] font-bold hover:bg-indigo-600"
              >
                <Users className="size-3.5" aria-hidden />
                <span className="tabular-nums">{cell.points.length}</span>
              </button>
            </Marker>
          ) : (
            <SessionPin
              key={cell.points[0].slot_id ?? cell.key}
              point={cell.points[0]}
              swap={!!cell.points[0].teacher_id && swapPartnerIds.has(cell.points[0].teacher_id)}
              selected={selected?.slot_id === cell.points[0].slot_id}
              labelled={zoom >= 12.5}
              onSelect={() => setSelected(cell.points[0])}
            />
          ),
        )}

        {selected && (
          <Popup
            latitude={selected.lat}
            longitude={selected.lng}
            offset={18}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setSelected(null)}
            maxWidth="280px"
          >
            <PinPopup
              point={selected}
              swap={!!selected.teacher_id && swapPartnerIds.has(selected.teacher_id)}
              onBook={() => onBook(selected)}
              onClose={() => setSelected(null)}
            />
          </Popup>
        )}
      </MapGL>

      <div className="absolute left-3 top-3 flex items-center gap-2 px-3 h-9 rounded-[10px] bg-white/95 border-2 border-line-strong shadow-block text-[13px] font-semibold">
        <MapPin className="size-3.5 text-indigo-500" aria-hidden />
        {loading ? (
          <span className="text-ink-soft">Looking around…</span>
        ) : (
          <span>
            {zoom <= 6
              ? `${points.reduce((n, p) => n + p.session_count, 0)} sessions in view`
              : `${points.length} session${points.length === 1 ? '' : 's'} in view`}
          </span>
        )}
      </div>
    </div>
  )
}

function SessionPin({
  point,
  swap,
  selected,
  labelled,
  onSelect,
}: {
  point: MapPoint
  swap: boolean
  selected: boolean
  labelled: boolean
  onSelect: () => void
}) {
  return (
    <Marker latitude={point.lat} longitude={point.lng} anchor="bottom">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        aria-label={`${point.skill_name} with ${point.teacher_name}, ${point.starts_at ? dayLabel(point.starts_at) : ''}. Open details.`}
        className={cn(
          'flex items-center gap-1 border-2 font-bold text-[12px] transition-transform',
          'shadow-[2px_2px_0_0_rgba(26,22,38,0.25)] hover:-translate-y-0.5',
          labelled ? 'px-2 h-7 rounded-[9px]' : 'size-5 rounded-[7px] justify-center',
          swap
            ? 'bg-amber-300 border-amber-500 text-ink'
            : 'bg-white border-indigo-500 text-indigo-700',
          selected && '-translate-y-0.5 ring-2 ring-indigo-400 ring-offset-1',
        )}
      >
        {swap && <Repeat2 className="size-3 shrink-0" aria-hidden />}
        {labelled ? (
          <span className="max-w-28 truncate">{point.skill_name}</span>
        ) : (
          !swap && <span className="size-1.5 rounded-[2px] bg-indigo-500" aria-hidden />
        )}
      </button>
    </Marker>
  )
}

function PinPopup({
  point,
  swap,
  onBook,
  onClose,
}: {
  point: MapPoint
  swap: boolean
  onBook: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        'w-64 rounded-[14px] border-2 bg-white shadow-block overflow-hidden font-sans',
        swap ? 'border-amber-500' : 'border-line-strong',
      )}
    >
      {swap && (
        <p className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border-b-2 border-amber-200 text-[12px] font-bold text-amber-600">
          <Repeat2 className="size-3.5" aria-hidden /> A perfect swap for you
        </p>
      )}
      <div className="p-3 space-y-3">
        <div>
          <h3 className="text-base leading-tight">{point.skill_name}</h3>
          {point.starts_at && point.ends_at && (
            <p className="text-[13px] text-ink-soft">
              {dayLabel(point.starts_at)} · {timeRange(point.starts_at, point.ends_at)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Avatar name={point.teacher_name} src={point.teacher_avatar} id={point.teacher_id ?? ''} size="sm" />
          <div className="min-w-0 text-[13px]">
            <p className="font-semibold truncate">{point.teacher_name}</p>
            <p className="text-ink-faint truncate">{point.label} · in person</p>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          <Coins className="size-3.5 text-amber-500" aria-hidden />
          One token, or swap a lesson back
        </p>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onBook}>Book</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <p className="text-[11px] text-ink-faint leading-snug">
          Pin is approximate. The exact meeting point is shared once the booking is confirmed.
        </p>
      </div>
    </div>
  )
}

export default GlobeMap
