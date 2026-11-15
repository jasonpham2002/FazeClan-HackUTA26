import { ApiError } from '../api/client'

const CALL_URL = 'http://127.0.0.1:5191/call'

/** Ask the local dial service to FaceTime the demo profile's number. */
export async function placeProfileCall(applicationId: string, phone: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(CALL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId, phone }),
    })
  } catch {
    throw new ApiError(503, 'CALL_SERVICE_DOWN', 'The call service is not running. From the agent folder, run npm run dial, then try again.')
  }
  const body = await response.json().catch(() => null) as { code?: string; message?: string } | null
  if (!response.ok) {
    throw new ApiError(response.status, body?.code || 'CALL_FAILED', body?.message || 'The call could not be placed.')
  }
}
