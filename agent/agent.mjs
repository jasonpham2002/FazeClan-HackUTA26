import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { STT, TTS } from '@livekit/agents-plugin-elevenlabs';
import { LLM } from '@livekit/agents-plugin-openai';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are an AI host on a FaceTime video call for an independent FaZe community-event concept. You are not a FaZe staff member and not a celebrity.
The caller sees a simple animated face. Say that you are an AI, and that answers are transcribed for event-staff review.
Ask these questions one at a time, in order, and wait for the answer:
1. What FaZe content have you enjoyed recently?
2. What made you want to attend this event?
3. What would you be most excited to do there?
4. Have you joined a FaZe event or community activity before?
Keep each reply to one or two short sentences. If the caller keeps talking, answer from what you already heard. Do not wait for a long pause. Allow skips and uncertainty. If the caller says stop, stop and tell them staff will review what was covered.
Do not promise an invitation, invent their history, or judge whether they are a real fan. End within about three minutes.`;
// Spoken as-is the moment FaceTime is ready. A model round trip is too slow:
// the phone hangs up if it hears nothing within 10 seconds.
const greeting = "Hi. I'm an AI host, and staff will review this call. Are you ready for a few questions?";

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    const caller = await ctx.waitForParticipant();

    // Video: one camera track, published by this agent. The Mac shows video only
    // from the participant that speaks, so the picture and the voice stay together.
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack('agent-video', source);
    let tick = 0, speaking = false;
    const frame = () => source.captureFrame(new VideoFrame(drawFace(tick++, speaking), WIDTH, HEIGHT, VideoBufferType.RGBA));
    frame();
    await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    const timer = setInterval(frame, 1000 / FPS);

    // Muse Spark writes the words and is sent only to api.meta.ai.
    // ElevenLabs hears the caller and speaks the reply, and that key is sent only to api.elevenlabs.io.
    const session = new voice.AgentSession({
      stt: new STT({
        apiKey: process.env.ELEVEN_API_KEY,
        model: 'scribe_v2_realtime',
        languageCode: 'en',
        // Commit a phrase after a short pause so a reply can start while they continue.
        serverVad: { minSilenceDurationMs: 400, minSpeechDurationMs: 100 },
      }),
      llm: new LLM({
        model: process.env.MUSE_MODEL || 'muse-spark-1.3',
        baseURL: 'https://api.meta.ai/v1',
        apiKey: process.env.MODEL_API_KEY,
      }),
      tts: new TTS({
        apiKey: process.env.ELEVEN_API_KEY,
        model: process.env.ELEVEN_MODEL || 'eleven_flash_v2_5',
        voiceId: process.env.ELEVEN_VOICE_ID || undefined,
        language: 'en',
      }),
      // The first seconds of a FaceTime are the caller, not speaker echo.
      aecWarmupDuration: null,
      turnHandling: {
        turnDetection: 'vad',
        endpointing: { mode: 'fixed', minDelay: 250, maxDelay: 700 },
        interruption: {
          enabled: true,
          mode: 'vad',
          discardAudioIfUninterruptible: true,
          minDuration: 200,
          minWords: 0,
        },
        preemptiveGeneration: {
          enabled: true,
          preemptiveTts: true,
          maxSpeechDuration: 20000,
        },
        // Final transcripts that keep arriving still get a cut-in.
        userTurnLimit: { maxWords: 24, maxDuration: 5000 },
      },
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { speaking = event.newState === 'speaking'; });
    ctx.addShutdownCallback(async () => {
      clearInterval(timer);
      await session.close();
      await track.close();
      await source.close();
    });
    const applicationId = applicationIdFromRoom(ctx.room.name);
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, event => {
      const text = String(event.transcript || '').trim();
      if (!event.isFinal || !text) return;
      console.log('[agent] Heard the caller');
      void publishLine(applicationId, 'you', text);
    });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, event => {
      void publishLine(applicationId, 'host', messageText(event.item));
    });
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Speak the greeting directly. generateReply waits for the text model first,
    // and the phone hangs up before that audio exists.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => {
      console.log('[agent] Speaking greeting');
      session.say(greeting, { allowInterruptions: false, addToChatCtx: true });
      void publishLine(applicationId, 'host', greeting);
    });
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

function applicationIdFromRoom(name) {
  const match = String(name || '').match(/^faze-(app_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : '';
}

function messageText(item) {
  if (!item || item.role !== 'assistant') return '';
  if (typeof item.content === 'string') return item.content;
  if (!Array.isArray(item.content)) return '';
  return item.content.map(part => (typeof part === 'string' ? part : part?.text || '')).join(' ');
}

function publishLine(applicationId, speaker, text) {
  return fetch('http://127.0.0.1:5191/transcript', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ applicationId, speaker, text }),
  }).catch(() => undefined);
}

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });
