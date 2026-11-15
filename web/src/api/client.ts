import type {
  Analytics,
  ApplicationDetail,
  ApplicationListItem,
  ApplicationListQuery,
  DecisionInput,
  EventInput,
  EventRecord,
  InterviewConfig,
  InterviewState,
  Me,
  Role,
  DemoSignInContact,
  Page,
  FanApplication,
  FixtureFanInput,
  ActivityEvent,
  InsightsReport,
  AdminMarket,
  EsportsMatch,
  Highlights,
  MarketInput,
  Player,
  PlayerInsight,
  PlayerSchedule,
  PlayerStats,
  PointsSummary,
  PredictionMarket,
  Redemption,
  Reward,
  RewardInput,
} from './types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * One method per backend endpoint. Mutations resolve with no value on purpose:
 * screens refetch the affected resource afterwards, so what staff see as
 * "saved" is always what the backend returned on a fresh read.
 */
export interface ApiClient {
  requestMagicLink(input: { email: string; callbackURL: string; errorCallbackURL: string }): Promise<void>
  signOut(role: Role): Promise<void>
  signInFixture(role: Role, contact: DemoSignInContact): Promise<void>
  signUpFixtureFan(input: FixtureFanInput): Promise<void>
  getFanMe(): Promise<Me>
  updateFanProfile(input: { displayName: string; phone: string }): Promise<void>
  /** Fixture-only persona configuration; live mode must not implement fake auth. */
  setFixtureFan(input: FixtureFanInput): Promise<void>
  listFanEvents(): Promise<EventRecord[]>
  getFanEvent(id: string): Promise<EventRecord>
  listMyApplications(): Promise<FanApplication[]>
  getMyApplication(id: string): Promise<FanApplication>
  createFanApplication(eventId: string, consent: boolean): Promise<{ id: string }>
  requestFanCall(id: string): Promise<void>
  acceptFanInvitation(id: string): Promise<void>
  listMyActivity(): Promise<ActivityEvent[]>
  /** Fixture-only lifecycle controls; no real AI result is represented. */
  simulateFanCall(id: string, outcome: 'missed' | 'completed'): Promise<void>
  /** GET /me */
  getMe(): Promise<Me>
  /** CONFIRM (Jason): GET /admin/events — not in the documented endpoint list. */
  listAdminEvents(): Promise<EventRecord[]>
  /** CONFIRM (Jason): GET /admin/events/:id — not in the documented endpoint list. */
  getAdminEvent(id: string): Promise<EventRecord>
  /** POST /admin/events */
  createEvent(input: EventInput): Promise<EventRecord>
  /** PATCH /admin/events/:id */
  updateEvent(id: string, input: EventInput): Promise<void>
  /** GET /admin/events/:id/interview */
  getInterview(eventId: string): Promise<InterviewState>
  /** PUT /admin/events/:id/interview-draft */
  saveInterviewDraft(eventId: string, config: InterviewConfig): Promise<void>
  /** POST /admin/events/:id/interview-publish */
  publishInterview(eventId: string): Promise<void>
  /** GET /admin/applications */
  listApplications(query: ApplicationListQuery): Promise<Page<ApplicationListItem>>
  /** GET /admin/applications/:id */
  getApplication(id: string): Promise<ApplicationDetail>
  /** POST /admin/applications/:id/decision */
  postDecision(id: string, input: DecisionInput): Promise<void>
  /** POST /admin/applications/:id/attendance */
  recordAttendance(id: string): Promise<void>
  /** GET /admin/events/:id/analytics */
  getAnalytics(eventId: string): Promise<Analytics>
  /** CONFIRM (Jason): GET /admin/insights — turnout, returning fans and interview patterns across all events. */
  getInsights(): Promise<InsightsReport>

  // ----- FaZe ID. Every route below is proposed in the team docs and not built yet. -----
  /** CONFIRM (Johnny): GET /players */
  listPlayers(): Promise<Player[]>
  /** CONFIRM (Johnny): GET /players/:id */
  getPlayer(id: string): Promise<Player>
  /** CONFIRM (Johnny): GET /players/:id/stats */
  getPlayerStats(id: string): Promise<PlayerStats>
  /** CONFIRM (Johnny): GET /players/:id/matches */
  getPlayerSchedule(id: string): Promise<PlayerSchedule>
  /** CONFIRM (Johnny): GET /esports/matches — the full calendar; not in the proposed endpoint list. */
  listMatches(): Promise<EsportsMatch[]>
  /** CONFIRM (Minh): GET /players/:id/highlights */
  getPlayerHighlights(id: string): Promise<Highlights>
  /** CONFIRM (Minh): GET /players/:id/insights?snapshotId= */
  getPlayerInsight(id: string, snapshotId: string): Promise<PlayerInsight>
  /** CONFIRM (Jason): GET /me/follows — followed player IDs. */
  listFollows(): Promise<string[]>
  /** CONFIRM (Jason): PUT or DELETE /me/follows/:playerId */
  setFollow(playerId: string, following: boolean): Promise<void>
  /** CONFIRM (Jason): GET /predictions/markets — includes the signed-in fan's pick. */
  listMarkets(): Promise<PredictionMarket[]>
  /** CONFIRM (Jason): POST /predictions/markets/:id/pick */
  submitPick(marketId: string, optionId: string): Promise<void>
  /** POST /predictions/markets/:id/redeem — credits a winning pick that is still claimable. */
  redeemPrediction(marketId: string): Promise<void>
  /** POST /predictions/markets/:id/reset-demo — removes this fan's Nov 3 claim so Redeem shows again. */
  resetPredictionDemo(marketId: string): Promise<void>
  /** CONFIRM (Jason): GET /me/points */
  getMyPoints(): Promise<PointsSummary>
  /** CONFIRM (Jason): GET /rewards */
  listRewards(): Promise<Reward[]>
  /** CONFIRM (Jason): POST /rewards/:id/redeem with an Idempotency-Key header. */
  redeemReward(rewardId: string, idempotencyKey: string): Promise<void>
  /** CONFIRM (Jason): GET /me/redemptions */
  listMyRedemptions(): Promise<Redemption[]>
  /** CONFIRM (Jason): GET /admin/prediction-markets — not in the proposed endpoint list. */
  listAdminMarkets(): Promise<AdminMarket[]>
  /** CONFIRM (Jason): POST /admin/prediction-markets */
  createMarket(input: MarketInput): Promise<void>
  /** CONFIRM (Jason): POST /admin/prediction-markets/:id/settle */
  settleMarket(id: string, input: { optionId: string; sourceUrl: string }): Promise<void>
  /** CONFIRM (Jason): GET /admin/rewards — not in the proposed endpoint list. */
  listAdminRewards(): Promise<Reward[]>
  /** CONFIRM (Jason): POST /admin/rewards */
  createReward(input: RewardInput): Promise<void>
  /** POST /admin/rewards/images — stores a staff-uploaded gift photo. */
  uploadRewardImage(input: { contentType: string; dataBase64: string }): Promise<{ imageUrl: string }>
  /** CONFIRM (Jason): PATCH /admin/rewards/:id */
  updateReward(id: string, input: RewardInput): Promise<void>
  /** CONFIRM (Jason): GET /admin/redemptions — not in the proposed endpoint list. */
  listAdminRedemptions(): Promise<Redemption[]>
  /** CONFIRM (Jason): GET /admin/users/:id/points — not in the proposed endpoint list. */
  getFanPoints(userId: string): Promise<PointsSummary>
  /** CONFIRM (Jason): POST /admin/users/:id/point-adjustments */
  adjustFanPoints(userId: string, input: { delta: number; reason: string }): Promise<void>
}
