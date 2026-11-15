/*
 * Synthetic sample data for fixture mode. Nothing here came from a real call
 * or a real person; every activity record is flagged isDemo.
 */
import { defaultInterviewConfig } from '../../lib/interviewConfig'
import type {
  ActivityEvent,
  ApplicationDetail,
  ApplicationStatus,
  CallAttempt,
  Completeness,
  DecisionRecord,
  EventRecord,
  InterviewConfig,
  InterviewResult,
  Me,
  PublishedVersionMeta,
  Role,
  TranscriptSegment,
} from '../types'

export type StoredVersion = PublishedVersionMeta & { config: InterviewConfig }

export interface InterviewEntry {
  draft: InterviewConfig
  draftUpdatedAt: string | null
  versions: StoredVersion[]
}

/** Capacity is derived on read so it always reflects current decisions. */
export type StoredApplication = Omit<ApplicationDetail, 'capacity'> & { phone?: string; consentAcceptedAt?: string }

export interface Db {
  schema: 1
  me: Me
  fan: Me
  otherFans: Me[]
  signedOut?: Partial<Record<Role, boolean>>
  events: EventRecord[]
  interviews: Record<string, InterviewEntry>
  applications: StoredApplication[]
}

const EVENT_ID = 'evt_1'
const EVENT_TITLE = 'Community Night Dallas'
const STAFF = { id: 'staff_1', displayName: 'Demo Staff' }
export const DEMO_STAFF_CONTACT = { email: 'faze.demo.staff@gmail.com', phone: '+12025550124' }
export const DEMO_FAN_CONTACT = { email: 'faze.demo.fan@gmail.com', phone: '+12025550123' }

interface Exchange {
  questionId: string
  agent: string
  /** null when the applicant never answered (question asked but call ended, or not asked). */
  applicant: string | null
  summary: string
  completeness: Completeness
}

function buildInterview(
  callId: string,
  startedAt: string,
  exchanges: Exchange[],
  summary: string,
  interests: string[],
  reviewNotes: string[] = [],
  closing: string | null = 'Thanks for chatting! Event staff will review your application.',
): { transcript: TranscriptSegment[]; result: InterviewResult } {
  const transcript: TranscriptSegment[] = []
  const base = new Date(startedAt).getTime()
  const say = (speaker: 'agent' | 'applicant', text: string) => {
    const sequence = transcript.length + 1
    const segment: TranscriptSegment = {
      id: `seg_${callId}_${sequence}`,
      callAttemptId: callId,
      sequence,
      speaker,
      text,
      timestamp: new Date(base + sequence * 9000).toISOString(),
    }
    transcript.push(segment)
    return segment.id
  }

  say('agent', 'Hi! I am an AI host for the event team. Your answers are transcribed for staff review. Ready to start?')
  say('applicant', 'Yeah, ready.')

  const answers = exchanges.map((exchange) => {
    const segmentIds: string[] = []
    if (exchange.completeness !== 'not_asked') {
      say('agent', exchange.agent)
      if (exchange.applicant !== null) segmentIds.push(say('applicant', exchange.applicant))
    }
    return {
      questionId: exchange.questionId,
      summary: exchange.summary,
      transcriptSegmentIds: segmentIds,
      completeness: exchange.completeness,
    }
  })
  if (closing) say('agent', closing)

  return {
    transcript,
    result: {
      schemaVersion: 1,
      callAttemptId: callId,
      interviewVersionId: 'iv_1',
      summary,
      interests,
      answers,
      unansweredQuestionIds: answers
        .filter((a) => a.completeness === 'skipped' || a.completeness === 'not_asked')
        .map((a) => a.questionId),
      reviewNotes,
    },
  }
}

function attempt(
  id: string,
  status: CallAttempt['status'],
  startedAt: string,
  durationSeconds: number | null,
  processingStatus: CallAttempt['processingStatus'],
  failureCode: string | null = null,
): CallAttempt {
  return {
    id,
    status,
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + (durationSeconds ?? 30) * 1000).toISOString(),
    durationSeconds,
    failureCode,
    processingStatus,
  }
}

function activity(id: string, type: ActivityEvent['type'], eventTitle: string, timestamp: string, eventId: string | null = EVENT_ID): ActivityEvent {
  return { id, type, eventId, eventTitle, timestamp, source: 'Seeded demo record', isDemo: true }
}

function decision(id: string, value: DecisionRecord['decision'], createdAt: string, reason: string | null): DecisionRecord {
  return { id, decision: value, reason, reviewer: STAFF, createdAt }
}

export function createSeed(): Db {
  const config = defaultInterviewConfig()
  const version: StoredVersion = {
    versionId: 'iv_1',
    versionNumber: 1,
    publishedAt: '2026-11-10T16:00:00.000Z',
    config,
  }

  const base = (
    id: string,
    name: string,
    status: ApplicationStatus,
    submittedAt: string,
  ): StoredApplication => ({
    id,
    status,
    submittedAt,
    applicant: { id: `user_${id}`, displayName: name, email: `${name.split(' ')[0].toLowerCase()}@example.com` },
    event: { id: EVENT_ID, title: EVENT_TITLE },
    interviewVersion: structuredClone(version),
    selectedAttemptId: null,
    attempts: [],
    result: null,
    transcript: [],
    activity: [],
    pastApplications: [],
    decision: null,
    decisionHistory: [],
  })

  // 1. Clean example: missed first attempt, completed second attempt, full evidence.
  const maya = base('app_maya', 'Maya Tran', 'review_pending', '2026-11-12T18:05:00.000Z')
  const mayaCall = buildInterview(
    'call_maya_2',
    '2026-11-12T18:20:00.000Z',
    [
      {
        questionId: 'q_1',
        agent: 'What FaZe content have you been into lately?',
        applicant: 'Mostly the challenge videos and the house vlogs. I rewatched the warehouse hide and seek one last week.',
        summary: 'Watches challenge videos and house vlogs; recently rewatched a hide-and-seek video.',
        completeness: 'answered',
      },
      {
        questionId: 'q_2',
        agent: 'Nice. What made you want to come to this event?',
        applicant: 'I have only ever watched online, and a couple of friends from a Discord server are going. I want to meet people in person.',
        summary: 'Wants to meet other fans in person; friends from a Discord community are attending.',
        completeness: 'answered',
      },
      {
        questionId: 'q_3',
        agent: 'What would you be most excited to do there?',
        applicant: 'Honestly the community tournament. I am not great but it sounds fun.',
        summary: 'Most excited about the community tournament.',
        completeness: 'answered',
      },
      {
        questionId: 'q_4',
        agent: 'Have you been to a FaZe event or community activity before?',
        applicant: 'One fan meetup last year, that is it.',
        summary: 'Attended one fan meetup last year.',
        completeness: 'answered',
      },
    ],
    'Enjoys challenge videos and vlogs, wants to meet other fans in person, and is most excited about the community tournament.',
    ['challenge videos', 'house vlogs', 'community tournament'],
  )
  maya.attempts = [
    attempt('call_maya_1', 'missed', '2026-11-12T18:08:00.000Z', null, null),
    attempt('call_maya_2', 'completed', '2026-11-12T18:20:00.000Z', 172, 'ready'),
  ]
  maya.selectedAttemptId = 'call_maya_2'
  maya.transcript = mayaCall.transcript
  maya.result = mayaCall.result
  maya.activity = [
    activity('act_maya_1', 'attendance', 'Fan Meetup Austin', '2025-10-18T23:00:00.000Z', 'evt_austin'),
    activity('act_maya_2', 'application', EVENT_TITLE, maya.submittedAt),
  ]
  maya.pastApplications = [
    { id: 'app_maya_old', eventTitle: 'Fan Meetup Austin', submittedAt: '2025-09-30T15:00:00.000Z', status: 'accepted' },
  ]

  // 2. Partial example: call dropped after the second question.
  const devon = base('app_devon', 'Devon Brooks', 'review_pending', '2026-11-12T20:40:00.000Z')
  const devonCall = buildInterview(
    'call_devon_1',
    '2026-11-12T20:45:00.000Z',
    [
      {
        questionId: 'q_1',
        agent: 'What FaZe content have you enjoyed recently?',
        applicant: 'The tournament streams, I watch most of them live.',
        summary: 'Watches tournament streams, usually live.',
        completeness: 'answered',
      },
      {
        questionId: 'q_2',
        agent: 'What made you want to attend this event?',
        applicant: 'Well, I saw the announcement and',
        summary: 'Started to mention seeing the announcement; the call ended mid-answer.',
        completeness: 'partial',
      },
      { questionId: 'q_3', agent: '', applicant: null, summary: '', completeness: 'not_asked' },
      { questionId: 'q_4', agent: '', applicant: null, summary: '', completeness: 'not_asked' },
    ],
    'Partial interview. The applicant watches tournament streams; the call disconnected during the second question.',
    ['tournament streams'],
    ['Call disconnected after 64 seconds; two questions were not asked.'],
    null,
  )
  devon.attempts = [attempt('call_devon_1', 'failed', '2026-11-12T20:45:00.000Z', 64, 'ready', 'participant_disconnected')]
  devon.selectedAttemptId = 'call_devon_1'
  devon.transcript = devonCall.transcript
  devon.result = devonCall.result
  devon.activity = [activity('act_devon_1', 'application', EVENT_TITLE, devon.submittedAt)]

  // 3. Extraction failed: call completed, transcript kept, no structured result.
  const priya = base('app_priya', 'Priya Nair', 'review_pending', '2026-11-13T01:10:00.000Z')
  const priyaCall = buildInterview(
    'call_priya_1',
    '2026-11-13T01:15:00.000Z',
    [
      {
        questionId: 'q_1',
        agent: 'What FaZe content have you enjoyed recently?',
        applicant: 'I am pretty new, a friend showed me some clips a month ago and I kept watching.',
        summary: '',
        completeness: 'answered',
      },
      {
        questionId: 'q_2',
        agent: 'What made you want to attend?',
        applicant: 'I have never been to anything like this and it is close to where I live.',
        summary: '',
        completeness: 'answered',
      },
      {
        questionId: 'q_3',
        agent: 'What would you be most excited to do there?',
        applicant: 'Probably just hanging out and seeing what it is like.',
        summary: '',
        completeness: 'answered',
      },
      {
        questionId: 'q_4',
        agent: 'Have you joined a FaZe event or community activity before?',
        applicant: 'No, this would be my first.',
        summary: '',
        completeness: 'answered',
      },
    ],
    '',
    [],
  )
  priya.attempts = [attempt('call_priya_1', 'completed', '2026-11-13T01:15:00.000Z', 158, 'failed')]
  priya.selectedAttemptId = 'call_priya_1'
  priya.transcript = priyaCall.transcript
  priya.result = null

  // 4. Missed call, 5. No call yet (new fan, no activity).
  const luis = base('app_luis', 'Luis Ortega', 'interview_pending', '2026-11-13T15:30:00.000Z')
  luis.attempts = [attempt('call_luis_1', 'missed', '2026-11-13T15:34:00.000Z', null, null)]
  luis.activity = [activity('act_luis_1', 'application', EVENT_TITLE, luis.submittedAt)]

  const sam = base('app_sam', 'Sam Whitfield', 'submitted', '2026-11-14T02:00:00.000Z')

  // 6-8. Already decided, so the list, capacity and analytics have something to show.
  const decided = (
    id: string,
    name: string,
    status: ApplicationStatus,
    submittedAt: string,
    answer: string,
    lastCompleteness: Completeness,
  ) => {
    const app = base(id, name, status, submittedAt)
    const callId = `call_${id.slice(4)}_1`
    const startedAt = new Date(new Date(submittedAt).getTime() + 10 * 60000).toISOString()
    const call = buildInterview(
      callId,
      startedAt,
      [
        { questionId: 'q_1', agent: 'What FaZe content have you enjoyed recently?', applicant: answer, summary: answer, completeness: 'answered' },
        { questionId: 'q_2', agent: 'What made you want to attend this event?', applicant: 'I want to meet the community.', summary: 'Wants to meet the community.', completeness: 'answered' },
        { questionId: 'q_3', agent: 'What would you be most excited to do there?', applicant: 'The meet and greet.', summary: 'Most excited about the meet and greet.', completeness: 'answered' },
        {
          questionId: 'q_4',
          agent: 'Have you joined a FaZe event or community activity before?',
          applicant: lastCompleteness === 'skipped' ? 'I would rather skip that one.' : 'Not yet, this is my first.',
          summary: lastCompleteness === 'skipped' ? 'Chose to skip this question.' : 'No previous events; this would be the first.',
          completeness: lastCompleteness,
        },
      ],
      `${answer} Wants to meet the community.`,
      ['community'],
    )
    app.attempts = [attempt(callId, 'completed', startedAt, 140, 'ready')]
    app.selectedAttemptId = callId
    app.transcript = call.transcript
    app.result = call.result
    app.activity = [activity(`act_${id}_1`, 'application', EVENT_TITLE, submittedAt)]
    return app
  }

  const jordan = decided('app_jordan', 'Jordan Lee', 'invited', '2026-11-11T17:00:00.000Z', 'Mostly the gaming streams.', 'skipped')
  jordan.decision = decision('dec_jordan_1', 'invite', '2026-11-11T19:00:00.000Z', null)
  jordan.decisionHistory = [jordan.decision]

  const alex = decided('app_alex', 'Alex Kim', 'accepted', '2026-11-11T14:00:00.000Z', 'The vlogs and podcast clips.', 'answered')
  alex.decision = decision('dec_alex_1', 'invite', '2026-11-11T16:00:00.000Z', 'Clear answers.')
  alex.decisionHistory = [alex.decision]
  alex.activity.push(activity('act_app_alex_2', 'invitation_accepted', EVENT_TITLE, '2026-11-11T21:00:00.000Z'))

  const riley = decided('app_riley', 'Riley Chen', 'waitlisted', '2026-11-11T22:00:00.000Z', 'Short clips on social media.', 'answered')
  riley.decision = decision('dec_riley_1', 'waitlist', '2026-11-12T00:30:00.000Z', 'Holding spots while capacity is confirmed.')
  riley.decisionHistory = [riley.decision]

  const db: Db = {
    schema: 1,
    me: { ...STAFF, ...DEMO_STAFF_CONTACT, role: 'staff' },
    fan: { id: 'fan_demo', ...DEMO_FAN_CONTACT, displayName: 'Demo Fan', role: 'fan' },
    otherFans: [],
    events: [
      {
        id: EVENT_ID,
        title: EVENT_TITLE,
        description: 'An evening for fans to meet, play in a casual community tournament, and hang out.',
        location: 'Deep Ellum, Dallas, TX',
        startsAt: '2026-12-12T01:00:00.000Z',
        timezone: 'America/Chicago',
        capacity: 40,
        applicationDeadline: '2026-12-01T05:59:00.000Z',
        publicationStatus: 'published',
      },
    ],
    interviews: {
      [EVENT_ID]: { draft: structuredClone(config), draftUpdatedAt: version.publishedAt, versions: [version] },
    },
    applications: [maya, devon, priya, luis, sam, jordan, alex, riley],
  }
  addSampleHistory(db)
  return db
}

/*
 * Two past sample events so Insights has turnout, no-shows and returning fans
 * to show. Some current applicants (Maya, Jordan, Alex, Riley) took part
 * before; everyone else is a synthetic past-only fan. All records are demo.
 */
export const HISTORY_EVENT_IDS = ['evt_austin', 'evt_houston'] as const

type PastOutcome = 'attended' | 'no_show' | 'waitlisted' | 'invited' | 'no_interview'

interface PastEntry {
  name: string
  outcome: PastOutcome
  interests: string[]
  skipLastQuestion?: boolean
}

const RETURNING: Record<string, { id: string; email: string }> = {
  'Maya Tran': { id: 'user_app_maya', email: 'maya@example.com' },
  'Jordan Lee': { id: 'user_app_jordan', email: 'jordan@example.com' },
  'Alex Kim': { id: 'user_app_alex', email: 'alex@example.com' },
  'Riley Chen': { id: 'user_app_riley', email: 'riley@example.com' },
}

const PAST_EVENTS: {
  event: EventRecord
  entries: PastEntry[]
}[] = [
  {
    event: {
      id: 'evt_austin',
      title: 'Fan Meetup Austin',
      description: 'A small meetup with a casual community tournament and a creator Q&A.',
      location: 'East Austin, TX',
      startsAt: '2025-10-18T23:00:00.000Z',
      timezone: 'America/Chicago',
      capacity: 20,
      applicationDeadline: '2025-10-11T04:59:00.000Z',
      publicationStatus: 'published',
    },
    entries: [
      { name: 'Maya Tran', outcome: 'attended', interests: ['community tournament', 'meet and greet'] },
      { name: 'Jordan Lee', outcome: 'attended', interests: ['community tournament', 'creator Q&A'] },
      { name: 'Casey Morgan', outcome: 'attended', interests: ['creator Q&A', 'meet and greet'] },
      { name: 'Drew Santos', outcome: 'attended', interests: ['community tournament'] },
      { name: 'Elena Ruiz', outcome: 'attended', interests: ['meet and greet', 'watch party'] },
      { name: 'Fatima Ali', outcome: 'attended', interests: ['creator Q&A'] },
      { name: 'Grace Liu', outcome: 'attended', interests: ['community tournament', 'merch drop'] },
      { name: 'Ethan Park', outcome: 'no_show', interests: ['community tournament'] },
      { name: 'Hunter Reed', outcome: 'no_show', interests: ['meet and greet'] },
      { name: 'Isaac Moore', outcome: 'waitlisted', interests: ['creator Q&A'] },
      { name: 'Jade Wong', outcome: 'invited', interests: ['watch party'] },
      { name: 'Kai Turner', outcome: 'no_interview', interests: [] },
    ],
  },
  {
    event: {
      id: 'evt_houston',
      title: 'Summer Watch Party Houston',
      description: 'A watch party for the summer tournament finals, with mini-games between matches.',
      location: 'Midtown, Houston, TX',
      startsAt: '2026-06-20T23:00:00.000Z',
      timezone: 'America/Chicago',
      capacity: 24,
      applicationDeadline: '2026-06-13T04:59:00.000Z',
      publicationStatus: 'published',
    },
    entries: [
      { name: 'Jordan Lee', outcome: 'attended', interests: ['watch party', 'community tournament'] },
      { name: 'Alex Kim', outcome: 'attended', interests: ['watch party', 'creator Q&A'] },
      { name: 'Riley Chen', outcome: 'no_show', interests: ['watch party'] },
      { name: 'Casey Morgan', outcome: 'attended', interests: ['watch party'] },
      { name: 'Elena Ruiz', outcome: 'attended', interests: ['watch party', 'mini-games'] },
      { name: 'Lena Fischer', outcome: 'attended', interests: ['mini-games'], skipLastQuestion: true },
      { name: 'Marco Silva', outcome: 'attended', interests: ['watch party'], skipLastQuestion: true },
      { name: 'Nia Johnson', outcome: 'attended', interests: ['merch drop'] },
      { name: 'Omar Haddad', outcome: 'attended', interests: ['watch party', 'mini-games'], skipLastQuestion: true },
      { name: 'Quinn Avery', outcome: 'no_show', interests: ['mini-games'], skipLastQuestion: true },
      { name: 'Rosa Diaz', outcome: 'no_show', interests: ['watch party'] },
      { name: 'Theo Grant', outcome: 'no_show', interests: ['community tournament'] },
      { name: 'Uma Shah', outcome: 'waitlisted', interests: ['watch party'], skipLastQuestion: true },
      { name: 'Victor Lin', outcome: 'invited', interests: ['mini-games'] },
      { name: 'Zoe Carter', outcome: 'no_interview', interests: [] },
    ],
  },
]

/** Adds the past sample events once. Safe to call on an older saved store. */
export function addSampleHistory(db: Db) {
  if (db.events.some((event) => event.id === HISTORY_EVENT_IDS[0])) return
  const config = defaultInterviewConfig()

  for (const { event, entries } of PAST_EVENTS) {
    const short = event.id.replace('evt_', '')
    const version: StoredVersion = {
      versionId: `iv_${short}_1`,
      versionNumber: 1,
      publishedAt: new Date(Date.parse(event.applicationDeadline) - 21 * 86400000).toISOString(),
      config: structuredClone(config),
    }
    db.events.push(structuredClone(event))
    db.interviews[event.id] = { draft: structuredClone(config), draftUpdatedAt: version.publishedAt, versions: [version] }

    entries.forEach((entry, index) => {
      const [first, last] = entry.name.split(' ')
      const known = RETURNING[entry.name]
      const applicant = {
        id: known?.id ?? `user_${first.toLowerCase()}_${last.toLowerCase()}`,
        displayName: entry.name,
        email: known?.email ?? `${first.toLowerCase()}@example.com`,
      }
      // Maya's Austin application already appears in her current record under this ID.
      const id = entry.name === 'Maya Tran' && event.id === 'evt_austin' ? 'app_maya_old' : `app_${short}_${first.toLowerCase()}`
      const submittedAt = new Date(Date.parse(event.applicationDeadline) - (14 - index) * 86400000).toISOString()
      const status: ApplicationStatus =
        entry.outcome === 'attended' || entry.outcome === 'no_show'
          ? 'accepted'
          : entry.outcome === 'waitlisted'
            ? 'waitlisted'
            : entry.outcome === 'invited'
              ? 'invited'
              : 'interview_pending'

      const app: StoredApplication = {
        id,
        status,
        submittedAt,
        applicant,
        event: { id: event.id, title: event.title },
        interviewVersion: structuredClone(version),
        selectedAttemptId: null,
        attempts: [],
        result: null,
        transcript: [],
        activity: [activity(`act_${id}_applied`, 'application', event.title, submittedAt, event.id)],
        pastApplications: [],
        decision: null,
        decisionHistory: [],
      }

      if (entry.outcome !== 'no_interview') {
        const callId = `call_${id}`
        const startedAt = new Date(Date.parse(submittedAt) + 2 * 3600000).toISOString()
        const topic = entry.interests[0] ?? 'the community'
        const call = buildInterview(
          callId,
          startedAt,
          [
            { questionId: 'q_1', agent: 'What FaZe content have you enjoyed recently?', applicant: `Mostly anything with ${topic}.`, summary: `Enjoys content around ${topic}.`, completeness: 'answered' },
            { questionId: 'q_2', agent: 'What made you want to attend this event?', applicant: 'I want to hang out with other fans in person.', summary: 'Wants to meet other fans in person.', completeness: 'answered' },
            { questionId: 'q_3', agent: 'What would you be most excited to do there?', applicant: `Definitely the ${topic}.`, summary: `Most excited about the ${topic}.`, completeness: 'answered' },
            entry.skipLastQuestion
              ? { questionId: 'q_4', agent: 'Have you joined a FaZe event or community activity before?', applicant: 'I would rather skip that one.', summary: 'Chose to skip this question.', completeness: 'skipped' }
              : { questionId: 'q_4', agent: 'Have you joined a FaZe event or community activity before?', applicant: 'A couple of online community things.', summary: 'Has joined online community activities.', completeness: 'answered' },
          ],
          `Synthetic past applicant interested in ${entry.interests.join(' and ') || 'the event'}.`,
          entry.interests,
        )
        app.attempts = [attempt(callId, 'completed', startedAt, 150, 'ready')]
        app.selectedAttemptId = callId
        app.transcript = call.transcript
        app.result = { ...call.result, interviewVersionId: version.versionId }
      }

      const decidedAt = new Date(Date.parse(submittedAt) + 86400000).toISOString()
      if (status === 'accepted' || status === 'invited') {
        app.decision = decision(`dec_${id}`, 'invite', decidedAt, null)
      } else if (status === 'waitlisted') {
        app.decision = decision(`dec_${id}`, 'waitlist', decidedAt, 'Capacity reached.')
      }
      if (app.decision) app.decisionHistory = [app.decision]

      if (status === 'accepted') {
        app.activity.push(activity(`act_${id}_accepted`, 'invitation_accepted', event.title, new Date(Date.parse(decidedAt) + 3600000).toISOString(), event.id))
      }
      // Maya's Austin attendance is already recorded on her current application.
      if (entry.outcome === 'attended' && id !== 'app_maya_old') {
        app.activity.push(activity(`act_${id}_attended`, 'attendance', event.title, event.startsAt, event.id))
      }
      db.applications.push(app)
    })
  }

  // Show the earlier applications on the returning fans' current records.
  const pastFor = (userId: string) =>
    db.applications
      .filter((app) => app.applicant.id === userId && (HISTORY_EVENT_IDS as readonly string[]).includes(app.event.id))
      .map((app) => ({ id: app.id, eventTitle: app.event.title, submittedAt: app.submittedAt, status: app.status }))
  for (const current of ['app_jordan', 'app_alex', 'app_riley']) {
    const app = db.applications.find((candidate) => candidate.id === current)
    if (app && app.pastApplications.length === 0) app.pastApplications = pastFor(app.applicant.id)
  }
}
