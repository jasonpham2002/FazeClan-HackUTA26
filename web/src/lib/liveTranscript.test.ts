import { describe, expect, it } from 'vitest'
import { defaultInterviewConfig } from './interviewConfig'
import { parseLiveCall } from './liveTranscript'

const questions = defaultInterviewConfig().questions

describe('parseLiveCall', () => {
  it('puts each applicant reply under the question the host asked', () => {
    const parsed = parseLiveCall([
      { speaker: 'host', text: "Hi. I'm an AI host, and staff will review this call." },
      { speaker: 'you', text: 'Hello.' },
      { speaker: 'host', text: 'What FaZe content have you enjoyed recently?' },
      { speaker: 'you', text: 'The last clan video.' },
      { speaker: 'host', text: 'What made you want to attend this event?' },
      { speaker: 'you', text: 'I want to meet other fans.' },
    ], questions, 'call_1')

    expect(parsed.transcript).toHaveLength(6)
    expect(parsed.answers[0]).toMatchObject({
      questionId: 'q_1',
      summary: 'The last clan video.',
      completeness: 'answered',
      transcriptSegmentIds: ['live_call_1_3'],
    })
    expect(parsed.answers[1]).toMatchObject({ completeness: 'answered', summary: 'I want to meet other fans.' })
    expect(parsed.answers[2].completeness).toBe('not_asked')
    expect(parsed.answers[3].completeness).toBe('not_asked')
  })

  it('still assigns questions in order when the host paraphrases', () => {
    const parsed = parseLiveCall([
      { speaker: 'host', text: 'Hi, ready for a few questions?' },
      { speaker: 'host', text: 'Tell me what you have been watching.' },
      { speaker: 'you', text: 'Mostly the tournament streams.' },
      { speaker: 'host', text: 'And why show up for this one?' },
      { speaker: 'you', text: 'Skip.' },
    ], questions, 'call_2')

    expect(parsed.answers[0]).toMatchObject({ completeness: 'answered', summary: 'Mostly the tournament streams.' })
    expect(parsed.answers[1].completeness).toBe('skipped')
    expect(parsed.answers[1].transcriptSegmentIds).toEqual(['live_call_2_4'])
  })

  it('leaves every question unasked when the call has no lines', () => {
    const parsed = parseLiveCall([], questions, 'call_3')
    expect(parsed.transcript).toEqual([])
    expect(parsed.answers.every((answer) => answer.completeness === 'not_asked')).toBe(true)
  })
})
