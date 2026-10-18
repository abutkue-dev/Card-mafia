import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { Room as LiveKitRoom } from 'livekit-client';
import { i18n } from './i18n';
import { supabase } from './supabaseClient';
import { voicePhaseAllowsSpeaking, type VoicePhase } from '../supabase/functions/_shared/voicePolicy';
export type { VoicePhase } from '../supabase/functions/_shared/voicePolicy';

type VoiceConnection = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type VoiceParticipant = { identity: string; name: string; speaking: boolean; microphoneOn: boolean; mutedByHost: boolean };
type VoiceContextValue = {
  connection: VoiceConnection;
  microphoneOn: boolean;
  speakerOn: boolean;
  speakingNames: string[];
  participants: VoiceParticipant[];
  error: string;
  toggleMicrophone: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  muteParticipant: (identity: string, muted: boolean) => Promise<void>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);
const tokenUrl = import.meta.env.VITE_LIVEKIT_TOKEN_URL?.trim();

const phaseAllowsVoice = (phase: VoicePhase, alive: boolean) =>
  voicePhaseAllowsSpeaking(phase, alive, false, phase === 'results');

const localizedError = (cause: unknown, fallback: string) =>
  cause instanceof Error && Object.values(i18n.voice).includes(cause.message) ? cause.message : fallback;

const participantWasMuted = (metadata?: string) => {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { mutedByHost?: boolean }).mutedByHost === true;
  } catch {
    return false;
  }
};

export function VoiceChatProvider({ roomCode, userId, phase, alive, isHost, children }: {
  roomCode: string;
  userId: string | null;
  phase: VoicePhase;
  alive: boolean;
  isHost: boolean;
  children: ReactNode;
}) {
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioElements = useRef(new Set<HTMLMediaElement>());
  const connectionAttemptRef = useRef(false);
  const lifecycleRef = useRef(0);
  const speakerOnRef = useRef(true);
  const [connection, setConnection] = useState<VoiceConnection>('disconnected');
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [canPublish, setCanPublish] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [speakingNames, setSpeakingNames] = useState<string[]>([]);
  const [error, setError] = useState('');

  const updateParticipants = useCallback((room: LiveKitRoom, active = room.activeSpeakers) => {
    setParticipants([
      {
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || room.localParticipant.identity,
        speaking: active.some((participant) => participant.identity === room.localParticipant.identity),
        microphoneOn: room.localParticipant.isMicrophoneEnabled,
        mutedByHost: participantWasMuted(room.localParticipant.metadata),
      },
      ...Array.from(room.remoteParticipants.values(), (participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        speaking: active.some((speaker) => speaker.identity === participant.identity),
        microphoneOn: participant.isMicrophoneEnabled,
        mutedByHost: participantWasMuted(participant.metadata),
      })),
    ]);
    setSpeakingNames(active.map((participant) => participant.name || participant.identity));
  }, []);

  const request = useCallback(async (action: 'token' | 'permissions' | 'mute', extra: Record<string, unknown> = {}) => {
    if (!tokenUrl || !supabase) throw new Error(i18n.voice.unavailable);
    if (!userId) throw new Error(i18n.voice.signInRequired);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(i18n.voice.signInRequired);
    const accessToken = data.session?.access_token;
    if (!accessToken || data.session?.user.id !== userId) throw new Error(i18n.voice.signInRequired);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, roomCode, ...extra }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; token?: string; serverUrl?: string; canPublish?: boolean; muted?: boolean };
    if (!response.ok) throw new Error(result.error || i18n.voice.connectionError);
    return result;
  }, [roomCode, userId]);

  const connect = useCallback(async () => {
    if (roomRef.current?.state === 'connected') return roomRef.current;
    if (connectionAttemptRef.current || roomRef.current?.state === 'connecting') {
      setConnection('connecting');
      throw new Error(i18n.voice.connecting);
    }
    connectionAttemptRef.current = true;
    const lifecycle = lifecycleRef.current;
    setError('');
    setConnection('connecting');
    try {
      const credentials = await request('token');
      if (lifecycle !== lifecycleRef.current) throw new Error(i18n.voice.connectionError);
      if (!credentials.token || !credentials.serverUrl) throw new Error(i18n.voice.connectionError);

      const { ConnectionState, Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({ adaptiveStream: true, dynacast: false });
      roomRef.current = room;
      room
        .on(RoomEvent.Reconnecting, () => setConnection('reconnecting'))
        .on(RoomEvent.Reconnected, () => { setConnection('connected'); updateParticipants(room); })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setConnection('disconnected');
          setMicrophoneOn(false);
          setCanPublish(false);
          setParticipants([]);
          setSpeakingNames([]);
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connecting) setConnection('connecting');
          if (state === ConnectionState.Connected) setConnection('connected');
          if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) setConnection('reconnecting');
          if (state === ConnectionState.Disconnected) setConnection('disconnected');
        })
        .on(RoomEvent.ActiveSpeakersChanged, (active) => updateParticipants(room, active))
        .on(RoomEvent.ParticipantConnected, () => updateParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room))
        .on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
          if (participant.identity === room.localParticipant.identity) {
            const permitted = participant.permissions?.canPublish === true;
            setCanPublish(permitted);
            if (!permitted && room.localParticipant.isMicrophoneEnabled) {
              void room.localParticipant.setMicrophoneEnabled(false).then(() => setMicrophoneOn(false));
            }
          }
          updateParticipants(room);
        })
        .on(RoomEvent.ParticipantMetadataChanged, () => updateParticipants(room))
        .on(RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach();
          element.autoplay = true;
          element.muted = !speakerOnRef.current;
          element.setAttribute('playsinline', '');
          document.body.appendChild(element);
          audioElements.current.add(element);
          updateParticipants(room);
          void element.play().catch(() => setError(i18n.voice.audioPlaybackError));
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          for (const element of track.detach()) {
            audioElements.current.delete(element);
            element.remove();
          }
          updateParticipants(room);
        })
        .on(RoomEvent.TrackMuted, () => updateParticipants(room))
        .on(RoomEvent.TrackUnmuted, () => updateParticipants(room));

      await room.connect(credentials.serverUrl, credentials.token);
      if (lifecycle !== lifecycleRef.current) {
        await room.disconnect(true);
        throw new Error(i18n.voice.connectionError);
      }
      setCanPublish(credentials.canPublish === true && phaseAllowsVoice(phase, alive));
      setConnection('connected');
      updateParticipants(room);
      return room;
    } catch (cause) {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) await room.disconnect(true);
      if (lifecycle === lifecycleRef.current) {
        setConnection('disconnected');
        setError(localizedError(cause, i18n.voice.connectionError));
      }
      throw cause;
    } finally {
      connectionAttemptRef.current = false;
    }
  }, [alive, phase, request, updateParticipants]);

  const toggleMicrophone = useCallback(async () => {
    const lifecycle = lifecycleRef.current;
    setError('');
    if (!phaseAllowsVoice(phase, alive)) { setError(i18n.voice.phaseBlocked); return; }
    if (microphoneOn) {
      const room = roomRef.current;
      if (room) await room.localParticipant.setMicrophoneEnabled(false);
      setMicrophoneOn(false);
      return;
    }
    try {
      const room = await connect();
      if (lifecycle !== lifecycleRef.current) return;
      if (!canPublish && room.state === 'connected') {
        const result = await request('permissions');
        if (lifecycle !== lifecycleRef.current) return;
        setCanPublish(result.canPublish === true);
        if (!result.canPublish) {
          setError(result.muted ? i18n.voice.mutedByHost : i18n.voice.phaseBlocked);
          return;
        }
      }
      const latestPermission = room.localParticipant.permissions?.canPublish;
      if (latestPermission === false) { setError(i18n.voice.mutedByHost); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (lifecycle !== lifecycleRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false);
        return;
      }
      setMicrophoneOn(room.localParticipant.isMicrophoneEnabled);
      updateParticipants(room);
    } catch (cause) {
      if (lifecycle !== lifecycleRef.current) return;
      const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      const message = denied ? i18n.voice.permissionDenied : localizedError(cause, i18n.voice.deviceError);
      setError(message);
    }
  }, [alive, canPublish, connect, microphoneOn, phase, request, updateParticipants]);

  const toggleSpeaker = useCallback(async () => {
    const lifecycle = lifecycleRef.current;
    const next = !speakerOn;
    speakerOnRef.current = next;
    setSpeakerOn(next);
    for (const element of audioElements.current) element.muted = !next;
    if (next) {
      try {
        const room = roomRef.current?.state === 'connected' ? roomRef.current : await connect();
        if (lifecycle !== lifecycleRef.current) return;
        await room.startAudio();
      } catch (cause) {
        if (lifecycle !== lifecycleRef.current) return;
        setError(localizedError(cause, i18n.voice.connectionError));
      }
    }
  }, [connect, speakerOn]);

  const muteParticipant = useCallback(async (identity: string, muted: boolean) => {
    setError('');
    try {
      await request('mute', { participantIdentity: identity, muted });
    } catch (cause) {
      setError(localizedError(cause, i18n.voice.connectionError));
    }
  }, [request]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || room.state !== 'connected') return;
    if (!phaseAllowsVoice(phase, alive) && room.localParticipant.isMicrophoneEnabled) {
      void room.localParticipant.setMicrophoneEnabled(false).then(() => {
        setMicrophoneOn(false);
        updateParticipants(room);
      });
    }
    void request('permissions').then((result) => {
      const permitted = result.canPublish === true && phaseAllowsVoice(phase, alive);
      setCanPublish(permitted);
      if (!permitted && room.localParticipant.isMicrophoneEnabled) {
        return room.localParticipant.setMicrophoneEnabled(false).then(() => setMicrophoneOn(false));
      }
      return undefined;
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : i18n.voice.connectionError);
    });
  }, [alive, phase, request, updateParticipants]);

  useEffect(() => () => {
    lifecycleRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    for (const element of audioElements.current) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    audioElements.current.clear();
    if (room) void room.disconnect(true);
  }, []);

  const value = useMemo(() => ({
    connection, microphoneOn, speakerOn, speakingNames, participants, error,
    toggleMicrophone, toggleSpeaker, muteParticipant,
  }), [connection, microphoneOn, speakerOn, speakingNames, participants, error, toggleMicrophone, toggleSpeaker, muteParticipant]);

  return <VoiceContext.Provider value={value}>
    <div className="voice-scope">
      {children}
      <VoiceControls location={phase === 'lobby' ? 'lobby' : 'game'} userId={userId} phase={phase} alive={alive} isHost={isHost} />
    </div>
  </VoiceContext.Provider>;
}

export function useVoiceChat() {
  return useContext(VoiceContext);
}

export function VoiceAvatarIndicator({ name }: { name: string }) {
  const voice = useVoiceChat();
  const participant = voice?.participants.find((entry) => entry.name === name);
  if (!participant) return null;
  const Icon = participant.speaking ? Mic : participant.microphoneOn ? Mic : MicOff;
  return <span className={`voice-avatar-indicator ${participant.speaking ? 'is-speaking' : participant.microphoneOn ? 'is-mic-on' : 'is-muted'}`}
    title={participant.speaking ? `${participant.name} — ${i18n.voice.speaking}` : participant.microphoneOn ? participant.name : `${participant.name} — ${i18n.voice.micClosed}`}
    aria-label={participant.speaking ? `${participant.name}: ${i18n.voice.speaking}` : participant.microphoneOn ? `${participant.name}: ${i18n.voice.micOn}` : `${participant.name}: ${i18n.voice.micClosed}`}>
    <Icon size={11} />
  </span>;
}

function VoiceControls({ location, userId, phase, alive, isHost }: {
  location: 'lobby' | 'game'; userId: string | null; phase: VoicePhase; alive: boolean; isHost: boolean;
}) {
  const voice = useVoiceChat();
  if (!voice) return null;
  const hasService = Boolean(tokenUrl);
  const statusText = voice.connection === 'connecting' ? i18n.voice.connecting
    : voice.connection === 'reconnecting' ? i18n.voice.reconnecting
      : voice.connection === 'connected' ? i18n.voice.connected : i18n.voice.disconnected;
  const canTalkInPhase = phaseAllowsVoice(phase, alive);
  const localParticipant = voice.participants.find((participant) => participant.identity === userId);
  const micDisabled = !canTalkInPhase || voice.connection === 'connecting' || !hasService;

  return <section className={`voice-dock voice-dock-${location}`} aria-label="Дуу хоолойн удирдлага">
    <div className="voice-dock-status">
      <span className={`voice-status-light status-${voice.connection}`} />
      <span>{statusText}</span>
      {voice.speakingNames.length > 0 && <b className="voice-speaking-label">{voice.speakingNames.slice(0, 2).join(', ')} {i18n.voice.speaking}</b>}
    </div>
    <div className="voice-dock-actions">
      <button type="button" className={`voice-control-button voice-mic-button ${voice.microphoneOn ? 'voice-active' : 'voice-muted'}`}
        onClick={() => void voice.toggleMicrophone()} disabled={micDisabled}
        aria-label={voice.microphoneOn ? i18n.voice.micOff : i18n.voice.micOn}
        title={voice.microphoneOn ? i18n.voice.micOff : i18n.voice.micOn}>
        {voice.connection === 'connecting' ? <LoaderCircle size={18} className="voice-spinner" /> : voice.microphoneOn ? <Mic size={18} /> : <MicOff size={18} />}
        <span>{voice.microphoneOn ? i18n.voice.micOff : i18n.voice.micOn}</span>
      </button>
      <button type="button" className={`voice-control-button voice-speaker-button ${voice.speakerOn ? '' : 'voice-muted'}`}
        onClick={() => void voice.toggleSpeaker()} aria-label={voice.speakerOn ? i18n.voice.speakerOff : i18n.voice.speakerOn}
        title={voice.speakerOn ? i18n.voice.speakerOff : i18n.voice.speakerOn}>
        {voice.speakerOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
        <span>{voice.speakerOn ? i18n.voice.speakerOff : i18n.voice.speakerOn}</span>
      </button>
    </div>
    {!canTalkInPhase && <p className="voice-hint">{i18n.voice.phaseBlocked}</p>}
    {phase === 'lobby' && !voice.microphoneOn && <p className="voice-hint">{i18n.voice.lobbyTest}</p>}
    {voice.connection === 'connected' && !voice.microphoneOn && canTalkInPhase && <p className="voice-hint">{localParticipant?.mutedByHost ? i18n.voice.mutedByHost : i18n.voice.micClosed}</p>}
    {!hasService && <p className="voice-error">{i18n.voice.serviceNotConfigured}</p>}
    {voice.error && <p className="voice-error" role="status">{voice.error}</p>}
    {voice.connection === 'connected' && voice.participants.length <= 1 && <p className="voice-hint">{i18n.voice.noParticipants}</p>}
    {isHost && voice.connection === 'connected' && voice.participants.filter((participant) => participant.identity !== userId).map((participant) =>
      <button type="button" key={participant.identity} className="voice-host-mute" onClick={() => void voice.muteParticipant(participant.identity, !participant.mutedByHost)}
        aria-label={`${participant.mutedByHost ? i18n.voice.hostUnmute : i18n.voice.hostMute}: ${participant.name}`}
        title={`${participant.mutedByHost ? i18n.voice.hostUnmute : i18n.voice.hostMute}: ${participant.name}`}>
        <MicOff size={12} /> {participant.name} · {participant.mutedByHost ? i18n.voice.hostUnmute : i18n.voice.hostMute}
      </button>)}
  </section>;
}
