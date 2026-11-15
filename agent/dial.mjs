// Places one outbound FaceTime Video call to the phone on the demo profile.
// The browser sends that number here. LiveKit and Chert credentials stay in .env.local.
import { createServer } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const PORT = 5191;
const CHERT_CALLS = 'https://facetime.trychert.com/api/v1/calls';
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5189',
  'http://localhost:5189',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

function filled(value) {
  return Boolean(value) && !/^(wss:\/\/|https:\/\/)?YOUR_/.test(value);
}

function httpHost(livekitUrl) {
  const url = new URL(livekitUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireConfig() {
  const missingLiveKit = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].some(key => !filled(process.env[key]));
  const missingChert = !filled(process.env.CHERT_API_KEY) || !process.env.CHERT_API_KEY.startsWith('ftk_');
  if (!missingLiveKit && !missingChert) return;
  const parts = [];
  if (missingLiveKit) parts.push('Add the LiveKit project URL, API key, and secret in agent/.env.local.');
  if (missingChert) parts.push('Add the Chert project API key as CHERT_API_KEY in agent/.env.local. Create it under Developer, Project API keys. It starts with ftk_.');
  throw fail(503, 'CALL_NOT_CONFIGURED', parts.join(' '));
}

function roomName(applicationId, phone) {
  const bucket = Math.floor(Date.now() / 60_000);
  const raw = `faze-${applicationId}-${phone.slice(1)}-${bucket}`;
  const name = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
  if (name.length < 8) throw fail(422, 'APPLICATION_REQUIRED', 'Open an application before calling.');
  return name;
}

async function waitForAgent(rooms, room) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const participants = await rooms.listParticipants(room);
      const agent = participants.find(participant => participant.kind === ParticipantInfo_Kind.AGENT);
      if (agent?.identity) return agent.identity;
    } catch {
      // The room appears when the dispatched agent joins.
    }
    await pause(500);
  }
  throw fail(503, 'AGENT_NOT_RUNNING', 'The interview agent did not join. In the agent folder, run npm start, then try the call again.');
}

async function chertError(response) {
  const text = await response.text();
  let message = `Chert declined the call (${response.status}).`;
  try {
    const body = JSON.parse(text);
    const detail = body?.error?.message || body?.message;
    if (typeof detail === 'string' && detail.length > 0 && detail.length < 300 && !/ftk_|secret|token|api[_-]?key/i.test(detail)) {
      message = detail;
    }
  } catch {
    // Keep the generic message. The raw body can contain credentials.
  }
  return fail(response.status === 409 ? 409 : 502, 'CHERT_DECLINED', message);
}

async function placeCall(phone, applicationId) {
  requireConfig();
  const projectId = process.env.CHERT_PROJECT_ID || 'a7a842f3-9794-452a-8a43-01e7dbf9de14';
  const lineId = process.env.CHERT_LINE_ID || '05d72268-0384-45ae-ae38-a4b36e005286';
  const livekitUrl = process.env.LIVEKIT_URL;
  const host = httpHost(livekitUrl);
  const room = roomName(applicationId, phone);
  const rooms = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  const dispatch = new AgentDispatchClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  let accepted = false;
  try {
    await dispatch.createDispatch(room, process.env.AGENT_NAME || 'faze-interview');
    const identity = await waitForAgent(rooms, room);
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: `chert-bridge-${room}`.slice(0, 120),
      ttl: '30m',
    });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    const participantToken = await token.toJwt();
    const response = await fetch(CHERT_CALLS, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CHERT_API_KEY}`,
        'x-chert-project-id': projectId,
        'idempotency-key': room,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        direction: 'outbound',
        mode: 'customer_managed',
        line_id: lineId,
        destination: phone,
        destination_type: 'phone',
        media: { audio: true, video: true },
        livekit_url: livekitUrl,
        participant_token: participantToken,
        remote_participant_identity: identity,
      }),
    });
    if (!response.ok) throw await chertError(response);
    const payload = await response.json();
    const callId = payload?.data?.id;
    if (typeof callId !== 'string' || callId.length === 0) {
      throw fail(502, 'CHERT_DECLINED', 'Chert accepted the request without a call id.');
    }
    accepted = true;
    watchBridge(rooms, room, callId, projectId);
    return { callId };
  } finally {
    if (!accepted) {
      await rooms.deleteRoom(room).catch(() => undefined);
    }
  }
}

function watchBridge(rooms, room, callId, projectId) {
  const headers = {
    authorization: `Bearer ${process.env.CHERT_API_KEY}`,
    'x-chert-project-id': projectId,
  };
  void (async () => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await pause(1000);
      const response = await fetch(`${CHERT_CALLS}/${encodeURIComponent(callId)}/events`, { headers });
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const payload = await response.json();
      const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
      const bridgeReady = events.some(event => event?.type === 'bridge_ready' || event?.event_type === 'bridge_ready');
      if (bridgeReady) {
        await rooms.updateRoomMetadata(room, JSON.stringify({
          chert_call: callId,
          chert_bridge_ready: true,
          at: new Date().toISOString(),
        }));
        console.log(`[dial] FaceTime is ready for ${callId}`);
        return;
      }
      const finished = events.some(event => ['ended', 'failed', 'canceled', 'cancelled', 'declined', 'completed', 'missed'].includes(event?.type || event?.event_type));
      if (finished) {
        console.log(`[dial] ${callId} ended before the greeting`);
        return;
      }
    }
  })().catch(error => {
    console.error(`[dial] Could not watch ${callId}: ${error instanceof Error ? error.message : 'error'}`);
  });
}

const transcripts = new Map();

function addTranscript(applicationId, speaker, text) {
  const line = String(text || '').trim().slice(0, 500);
  if (!applicationId || (speaker !== 'you' && speaker !== 'host') || !line) return;
  const lines = transcripts.get(applicationId) || [];
  const last = lines.at(-1);
  if (last && last.speaker === speaker && last.text === line) return;
  lines.push({ speaker, text: line });
  transcripts.set(applicationId, lines.slice(-40));
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 4000) {
        reject(fail(413, 'BODY_TOO_LARGE', 'The call request is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url || '/', 'http://127.0.0.1:5191');
  if (request.method === 'GET' && url.pathname === '/transcript') {
    const applicationId = url.searchParams.get('applicationId') || '';
    send(response, 200, { lines: transcripts.get(applicationId) || [] });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/transcript') {
    try {
      const body = JSON.parse(await readBody(request) || '{}');
      addTranscript(String(body.applicationId || '').slice(0, 80), body.speaker, body.text);
      send(response, 204, {});
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 400;
      send(response, status, { code: 'TRANSCRIPT_REJECTED', message: 'The transcript line was not saved.' });
    }
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/call') {
    send(response, 404, { code: 'NOT_FOUND', message: 'Not found.' });
    return;
  }
  try {
    const body = JSON.parse(await readBody(request) || '{}');
    const phone = normalizePhone(body.phone);
    const applicationId = String(body.applicationId || '').slice(0, 80);
    if (!phone) throw fail(422, 'PHONE_REQUIRED', 'The demo profile needs a phone number with its country code.');
    if (!applicationId) throw fail(422, 'APPLICATION_REQUIRED', 'Open an application before calling.');
    const result = await placeCall(phone, applicationId);
    console.log(`[dial] Allocated ${result.callId} for application ${applicationId}`);
    send(response, 202, result);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const code = typeof error.code === 'string' ? error.code : 'CALL_FAILED';
    const message = error instanceof Error && error.message ? error.message : 'The call could not be placed.';
    if (status >= 500) console.error(`[dial] ${code}`);
    send(response, status, { code, message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dial] Ready on http://127.0.0.1:${PORT}/call`);
});
