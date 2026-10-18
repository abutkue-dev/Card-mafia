import assert from 'node:assert/strict';
import { i18n, translateMessage, translatePhase, translateRole } from './i18n.ts';

assert.equal(i18n.app.title, 'MAFIA: SHADOWS', 'The game title must remain unchanged.');
assert.equal(translatePhase('Role Reveal'), 'Дүр тодруулах');
assert.equal(translateRole('Detective'), 'Мөрдөгч');

assert.equal(
  translateMessage('You can only observe the simulated night.'),
  'Та хасагдсан тул энэ шөнийг ажиглана уу.',
  'Expected the simulated night observation message to be translated.'
);

assert.equal(
  translateMessage('The room is now ready.'),
  'Өрөө бэлэн боллоо.',
  'Expected the room-ready notice to be translated.'
);

for (const message of [
  'Choose a living player or Skip Vote.',
  'Eliminated players cannot vote.',
  'At least 4 players are needed to start. Add simulated players first.',
]) {
  assert.notEqual(translateMessage(message), message, `Expected "${message}" to be translated.`);
}

console.log('i18n regression checks passed');
