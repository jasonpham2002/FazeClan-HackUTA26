import type { Rate } from '../api/types'

export const EM_DASH = '—'

/** A rate with a zero denominator is unavailable, never 0%. */
export function formatRate(rate: Rate): string {
  if (!(rate.denominator > 0)) return EM_DASH
  return `${Math.round((rate.numerator / rate.denominator) * 100)}%`
}

/** e.g. describeRate(rate, 'attempted calls', 'connected') -> "3 of 4 attempted calls connected" */
export function describeRate(rate: Rate, denominatorLabel: string, outcome: string): string {
  if (!(rate.denominator > 0)) return `Not available: no ${denominatorLabel} yet`
  return `${rate.numerator} of ${rate.denominator} ${denominatorLabel} ${outcome}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return EM_DASH
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

/** Elapsed time between two UTC ISO timestamps as "m:ss", for transcript lines. */
export function formatOffset(startIso: string, iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.parse(startIso)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return EM_DASH
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Shows a UTC ISO timestamp in the viewer's locale; pass a timezone to pin it and label it. */
export function formatDateTime(iso: string | null, timeZone?: string): string {
  if (!iso) return EM_DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EM_DASH
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date) + (timeZone ? ` (${timeZone})` : '')
}

function partsInZone(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const out: Record<string, number> = {}
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value)
  return out
}

/** UTC ISO -> "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`, for datetime-local inputs. */
export function utcIsoToZonedLocal(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const p = partsInZone(date, timeZone)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone` -> UTC ISO, or null if unparseable. */
export function zonedLocalToUtcIso(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!match) return null
  const [y, mo, d, h, mi] = match.slice(1).map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (utcMs: number) => {
    const p = partsInZone(new Date(utcMs), timeZone)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs
  }
  let utc = wall - offsetAt(wall)
  utc = wall - offsetAt(utc) // second pass settles daylight-saving boundaries
  return new Date(utc).toISOString()
}
