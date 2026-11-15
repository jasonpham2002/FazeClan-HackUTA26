/**
 * Player portraits shown on the site, keyed by lower-case gamer tag so they
 * apply to both the sample roster and the sourced backend roster.
 *
 * TEMPORARY: official FaZe bodyshots as shown on HLTV's FaZe team page
 * (https://www.hltv.org/team/6667/faze), copyright HLTV.org / FaZe Clan, used
 * for the hackathon demo at the team's request. Replace with approved assets
 * (with their credit) when available. An image from the API always wins; a
 * missing file falls back to the silhouette.
 *
 * The files live under /portraits/, not /players/, because the deployed proxy sends
 * every /players/* request to the API.
 */
const PORTRAITS: Record<string, { url: string; credit: string }> = Object.fromEntries(
  ['frozen', 'twistzz', 'neityu', 'jcobbb', 'jboen'].map(handle => [
    handle,
    { url: `/portraits/player_${handle}.png`, credit: 'HLTV.org' },
  ]),
)

export function portraitFor(handle: string): { url: string; credit: string } | null {
  return PORTRAITS[handle.trim().toLowerCase()] ?? null
}
