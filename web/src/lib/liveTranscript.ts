import type { Answer, ApplicationDetail, Completeness, Question, TranscriptSegment } from '../api/types'

export type LiveLine = { speaker: 'you' | 'host'; text: string }

const LIVE_TRANSCRIPT_URL = 'http://127.0.0.1:5191/transcript'

const STOP_WORDS = new Set([
  'what', 'have', 'you', 'your', 'this', 'that', 'with', 'from', 'about', 'there', 'been',
  'would', 'most', 'made', 'want', 'join', 'joined', 'just', 'like', 'some', 'into',
])

/** The fan page and the staff review both read the call from the local dial service. */
export async function fetchLiveLines(applicationId: string): Promise<LiveLine[]> {
  const response = await fetch(`${LIVE_TRANSCRIPT_URL}?applicationId=${encodeURIComponent(applicationId)}`)
  if (!response.ok) throw new Error('Live transcript is unavailable')
  const body = await response.json() as { lines?: LiveLine[] }
  if (!Array.isArray(body.lines)) return []
  return body.lines.filter((line): line is LiveLine =>
    (line?.speaker === 'you' || line?.speaker === 'host') && typeof line.text === 'string' && line.text.trim().length > 0,
  )
}

/**
 * Turn the live FaceTime script into the transcript and per-question answers the staff page already renders.
 * The database is not involved: this only reads lines the dial service already stored for the call.
 */
export function applyLiveScript(app: ApplicationDetail, lines: LiveLine[]): ApplicationDetail {
  if (lines.length === 0) return app
  const attempt = app.attempts.find((item) => item.id === app.selectedAttemptId) ?? app.attempts.at(-1) ?? null
  const attemptId = attempt?.id ?? `live_${app.id}`
  const parsed = parseLiveCall(lines, app.interviewVersion.config.questions, attemptId, new Date().toISOString())
  const attempts = attempt
    ? app.attempts.map((item) => item.id === attemptId
      ? { ...item, status: item.status, processingStatus: 'ready' as const, startedAt: item.startedAt ?? parsed.transcript[0]?.timestamp ?? null }
      : item)
    : [...app.attempts, {
      id: attemptId,
      status: 'connected' as const,
      startedAt: parsed.transcript[0]?.timestamp ?? null,
      endedAt: null,
      durationSeconds: null,
      failureCode: null,
      processingStatus: 'ready' as const,
    }]
  const said = parsed.answers.filter((answer) => answer.completeness === 'answered').map((answer) => answer.summary)
  return {
    ...app,
    selectedAttemptId: attemptId,
    attempts,
    transcript: parsed.transcript,
    result: {
      schemaVersion: 1,
      callAttemptId: attemptId,
      interviewVersionId: app.interviewVersion.versionId,
      summary: said.slice(0, 2).join(' ') || 'The live call has started, and no question has been answered yet.',
      interests: [],
      answers: parsed.answers,
      unansweredQuestionIds: parsed.answers.filter((answer) => answer.completeness === 'not_asked').map((answer) => answer.questionId),
      reviewNotes: ['Read from the live FaceTime. This script is not stored in the database yet.'],
    },
  }
}

export function parseLiveCall(lines: LiveLine[], questions: Question[], attemptId: string, startedAt = '2026-11-15T00:00:00.000Z'): {
  transcript: TranscriptSegment[]
  answers: Answer[]
} {
  const ordered = [...questions].sort((a, b) => a.order - b.order)
  const start = Date.parse(startedAt)
  const transcript: TranscriptSegment[] = lines.map((line, index) => ({
    id: `live_${attemptId}_${index}`,
    callAttemptId: attemptId,
    sequence: index + 1,
    speaker: line.speaker === 'host' ? 'agent' : 'applicant',
    text: line.text.trim(),
    timestamp: new Date(start + index * 1000).toISOString(),
  }))

  const used = new Set<string>()
  const spoken = new Map<string, { ids: string[]; texts: string[] }>()
  const turn: { question: Question | null } = { question: null }
  let greetingSeen = false

  const open = (question: Question) => {
    turn.question = question
    used.add(question.id)
    greetingSeen = true
    if (!spoken.has(question.id)) spoken.set(question.id, { ids: [], texts: [] })
  }

  for (const segment of transcript) {
    if (segment.speaker === 'agent') {
      const matched = bestQuestion(segment.text, ordered, used)
      if (matched) {
        open(matched)
        continue
      }
      if (!greetingSeen) {
        greetingSeen = true
        continue
      }
      // A host line after an answer is the next question, even when the wording is not the written prompt.
      // A host line before any answer is a follow-up and stays on the open question.
      if (turn.question && (spoken.get(turn.question.id)?.texts.length ?? 0) === 0) continue
      const next = ordered.find((question) => !used.has(question.id))
      if (next) open(next)
      continue
    }
    if (!turn.question) continue
    const bucket = spoken.get(turn.question.id)
    if (!bucket) continue
    bucket.ids.push(segment.id)
    bucket.texts.push(segment.text)
  }

  const answers: Answer[] = ordered.map((question) => {
    const bucket = spoken.get(question.id)
    const summary = (bucket?.texts ?? []).join(' ').trim()
    let completeness: Completeness = 'not_asked'
    if (used.has(question.id) && asksToSkip(summary)) completeness = 'skipped'
    else if (used.has(question.id) && summary) completeness = 'answered'
    else if (used.has(question.id)) completeness = 'partial'
    return {
      questionId: question.id,
      summary: completeness === 'skipped' ? 'The applicant skipped this question.' : summary,
      transcriptSegmentIds: bucket?.ids ?? [],
      completeness,
    }
  })

  return { transcript, answers }
}

function bestQuestion(hostText: string, questions: Question[], used: Set<string>): Question | null {
  let best: Question | null = null
  let bestScore = 0
  for (const question of questions) {
    if (used.has(question.id)) continue
    const score = matchScore(hostText, question.prompt)
    if (score > bestScore) {
      best = question
      bestScore = score
    }
  }
  return best && bestScore >= 0.5 ? best : null
}

function matchScore(hostText: string, prompt: string): number {
  const promptWords = significant(prompt)
  if (promptWords.length === 0) return 0
  const hostWords = new Set(significant(hostText))
  const hits = promptWords.filter((word) => hostWords.has(word)).length
  return hits / promptWords.length
}

function significant(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !STOP_WORDS.has(word))
}

function asksToSkip(text: string): boolean {
  return /\b(skip|pass|stop|not sure|don'?t know|do not know)\b/i.test(text)
}
