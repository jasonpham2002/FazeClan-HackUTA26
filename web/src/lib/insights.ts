/*
 * Event insights: turnout, returning fans, drop-off and interview patterns,
 * plus plain rule-based suggestions for the next event.
 *
 * `buildInsights` turns flat per-application records into the report the
 * backend should return from GET /admin/insights; the fixture API uses it
 * directly. `eventSuggestions` / `retentionSuggestions` run in the browser on
 * that report, so the backend never has to implement the rules.
 *
 * Everything is group-level. Nothing here scores or labels an individual fan.
 */
import type {
  ApplicationStatus,
  Completeness,
  EventInsights,
  InsightsReport,
  QuestionInsight,
  RetentionCohort,
  RetentionSummary,
  Suggestion,
} from '../api/types'

export interface InsightsEventInput {
  id: string
  title: string
  startsAt: string
  timezone: string
  capacity: number
}

export interface InsightsApplicationInput {
  userId: string
  eventId: string
  status: ApplicationStatus
  /** At least one completed interview call. */
  interviewed: boolean
  /** Invited at some point, even if later waitlisted. */
  everInvited: boolean
  /** An attendance record exists for this fan at this event. */
  attended: boolean
  interests: string[]
  /** Empty when there is no structured interview result. */
  answers: { questionId: string; completeness: Completeness }[]
  /** Questions of the interview version this application is pinned to, in order. */
  questions: { id: string; prompt: string }[]
  isDemo: boolean
}

export interface InsightsSource {
  now: string
  events: InsightsEventInput[]
  applications: InsightsApplicationInput[]
}

/** Below this many people a percentage says little, so no suggestion is made from it. */
export const MIN_SAMPLE = 5
const TOP_INTERESTS = 8

export function buildInsights(source: InsightsSource): InsightsReport {
  const now = Date.parse(source.now)
  const startOf = new Map(source.events.map((event) => [event.id, Date.parse(event.startsAt)]))

  const eventsByFan = new Map<string, Set<string>>()
  for (const app of source.applications) {
    if (!startOf.has(app.eventId)) continue
    const set = eventsByFan.get(app.userId) ?? new Set<string>()
    set.add(app.eventId)
    eventsByFan.set(app.userId, set)
  }
  const fanEventStarts = (userId: string) => [...(eventsByFan.get(userId) ?? [])].map((id) => startOf.get(id)!)
  const appliedBefore = (userId: string, start: number) => fanEventStarts(userId).some((s) => s < start)
  const appliedAfter = (userId: string, start: number) => fanEventStarts(userId).some((s) => s > start)

  const newestFirst = [...source.events].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))

  const events = newestFirst.map((event): EventInsights => {
    const start = Date.parse(event.startsAt)
    const past = start <= now
    const apps = source.applications.filter((app) => app.eventId === event.id)
    const isInvited = (app: InsightsApplicationInput) =>
      app.everInvited || app.status === 'invited' || app.status === 'accepted'
    const interviewed = apps.filter((app) => app.interviewed)
    const invited = apps.filter(isInvited)
    const accepted = apps.filter((app) => app.status === 'accepted')
    const attended = apps.filter((app) => app.attended)
    const attendanceRecorded = past && attended.length > 0
    const returningFans = apps.filter((app) => appliedBefore(app.userId, start)).length

    return {
      event: { id: event.id, title: event.title, startsAt: event.startsAt, timezone: event.timezone, capacity: event.capacity },
      phase: past ? 'past' : 'upcoming',
      funnel: {
        applied: apps.length,
        interviewed: interviewed.length,
        invited: invited.length,
        accepted: accepted.length,
        attended: past ? attended.length : null,
      },
      attendanceRecorded,
      demand: { numerator: apps.length, denominator: event.capacity },
      showUp: attendanceRecorded ? { numerator: attended.length, denominator: accepted.length } : null,
      fill: attendanceRecorded ? { numerator: attended.length, denominator: event.capacity } : null,
      audience: { newFans: apps.length - returningFans, returningFans },
      dropOff: {
        noInterview: apps.length - interviewed.length,
        notInvited: interviewed.filter((app) => !isInvited(app)).length,
        invitedNotAccepted: invited.filter((app) => app.status !== 'accepted').length,
        acceptedNotAttended: attendanceRecorded ? accepted.filter((app) => !app.attended).length : null,
      },
      interests: countInterests(apps),
      questions: questionStats(apps),
    }
  })

  const cohorts: RetentionCohort[] = events
    .filter((item) => item.phase === 'past')
    .filter((item) => source.events.some((other) => Date.parse(other.startsAt) > Date.parse(item.event.startsAt)))
    .map((item) => {
      const start = Date.parse(item.event.startsAt)
      const attendees = source.applications.filter((app) => app.eventId === item.event.id && app.attended)
      return {
        eventId: item.event.id,
        title: item.event.title,
        startsAt: item.event.startsAt,
        attendees: attendees.length,
        cameBack: attendees.filter((app) => appliedAfter(app.userId, start)).length,
      }
    })

  const retention: RetentionSummary = {
    fans: eventsByFan.size,
    repeatFans: [...eventsByFan.values()].filter((set) => set.size >= 2).length,
    cohorts,
  }

  return {
    generatedAt: new Date(now).toISOString(),
    includesDemoData: source.applications.some((app) => app.isDemo),
    events,
    retention,
  }
}

function countInterests(apps: InsightsApplicationInput[]) {
  const tally = new Map<string, { label: string; count: number }>()
  for (const app of apps) {
    // Count each interest once per fan, however often they mentioned it.
    const seen = new Set<string>()
    for (const raw of app.interests) {
      const label = raw.trim()
      const key = label.toLowerCase()
      if (!label || seen.has(key)) continue
      seen.add(key)
      const entry = tally.get(key) ?? { label, count: 0 }
      entry.count += 1
      tally.set(key, entry)
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOP_INTERESTS)
}

function questionStats(apps: InsightsApplicationInput[]): QuestionInsight[] {
  const stats = new Map<string, QuestionInsight>()
  for (const app of apps) {
    if (app.answers.length === 0) continue
    for (const question of app.questions) {
      const stat =
        stats.get(question.id) ??
        { questionId: question.id, prompt: question.prompt, answered: 0, partial: 0, skipped: 0, notAsked: 0 }
      const completeness = app.answers.find((answer) => answer.questionId === question.id)?.completeness ?? 'not_asked'
      if (completeness === 'answered') stat.answered += 1
      else if (completeness === 'partial') stat.partial += 1
      else if (completeness === 'skipped') stat.skipped += 1
      else stat.notAsked += 1
      stats.set(question.id, stat)
    }
  }
  return [...stats.values()]
}

/** Fans who were asked a question but skipped it or only partly answered. */
export function unansweredShare(question: QuestionInsight): { count: number; asked: number } {
  return {
    count: question.skipped + question.partial,
    asked: question.answered + question.partial + question.skipped,
  }
}

export function isOftenUnanswered(question: QuestionInsight): boolean {
  const { count, asked } = unansweredShare(question)
  return asked >= 4 && count / asked >= 0.3
}

/** Plain, explainable suggestions for one event. Every one states the numbers behind it. */
export function eventSuggestions(insight: EventInsights): Suggestion[] {
  const out: Suggestion[] = []
  const { funnel, event } = insight
  const id = (name: string) => `${event.id}:${name}`

  if (insight.phase === 'past' && !insight.attendanceRecorded && funnel.accepted > 0) {
    out.push({
      id: id('record-attendance'),
      tone: 'warn',
      title: 'Attendance was not recorded',
      detail: `${funnel.accepted} fans accepted, but nobody is marked as attended. Mark attendance on each application so turnout and return rates are accurate.`,
    })
  }

  if (event.capacity > 0 && funnel.applied >= MIN_SAMPLE) {
    const ratio = funnel.applied / event.capacity
    if (ratio >= 1.5) {
      out.push({
        id: id('demand-high'),
        tone: 'info',
        title: 'Demand is well above capacity',
        detail: `${funnel.applied} applications for ${event.capacity} places. A bigger venue or a second session could welcome more fans.`,
      })
    } else if (insight.phase === 'past' && ratio < 0.5) {
      out.push({
        id: id('demand-low'),
        tone: 'info',
        title: 'Applications filled less than half the places',
        detail: `${funnel.applied} applications for ${event.capacity} places. Start promotion earlier next time, or plan a smaller venue.`,
      })
    }
  }

  if (insight.showUp && funnel.accepted >= MIN_SAMPLE && funnel.attended !== null) {
    const noShows = funnel.accepted - funnel.attended
    if (funnel.attended / funnel.accepted < 0.8) {
      out.push({
        id: id('show-up'),
        tone: 'warn',
        title: 'Some accepted fans did not attend',
        detail: `${noShows} of ${funnel.accepted} accepted fans were not marked as attended. A reminder the day before, or inviting a few extra from the waitlist, can cover the gap.`,
      })
    }
  }

  if (funnel.applied >= MIN_SAMPLE && insight.dropOff.noInterview / funnel.applied >= 0.3) {
    out.push({
      id: id('interview-drop'),
      tone: 'info',
      title: 'Many applicants have no completed interview',
      detail: `${insight.dropOff.noInterview} of ${funnel.applied} applicants have not completed the AI interview. Check call timing, and remind them they can request the call again.`,
    })
  }

  insight.questions.forEach((question, index) => {
    if (!isOftenUnanswered(question)) return
    const { count, asked } = unansweredShare(question)
    out.push({
      id: id(`question-${question.questionId}`),
      tone: 'info',
      title: `Question ${index + 1} is often left unanswered`,
      detail: `${count} of ${asked} fans who were asked "${question.prompt}" skipped it or answered only partly. Consider rewording it or making it optional.`,
    })
  })

  const top = insight.interests[0]
  if (top && top.count >= 3) {
    out.push({
      id: id('top-interest'),
      tone: 'ok',
      title: 'What fans want most',
      detail: `"${top.label}" came up in ${top.count} interviews. Consider making it a highlight of the next event.`,
    })
  }

  if (funnel.applied >= MIN_SAMPLE && insight.audience.returningFans / funnel.applied >= 0.4) {
    out.push({
      id: id('returning'),
      tone: 'ok',
      title: 'Strong returning audience',
      detail: `${insight.audience.returningFans} of ${funnel.applied} applicants applied to an earlier event too.`,
    })
  }

  return out
}

/** Suggestions about fans coming back across events. */
export function retentionSuggestions(retention: RetentionSummary): Suggestion[] {
  return retention.cohorts
    .filter((cohort) => cohort.attendees >= MIN_SAMPLE && cohort.cameBack / cohort.attendees < 0.4)
    .map((cohort) => ({
      id: `retention:${cohort.eventId}`,
      tone: 'warn' as const,
      title: `Few ${cohort.title} attendees came back`,
      detail: `${cohort.cameBack} of ${cohort.attendees} attendees applied to a later event. A thank-you message with the next date, or early access for past attendees, can bring more of them back.`,
    }))
}
