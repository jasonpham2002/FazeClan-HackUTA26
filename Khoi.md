# Khoi — Staff dashboard, editable interviews, and review analytics

## Assignment

Build the staff experience that makes the FaceTime call useful: configure an event interview, inspect what applicants actually said, see relevant activity, and issue Invite/Waitlist decisions.

Collaborators: Jason owns data/APIs/auth; Johnny owns the agent and result structure; Minh owns fan pages and shared styling. Deadline: 24 hours.

Repository: https://github.com/jasonpham2002/FazeClan-HackUTA26

Repository checked: the remote currently contains only README.md. The architecture, routes, and interfaces below are implementation proposals. Check for new code and applicable AGENTS.md instructions before starting; coordinate shared contract changes with affected teammates.

## Primary pitch screen

Prioritize the application detail screen. A reviewer should be able to see the event's configured questions, corresponding applicant answers, supporting transcript, activity history, and a decision panel without navigating through unrelated pages.

Use the same typography, spacing, colors, and status components as Minh. Make dense staff data readable on desktop; ensure basic tablet usability.

Suggested routes:

```text
/admin
/admin/events/:id
/admin/events/:id/interview
/admin/events/:id/applications
/admin/applications/:id
```

## Screen requirements

### 1. Event overview

Show selected event, application count, connected calls, completed interviews, pending reviews, issued invitations, and accepted invitations. Include a compact call/application funnel and a review queue.

Use Jason's aggregated values rather than counting only the current paginated list. Every rate needs a clear denominator; zero-denominator rates show an em dash or Not available.

### 2. Event editor

Support title, description, location, start date/time and timezone, capacity, application deadline, and publication status. Keep the form simple. Validate required fields, positive capacity, and sensible dates on client and server.

The event and interview publication states should be visible. Staff should know if applicants would receive a published interview or if only a draft exists.

### 3. Interview editor

Editable configuration:

- Opening greeting.
- Tone, defaulting to friendly and casual.
- Maximum duration, defaulting to 180 seconds.
- Questions with stable IDs, prompt, purpose, required flag, order, and follow-up limit.

Provide add, delete, edit, and move-up/move-down controls. Drag-and-drop is optional. Suggest four initial questions:

1. What FaZe content have you enjoyed recently?
2. What made you want to attend this event?
3. What would you be most excited to do there?
4. Have you joined a FaZe event or community activity before?

Allow fans to be new; these are conversation prompts, not an obscure-trivia exam.

Suggested frontend validation, matched by Jason: 1–6 questions, nonempty prompts, duration 60–300 seconds, follow-ups 0–2. These are proposed demo limits, not provider restrictions; agree them with Johnny and Jason.

**Save draft** and **Publish** are separate actions. Show version number, unsaved changes, and published timestamp. Publishing creates an immutable version; existing applications retain their original version. After publication, later edits start a new draft. Make that behavior visible to staff.

Optional preview: render a sample opening and question order. Do not simulate a successful real call inside this preview.

### 4. Application list

Columns: applicant, event, submission time, application status, latest call outcome, result readiness, decision. Filters: event, application status, call status, search. Provide pagination and clear loading/empty/error states.

Avoid a numerical fan-authenticity score or an AI leaderboard. Make incomplete calls and pending extraction visible rather than sorting them as weak applicants.

### 5. Application detail

Recommended layout:

```text
Applicant / event / current status / interview version

Left: Questions and answers          Right: Activity and decision
      Summary                               Recorded attendance
      Expandable transcript                 Past applications
      Call attempt history                  Invite / Waitlist
```

For each configured question show:

- The exact published question, even if the agent paraphrased it aloud.
- Answer summary.
- Completeness: answered, partial, skipped, not asked.
- Expandable supporting transcript excerpts.
- Missing evidence explicitly, rather than a fabricated summary.

Show overall interview summary, stated interests, call duration, processing status, and attempts. Let staff inspect a partial transcript if extraction failed. Use Johnny's segment references to jump to evidence.

Treat transcript and model output as untrusted text: render escaped text, not raw HTML. Distinguish agent statements from applicant statements.

### 6. Decision panel

- Two primary choices: Invite and Waitlist.
- Optional staff reason field.
- Persist through Jason's API before updating the final state.
- Show reviewer, timestamp, and previous decisions when available.
- Display capacity context and handle server conflicts.
- Keep final invitation decisions human-controlled.
- Explain that a waitlist may reflect capacity; do not label applicants fake fans.

Changing an existing decision should be deliberate and visible. Do not issue calls or notifications implicitly when a reviewer merely opens a page.

## API contracts

| Endpoint | Use |
|---|---|
| GET /me | Verify session and role |
| POST /admin/events | Create event |
| PATCH /admin/events/:id | Update event |
| GET /admin/events/:id/interview | Load draft and publication metadata |
| PUT /admin/events/:id/interview-draft | Save configuration |
| POST /admin/events/:id/interview-publish | Publish version |
| GET /admin/applications | Paginated/filtered queue |
| GET /admin/applications/:id | Profile, history, attempts, Q&A, transcript, decision |
| POST /admin/applications/:id/decision | Save invite/waitlist and reason |
| GET /admin/events/:id/analytics | Counts/rates |

Question configuration:

```json
{
  "intro": "Thanks for applying!",
  "tone": "friendly and casual",
  "maxDurationSeconds": 180,
  "questions": [
    {"id": "q_1", "prompt": "What FaZe content do you enjoy?", "purpose": "Understand interests", "required": true, "order": 1, "maxFollowUps": 1}
  ]
}
```

Agree response shapes with Jason during hour one. Ask Johnny for a representative result fixture by hour six. Build initially against explicit fixtures and replace them in the live flow; never turn an API failure into fake saved data.

Route guards improve UX, but Jason must enforce staff access on the backend. Handle 401/403 cleanly. Refreshing a detail page should reconstruct it entirely from persisted data.

## Analytics and activity semantics

Show platform-observed activity only. Separate application, invitation acceptance, and actual attendance. Every record should include source and timestamp. A new fan with no records gets No activity recorded yet, not a low engagement judgment.

Use a small funnel or bar chart only if it improves the overview. Core metrics:

- Applications received.
- Calls attempted and connected.
- Interviews completed.
- Reviews pending.
- Invitations issued and accepted.

Jason owns calculations. You own labels, readable display, denominator explanation, and clearly marking synthetic demo activity. External FaZe social engagement is not available unless separately integrated.

## Implementation order and schedule

| Hours | Deliverable |
|---|---|
| 0–2 | Shared styling with Minh; contracts with Jason; review fixture layout |
| 2–6 | Application detail shell, list, and question editor against fixtures |
| 6–10 | Live published questions and live interview-result display |
| 10–14 | Invite/waitlist decisions and event editor |
| 14–18 | Analytics, evidence links, partial-result and error states |
| 18–21 | Full rehearsal: edit question → call → review → invite |
| 21–24 | Freeze, visual polish, seeded presentation walkthrough |

## Acceptance checks

- [ ] Staff can edit, reorder, save, and publish questions without touching code.
- [ ] An application shows its pinned interview version after later edits.
- [ ] Each answer is tied to the correct question and actual transcript evidence.
- [ ] Missing answers and failed processing are clearly visible.
- [ ] Invite/waitlist survives refresh and appears on Minh's fan page.
- [ ] Historical activity is sourced; synthetic records are marked.
- [ ] Dashboard counts match Jason's persisted aggregates.
- [ ] A fan session cannot access staff data.
- [ ] Backend errors never appear as successful publication or decisions.

## Pitch handoff

Prepare one clean review example and one partial-call example. Document the staff sign-in process, event URL, interview editor URL, and application review URL. Coordinate the final demo so the team can change a question, complete the live call, open the resulting evidence, and issue an invitation in one uninterrupted walkthrough.

Out of scope: complex RBAC, automated rejection, authenticity scoring, rewards catalogs, merchandise logistics, CRM imports, and external social analytics.

## Related assignments

[Project overview](README.md) | [Johnny](Johnny.md) | [Jason](Jason.md) | [Minh](Minh.md) | [Khoi](Khoi.md)
