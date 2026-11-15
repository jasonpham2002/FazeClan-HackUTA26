import type { InterviewConfig, Question } from '../api/types'

/** Proposed demo limits from Khoi.md. CONFIRM (Jason, Johnny): the backend must enforce the same. */
export const LIMITS = {
  minQuestions: 1,
  maxQuestions: 6,
  minDurationSeconds: 60,
  maxDurationSeconds: 300,
  minFollowUps: 0,
  maxFollowUps: 2,
} as const

export interface ConfigIssue {
  /** "intro", "maxDurationSeconds", "questions", or "questions.<id>.<field>" */
  path: string
  message: string
}

export function validateConfig(config: InterviewConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const { questions } = config

  if (!config.intro.trim()) issues.push({ path: 'intro', message: 'Add an opening greeting.' })
  if (!config.tone.trim()) issues.push({ path: 'tone', message: 'Describe the tone.' })

  if (
    !Number.isInteger(config.maxDurationSeconds) ||
    config.maxDurationSeconds < LIMITS.minDurationSeconds ||
    config.maxDurationSeconds > LIMITS.maxDurationSeconds
  ) {
    issues.push({
      path: 'maxDurationSeconds',
      message: `Duration must be a whole number from ${LIMITS.minDurationSeconds} to ${LIMITS.maxDurationSeconds} seconds.`,
    })
  }

  if (questions.length < LIMITS.minQuestions || questions.length > LIMITS.maxQuestions) {
    issues.push({
      path: 'questions',
      message: `An interview needs ${LIMITS.minQuestions} to ${LIMITS.maxQuestions} questions.`,
    })
  }

  const seen = new Set<string>()
  for (const q of questions) {
    if (seen.has(q.id)) issues.push({ path: 'questions', message: `Duplicate question ID ${q.id}.` })
    seen.add(q.id)
    if (!q.prompt.trim()) issues.push({ path: `questions.${q.id}.prompt`, message: 'A question needs a prompt.' })
    if (
      !Number.isInteger(q.maxFollowUps) ||
      q.maxFollowUps < LIMITS.minFollowUps ||
      q.maxFollowUps > LIMITS.maxFollowUps
    ) {
      issues.push({
        path: `questions.${q.id}.maxFollowUps`,
        message: `Follow-ups must be ${LIMITS.minFollowUps} to ${LIMITS.maxFollowUps}.`,
      })
    }
  }
  return issues
}

export function issueFor(issues: ConfigIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message
}

/** Sorts by `order` and renumbers 1..n so the saved order is always contiguous. */
export function normalizeOrder(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => a.order - b.order).map((q, index) => ({ ...q, order: index + 1 }))
}

export function moveQuestion(questions: Question[], id: string, direction: 'up' | 'down'): Question[] {
  const sorted = normalizeOrder(questions)
  const index = sorted.findIndex((q) => q.id === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= sorted.length) return sorted
  const next = [...sorted]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next.map((q, i) => ({ ...q, order: i + 1 }))
}

export function removeQuestion(questions: Question[], id: string): Question[] {
  return normalizeOrder(questions.filter((q) => q.id !== id))
}

/** New IDs are random so a deleted question's ID is never reused for a different question. */
export function newQuestionId(existing: Question[]): string {
  const taken = new Set(existing.map((q) => q.id))
  for (;;) {
    const id = `q_${Math.random().toString(36).slice(2, 8)}`
    if (!taken.has(id)) return id
  }
}

export function addQuestion(questions: Question[]): Question[] {
  const sorted = normalizeOrder(questions)
  return [
    ...sorted,
    { id: newQuestionId(sorted), prompt: '', purpose: '', required: true, order: sorted.length + 1, maxFollowUps: 1 },
  ]
}

export function configsEqual(a: InterviewConfig, b: InterviewConfig): boolean {
  const canonical = (c: InterviewConfig) =>
    JSON.stringify({
      intro: c.intro,
      tone: c.tone,
      maxDurationSeconds: c.maxDurationSeconds,
      questions: normalizeOrder(c.questions).map((q) => [q.id, q.prompt, q.purpose, q.required, q.order, q.maxFollowUps]),
    })
  return canonical(a) === canonical(b)
}

/** The four starter questions suggested in Khoi.md. */
export function defaultInterviewConfig(): InterviewConfig {
  const prompts: [string, string][] = [
    ['What FaZe content have you enjoyed recently?', 'Understand interests'],
    ['What made you want to attend this event?', 'Understand motivation'],
    ['What would you be most excited to do there?', 'Understand expectations'],
    ['Have you joined a FaZe event or community activity before?', 'Learn about past participation; being new is fine'],
  ]
  return {
    intro: 'Thanks for applying! I am an AI host and I have a few quick questions for you.',
    tone: 'friendly and casual',
    maxDurationSeconds: 180,
    questions: prompts.map(([prompt, purpose], index) => ({
      id: `q_${index + 1}`,
      prompt,
      purpose,
      required: index < 3,
      order: index + 1,
      maxFollowUps: 1,
    })),
  }
}
