import assert from 'node:assert/strict';
import { voicePhaseAllowsSpeaking } from '../supabase/functions/_shared/voicePolicy.ts';

assert.equal(voicePhaseAllowsSpeaking('lobby', true, false, false), true);
assert.equal(voicePhaseAllowsSpeaking('role-reveal', true, false, true), false);
assert.equal(voicePhaseAllowsSpeaking('night', true, false, true), false);
assert.equal(voicePhaseAllowsSpeaking('morning', true, false, true), false);
assert.equal(voicePhaseAllowsSpeaking('discussion', true, false, false), true);
assert.equal(voicePhaseAllowsSpeaking('voting', true, false, false), true);
assert.equal(voicePhaseAllowsSpeaking('discussion', false, false, true), false);
assert.equal(voicePhaseAllowsSpeaking('results', false, false, true), true);
assert.equal(voicePhaseAllowsSpeaking('results', true, false, false), false);
assert.equal(voicePhaseAllowsSpeaking('lobby', true, true, true), false);

console.log('voice phase policy checks passed');
