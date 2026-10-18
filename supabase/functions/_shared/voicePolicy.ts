export type VoicePhase = 'lobby' | 'role-reveal' | 'night' | 'morning' | 'discussion' | 'voting' | 'results';

export function voicePhaseAllowsSpeaking(phase: VoicePhase, alive: boolean, muted: boolean, postGameVoice: boolean) {
  if (muted) return false;
  if (phase === 'lobby') return true;
  if (phase === 'results') return postGameVoice;
  return alive && (phase === 'discussion' || phase === 'voting');
}
