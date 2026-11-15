import { describe, expect, it } from 'vitest'
import { describeRate, EM_DASH, formatDuration, formatRate, utcIsoToZonedLocal, zonedLocalToUtcIso } from './format'
import {
  addQuestion,
  configsEqual,
  defaultInterviewConfig,
  LIMITS,
  moveQuestion,
  removeQuestion,
  validateConfig,
} from './interviewConfig'

describe('rates', () => {
  it('shows an em dash instead of 0% when the denominator is zero', () => {
    expect(formatRate({ numerator: 0, denominator: 0 })).toBe(EM_DASH)
    expect(describeRate({ numerator: 0, denominator: 0 }, 'attempted calls', 'connected')).toMatch(/Not available/)
  })

  it('states the denominator', () => {
    expect(formatRate({ numerator: 3, denominator: 4 })).toBe('75%')
    expect(describeRate({ numerator: 3, denominator: 4 }, 'attempted calls', 'connected')).toBe(
      '3 of 4 attempted calls connected',
    )
  })
})

describe('formatDuration', () => {
  it('formats seconds and missing values', () => {
    expect(formatDuration(172)).toBe('2m 52s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(null)).toBe(EM_DASH)
  })
})

describe('timezone conversion', () => {
  it('converts wall-clock time in a zone to UTC and back', () => {
    // 7pm in Chicago in December is UTC-6.
    expect(zonedLocalToUtcIso('2026-12-11T19:00', 'America/Chicago')).toBe('2026-12-12T01:00:00.000Z')
    expect(utcIsoToZonedLocal('2026-12-12T01:00:00.000Z', 'America/Chicago')).toBe('2026-12-11T19:00')
    // July is daylight time, UTC-5.
    expect(zonedLocalToUtcIso('2026-07-04T12:00', 'America/Chicago')).toBe('2026-07-04T17:00:00.000Z')
  })

  it('rejects unparseable input', () => {
    expect(zonedLocalToUtcIso('', 'UTC')).toBeNull()
  })
})

describe('interview config', () => {
  it('accepts the default four questions', () => {
    const config = defaultInterviewConfig()
    expect(config.questions).toHaveLength(4)
    expect(validateConfig(config)).toEqual([])
  })

  it('enforces question count, prompts, duration and follow-up limits', () => {
    const config = defaultInterviewConfig()
    expect(validateConfig({ ...config, questions: [] }).map((i) => i.path)).toContain('questions')
    expect(validateConfig({ ...config, maxDurationSeconds: 30 }).map((i) => i.path)).toContain('maxDurationSeconds')
    expect(validateConfig({ ...config, maxDurationSeconds: 301 }).map((i) => i.path)).toContain('maxDurationSeconds')

    const blank = { ...config, questions: config.questions.map((q, i) => (i === 0 ? { ...q, prompt: '  ' } : q)) }
    expect(validateConfig(blank).map((i) => i.path)).toContain('questions.q_1.prompt')

    const followUps = { ...config, questions: config.questions.map((q, i) => (i === 0 ? { ...q, maxFollowUps: 3 } : q)) }
    expect(validateConfig(followUps).map((i) => i.path)).toContain('questions.q_1.maxFollowUps')

    let many = config.questions
    while (many.length <= LIMITS.maxQuestions) many = addQuestion(many)
    expect(validateConfig({ ...config, questions: many }).map((i) => i.path)).toContain('questions')
  })

  it('reorders while keeping IDs stable and order contiguous', () => {
    const { questions } = defaultInterviewConfig()
    const moved = moveQuestion(questions, 'q_3', 'up')
    expect(moved.map((q) => q.id)).toEqual(['q_1', 'q_3', 'q_2', 'q_4'])
    expect(moved.map((q) => q.order)).toEqual([1, 2, 3, 4])
    // Moving past either end is a no-op.
    expect(moveQuestion(questions, 'q_1', 'up').map((q) => q.id)).toEqual(['q_1', 'q_2', 'q_3', 'q_4'])
    expect(moveQuestion(questions, 'q_4', 'down').map((q) => q.id)).toEqual(['q_1', 'q_2', 'q_3', 'q_4'])
  })

  it('adds questions with new IDs and renumbers after removal', () => {
    const { questions } = defaultInterviewConfig()
    const added = addQuestion(questions)
    expect(added).toHaveLength(5)
    expect(new Set(added.map((q) => q.id)).size).toBe(5)
    const removed = removeQuestion(added, 'q_2')
    expect(removed.map((q) => q.order)).toEqual([1, 2, 3, 4])
    expect(removed.some((q) => q.id === 'q_2')).toBe(false)
  })

  it('detects changes', () => {
    const a = defaultInterviewConfig()
    expect(configsEqual(a, defaultInterviewConfig())).toBe(true)
    expect(configsEqual(a, { ...a, tone: 'formal' })).toBe(false)
    expect(configsEqual(a, { ...a, questions: moveQuestion(a.questions, 'q_1', 'down') })).toBe(false)
  })
})
