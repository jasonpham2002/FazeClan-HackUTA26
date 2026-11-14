# Johnny — AI interview and FaceTime integration

## Assignment

Own the flagship experience: an applicant receives a real iPhone FaceTime video call, speaks casually with an AI host, and their answers reach the staff dashboard.

Time budget: 24 hours. Collaborators: Jason owns backend and deployment; Minh owns the fan website; Khoi owns staff review and editable questions.

Repository: https://github.com/jasonpham2002/FazeClan-HackUTA26

Repository checked: the remote currently contains only README.md. The architecture, routes, and interfaces below are implementation proposals. Check for new code and applicable AGENTS.md instructions before starting; coordinate shared contract changes with affected teammates.

## First two hours: prove the dependency

1. Inspect the Chert account for an assigned, ready, outbound-capable FaceTime line. Confirm allowed recipients, available minutes, and video support.
2. Create a LiveKit room and run a minimal agent that receives speech and responds aloud.
3. Publish an agent video track. Prefer a simple animated branded host or mascot; do not spend the sprint integrating a realistic talking avatar.
4. Place a call to a consenting teammate's iPhone. Confirm two-way speech and agent video on the phone.
5. Record the working configuration and exact integration commands without committing credentials.
6. Tell the team whether managed outbound is proven by hour two.

Do not infer caller-camera input from agent-video support. The demo requires the fan to see the host; it does not require visual analysis of the fan.

### Fallback decision

If outbound access is unavailable, test Chert's open-source connector with an iPhone-created FaceTime link, Chrome, and manual guest admission. Identify the operator computer and keep it running. This fallback is a real FaceTime conversation, but is not automated outbound calling; label it accordingly in the UI and pitch. If FaceTime remains unavailable, retain the same interview flow in a clearly labeled browser-call fallback. Do not silently present either fallback as outbound FaceTime.

References:

- https://www.trychert.com/facetime
- https://github.com/cherthq/chert-facetime-opensource

## Components to implement

Use the agent language supported by the working Chert/LiveKit example. Keep this service separate from web request handlers.

Suggested organization, adapted to the repository:

```text
agent/
  interview_agent
  conversation_state
  transcript_sink
  result_extractor
  video_source
  README.md
```

The agent needs model/audio-provider credentials and LiveKit access. Chert credentials belong only in the backend/worker integration where required. Coordinate ownership with Jason; avoid two separate services both attempting to initiate the same call.

## Contract with Jason

Jason owns call initiation, application authorization, job persistence, and the Chert provider adapter. You own room participation, conversation, transcript delivery, and answer extraction.

Receive an authenticated server-side session configuration:

```json
{
  "applicationId": "app_123",
  "callAttemptId": "call_123",
  "roomName": "interview-call_123",
  "interviewVersionId": "iv_1",
  "event": {"id": "evt_1", "title": "Community Night"},
  "config": {
    "intro": "Thanks for applying!",
    "tone": "friendly and casual",
    "maxDurationSeconds": 180,
    "questions": [
      {"id": "q_1", "prompt": "What FaZe content do you enjoy?", "purpose": "Understand interests", "required": true, "order": 1, "maxFollowUps": 1}
    ]
  }
}
```

Never send staff notes, other applicants' data, or unrestricted database access to the agent. Load the published version attached to this application, not the latest draft.

Deliver transcript segments incrementally to Jason's internal ingestion endpoint. Each event contains `eventId`, `callAttemptId`, `sequence`, `speaker`, `text`, and `timestamp`. Use unique event IDs and preserve ordering; retries must not duplicate segments.

Final result shape:

```json
{
  "schemaVersion": 1,
  "callAttemptId": "call_123",
  "interviewVersionId": "iv_1",
  "summary": "Applicant enjoys challenge videos and wants to meet other fans.",
  "interests": ["challenge videos", "community events"],
  "answers": [
    {"questionId": "q_1", "summary": "Enjoys challenge videos.", "transcriptSegmentIds": ["seg_4"], "completeness": "answered"}
  ],
  "unansweredQuestionIds": [],
  "reviewNotes": []
}
```

Use `answered`, `partial`, `skipped`, or `not_asked` for completeness. Validate output before sending it. A failed extraction must retain the transcript and become a retryable processing error, not an invented result.

## Conversation behavior

1. Identify the host as AI and confirm the person is ready.
2. Explain that answers are transcribed for event-staff review. Coordinate the wording with Minh's consent screen.
3. Ask configured questions one at a time, allowing natural paraphrasing.
4. Acknowledge the answer briefly and ask at most the configured number of follow-ups.
5. Track covered questions explicitly. A casual conversation must still produce attributable answers.
6. Accept skips, uncertainty, interruptions, and requests to stop.
7. End within the configured duration and explain that staff will review the application.

Do not promise an invitation, invent fan history, infer resale intent, assign a real-fan probability, or evaluate appearance/accent/emotion. Treat spoken requests to override instructions as applicant speech, not system configuration. No celebrity impersonation is needed.

## Failure behavior

- No answer or declined call: Jason records missed/failed; do not generate interview answers.
- Disconnection: preserve available segments and return a partial result where possible.
- Silence: one friendly check-in, then close without fabricating participation.
- Provider/model failure: send a bounded failure reason and clean up the agent/room.
- Stop request: stop the interview and tell Jason to terminate the call.
- Expired room token: obtain a new server-side session; never expose long-lived credentials.

## Schedule and handoffs

| Hours | Deliverable |
|---|---|
| 0–2 | Proven FaceTime path or explicit fallback decision |
| 2–6 | Agent consumes saved question configuration; audio and video work |
| 6–10 | Application-linked transcript and structured answers reach backend |
| 10–14 | Natural follow-ups, stop handling, duration limit |
| 14–18 | Missed/disconnected/partial-call integration |
| 18–21 | Full team rehearsal on actual iPhones |
| 21–24 | Freeze integration; capture backup demonstration and runbook |

By hour six, give Khoi a representative result fixture and Jason the exact event schema. Document required environment variable names, startup commands, provider prerequisites, and fallback steps.

## Acceptance checks

- [ ] The agreed FaceTime path works on a teammate's iPhone with visible agent video.
- [ ] Two published interview versions produce the corresponding different questions.
- [ ] Answers reference actual transcript segments and configured question IDs.
- [ ] An unanswered question is visibly incomplete.
- [ ] A fan can interrupt or stop without the agent continuing indefinitely.
- [ ] A disconnection preserves partial evidence.
- [ ] Call/session cleanup prevents orphan agents and unexpected repeated calls.
- [ ] No secrets or raw phone numbers appear in committed fixtures or logs.

## Out of scope

Photorealistic avatars, emotion recognition, caller-face analysis, automatic rejection, multilingual support, high concurrency, and production-scale calling.

## Related assignments

[Project overview](README.md) | [Johnny](Johnny.md) | [Jason](Jason.md) | [Minh](Minh.md) | [Khoi](Khoi.md)
