import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Clock3, Crown, Crosshair, Eye, Fingerprint,
  HeartPulse, Info, LockKeyhole, MessageCircle, Moon, Radio, Settings,
  Shield, Skull, Sun, Target, Users, Vote, X,
} from 'lucide-react';
import { roles, type Player, type RoleName } from './gameData';
import {
  createInitialGame, isMafiaAligned, markNightReady, recordVote,
  resolveNight as resolveNightEngine, resolveVoting, startNight as startNightEngine,
  submitNightAction, type GameEngineState, type PrivateGamePlayer,
  type PublicGamePlayer, type VoteChoice, type WinningTeam,
} from './gameEngine';
import { i18n, translateMessage, translatePhase, translateRole, translateTeam } from './i18n';
import { VoiceAvatarIndicator, VoiceChatProvider, type VoicePhase } from './VoiceChat';

type GameState = GameEngineState & {
  timer: number;
  timerPaused: boolean;
  nightSelection: number | null;
  chat: string[];
  chatInput: string;
  voteSelection: VoteChoice;
  voteConfirmOpen: boolean;
  privateOpen: boolean;
  leaveDialog: boolean;
  settingsOpen: boolean;
};

function createGame(players: Player[]): GameState {
  return {
    ...createInitialGame(players),
    timer: 0,
    timerPaused: false,
    nightSelection: null,
    chat: ['Violet (хиймэл тоглогч): Борооны ус бүхнийг суваг руу урсгасан.', 'Marlow (хиймэл тоглогч): Эсвэл хэн нэгэн үүнийг ингэж харахыг хүссэн байж магадгүй.'],
    chatInput: '',
    voteSelection: null,
    voteConfirmOpen: false,
    privateOpen: false,
    leaveDialog: false,
    settingsOpen: false,
  };
}

function roleInfo(name: RoleName) {
  return roles.find((item) => item.name === name)!;
}

function NightIcon({ role, size = 19 }: { role: RoleName; size?: number }) {
  const iconProps = { size, strokeWidth: 1.7 };
  if (role === 'Mafia') return <Skull {...iconProps} />;
  if (role === 'Doctor') return <HeartPulse {...iconProps} />;
  if (role === 'Detective') return <Eye {...iconProps} />;
  if (role === 'Good Informant') return <Fingerprint {...iconProps} />;
  if (role === 'Bad Informant') return <Radio {...iconProps} />;
  if (role === 'Old Lady with Shotgun') return <Crosshair {...iconProps} />;
  return <Shield {...iconProps} />;
}

function GamePlayerCard({ player, isCurrent, selected, selectable, voteCount, voteTargetName, onSelect }: {
  player: PublicGamePlayer; isCurrent: boolean; selected: boolean; selectable: boolean; voteCount?: number; voteTargetName?: string; onSelect: () => void;
}) {
  return <button type="button" className={`game-player-card ${isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''} ${!player.alive ? 'is-dead' : ''}`} onClick={onSelect} disabled={!selectable} aria-pressed={selected}>
    <span className={`avatar avatar-${player.color}`}><span>{player.initials}</span>{player.host && <i><Crown size={10} /></i>}<VoiceAvatarIndicator name={player.name} /></span>
    <span className="game-player-copy"><b>{player.name}{isCurrent && <small>ЧИ</small>}</b><span className={player.alive ? 'alive-label' : 'dead-label'}>{player.alive ? 'АМЬД' : 'ХАСАГДСАН'}</span></span>
    {voteCount !== undefined && <span className="player-vote-count">{voteCount} <small>САНАЛ</small></span>}
    {player.voteStatus === 'revealed' && <span className="player-vote-status">{player.voteTargetId === null ? 'АЛГАСАВ' : `САНАЛ ${voteTargetName ?? ''}`}</span>}
    {selectable && <Target className="game-player-target" size={14} />}
  </button>;
}

export default function GameScreen({ players, roomName, roomCode, userId, isHost, onLeave, onReturnMenu, onNotice }: {
  players: Player[]; roomName: string; roomCode: string; userId: string | null; isHost: boolean; onLeave: () => void; onReturnMenu: () => void; onNotice: (message: string) => void;
}) {
  const [game, setGame] = useState(() => createGame(players));
  const currentPlayer = game.publicPlayers.find((player) => player.id === 1)!;
  const currentSecret = game.privatePlayers[currentPlayer.id];
  const currentRole = currentSecret.role;
  const living = game.publicPlayers.filter((player) => player.alive);
  const mafiaNames = (currentRole === 'Mafia' ? currentSecret.info.mafiaTeammateIds : currentRole === 'Good Informant' ? currentSecret.info.informantMafiaIds : [])
    .map((id) => game.publicPlayers.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const isNightActionRole = currentRole === 'Mafia' || currentRole === 'Doctor' || currentRole === 'Detective';
  const selectedTarget = game.publicPlayers.find((player) => player.id === game.nightSelection);
  const voteTarget = typeof game.voteSelection === 'number' ? game.publicPlayers.find((player) => player.id === game.voteSelection) : undefined;
  const leftPlayers = game.publicPlayers.slice(0, Math.ceil(game.publicPlayers.length / 2));
  const rightPlayers = game.publicPlayers.slice(Math.ceil(game.publicPlayers.length / 2));
  const time = `${String(Math.floor(game.timer / 60)).padStart(2, '0')}:${String(game.timer % 60).padStart(2, '0')}`;
  const voicePhase: VoicePhase = game.phase === 'Role Reveal' ? 'role-reveal' : game.phase.toLowerCase() as VoicePhase;

  useEffect(() => {
    if (game.timerPaused || !['Night', 'Discussion', 'Voting'].includes(game.phase)) return;
    const timerId = window.setInterval(() => setGame((state) => ({ ...state, timer: Math.max(0, state.timer - 1) })), 1000);
    return () => window.clearInterval(timerId);
  }, [game.phase, game.round, game.timerPaused]);

  const startNight = () => {
    const next = startNightEngine(game, true);
    setGame((state) => ({ ...state, ...next, timer: 75, nightSelection: null, voteSelection: null, voteConfirmOpen: false, privateOpen: false }));
  };

  const canChooseNightTarget = (target: PublicGamePlayer) => {
    if (!target.alive || !currentPlayer.alive || game.phase !== 'Night' || game.nightResolved || currentSecret.nightAction.submitted || !isNightActionRole) return false;
    if (currentRole === 'Mafia') return !isMafiaAligned(game.privatePlayers[target.id].role);
    if (currentRole === 'Detective') return target.id !== currentPlayer.id;
    return true;
  };

  const selectNightTarget = (id: number) => {
    const target = game.publicPlayers.find((player) => player.id === id);
    if (target && canChooseNightTarget(target)) setGame((state) => ({ ...state, nightSelection: id }));
  };

  const confirmNightAction = () => {
    if (!currentPlayer.alive) return onNotice(translateMessage('Eliminated players cannot take night actions.'));
    const result = isNightActionRole
      ? game.nightSelection === null ? { state: game, error: translateMessage('Select a living target first.') } : submitNightAction(game, currentPlayer.id, game.nightSelection)
      : markNightReady(game, currentPlayer.id);
    if (result.error) return onNotice(translateMessage(result.error));
    setGame((state) => ({ ...state, ...result.state, nightSelection: null }));
  };

  const resolveNight = () => {
    const result = resolveNightEngine(game);
    if (result.error) return onNotice(translateMessage(result.error));
    setGame((state) => ({ ...state, ...result.state, timer: 0, nightSelection: null, privateOpen: false }));
  };

  const openDiscussion = () => setGame((state) => ({
    ...state,
    phase: state.winner ? 'Results' : 'Discussion',
    timer: state.winner ? 0 : 120,
    chat: state.winner ? state.chat : [...state.chat, 'Violet (хиймэл тоглогч): Сэжүүр бол нотолгоо биш, зөвхөн чиглэл заана. Та нар юу сонсов?'],
  }));

  const sendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = game.chatInput.trim().slice(0, 140);
    if (!text || !currentPlayer.alive) return;
    setGame((state) => ({ ...state, chat: [...state.chat, `${currentPlayer.name}: ${text}`], chatInput: '' }));
  };

  const openVoting = () => setGame((state) => ({ ...state, phase: 'Voting', timer: 45, voteSelection: null, voteConfirmOpen: false, voteCounts: {}, voteSummary: '', votesRevealed: false }));

  const chooseVote = (choice: VoteChoice) => {
    if (!currentPlayer.alive || game.votesRevealed || game.phase !== 'Voting') return;
    if (typeof choice === 'number' && (choice === currentPlayer.id || !game.publicPlayers.some((player) => player.id === choice && player.alive))) return;
    setGame((state) => ({ ...state, voteSelection: choice }));
  };

  const confirmVote = () => {
    if (game.votesRevealed || !currentPlayer.alive || game.voteSelection === null) return onNotice(translateMessage('Choose a living player or Skip Vote.'));
    setGame((state) => ({ ...state, voteConfirmOpen: true }));
  };

  const submitVote = () => {
    const recorded = recordVote(game, currentPlayer.id, game.voteSelection);
    if (recorded.error) return onNotice(translateMessage(recorded.error));
    const npcVoters = recorded.state.publicPlayers.filter((player) => player.alive && player.id !== currentPlayer.id);
    const availableTargets = recorded.state.publicPlayers.filter((player) => player.alive);
    const npcVotes = Object.fromEntries(npcVoters.map((voter, index) => {
      const choices = availableTargets.filter((target) => target.id !== voter.id);
      const target = choices[(index + game.round) % choices.length];
      return [voter.id, target?.id ?? 'skip'];
    }));
    const resolved = resolveVoting(recorded.state, npcVotes);
    if (resolved.error) return onNotice(translateMessage(resolved.error));
    setGame((state) => ({ ...state, ...resolved.state, timer: 0, voteSelection: null, voteConfirmOpen: false }));
  };

  const resolveDeadPlayerVote = () => {
    const npcVoters = game.publicPlayers.filter((player) => player.alive);
    const availableTargets = game.publicPlayers.filter((player) => player.alive);
    const npcVotes = Object.fromEntries(npcVoters.map((voter, index) => {
      const choices = availableTargets.filter((target) => target.id !== voter.id);
      return [voter.id, choices[(index + game.round) % choices.length]?.id ?? 'skip'];
    }));
    const resolved = resolveVoting(game, npcVotes);
    if (resolved.error) return onNotice(translateMessage(resolved.error));
    setGame((state) => ({ ...state, ...resolved.state, timer: 0 }));
  };

  const nextNight = () => {
    if (game.winner) return setGame((state) => ({ ...state, phase: 'Results', timer: 0 }));
    startNight();
  };

  const replay = () => setGame(createGame(players));
  const canSelectForVote = (player: PublicGamePlayer) => game.phase === 'Voting' && !game.votesRevealed && currentPlayer.alive && player.alive && player.id !== currentPlayer.id;
  const publicVoteCount = (playerId: number) => game.voteCounts[String(playerId)];
  const voteName = (playerId: number) => game.publicPlayers.find((player) => player.id === playerId)?.name;
  const privateNames = (ids: number[]) => ids.map((id) => game.publicPlayers.find((player) => player.id === id)?.name).filter((name): name is string => Boolean(name));

  if (game.phase === 'Results') return <VoiceChatProvider roomCode={roomCode} userId={userId} phase={voicePhase} alive={currentPlayer.alive} isHost={isHost}><ResultsScreen game={game} roomName={roomName} onReplay={replay} onMenu={onReturnMenu} /></VoiceChatProvider>;

  return <VoiceChatProvider roomCode={roomCode} userId={userId} phase={voicePhase} alive={currentPlayer.alive} isHost={isHost}><div className={`core-game ${game.phase === 'Night' ? 'is-night' : ''}`}>
    <header className="core-game-topbar">
      <div className="round-label"><span>{i18n.game.round}</span><strong>{String(game.round).padStart(2, '0')}</strong></div>
      <div className={`current-phase phase-${game.phase.toLowerCase().replace(' ', '-')}`}><span>{translatePhase(game.phase)}</span></div>
      <div className="demo-timer"><Clock3 size={14} /><strong>{time}</strong><small>{i18n.game.demo}</small></div>
      <div className="game-top-actions"><button className="game-icon-button" onClick={() => setGame((state) => ({ ...state, settingsOpen: true }))} aria-label="Тоглоомын тохиргоо" title="Тоглоомын тохиргоо"><Settings size={16} /></button><button className="game-leave-button" onClick={() => setGame((state) => ({ ...state, leaveDialog: true }))}><ArrowLeft size={14} /> {i18n.game.leaveGame.toUpperCase()}</button></div>
    </header>

    {game.phase === 'Role Reveal' ? <RoleReveal player={currentPlayer} secret={currentSecret} privateNames={privateNames} roomName={roomName} onContinue={startNight} /> : <>
      <div className="core-game-board">
        <aside className="game-player-list game-player-list-left"><div className="game-list-heading">{i18n.game.table} <span>{String(game.publicPlayers.length).padStart(2, '0')}</span></div>{leftPlayers.map((player) => <GamePlayerCard key={player.id} player={player} isCurrent={player.id === currentPlayer.id} selected={game.phase === 'Night' ? game.nightSelection === player.id : game.voteSelection === player.id} selectable={game.phase === 'Night' ? canChooseNightTarget(player) : canSelectForVote(player)} voteCount={game.votesRevealed ? publicVoteCount(player.id) : undefined} voteTargetName={player.voteTargetId === null ? undefined : voteName(player.voteTargetId)} onSelect={() => game.phase === 'Night' ? selectNightTarget(player.id) : chooseVote(player.id)} />)}</aside>
        <section className="crime-stage">
          <div className="crime-stage-art" aria-hidden="true"><div className="crime-window" /><div className="crime-light" /><div className="crime-table" /></div>
          <div className="crime-stage-label"><span><i /> {roomName.toUpperCase()}</span><span>{i18n.game.localDemo.toUpperCase()} <b>•</b> {i18n.game.notSharedOnline}</span></div>
          {game.phase === 'Night' && <NightPanel round={game.round} player={currentPlayer} secret={currentSecret} mafiaNames={mafiaNames} selectedTarget={selectedTarget} nightSelection={game.nightSelection} isNightActionRole={isNightActionRole} onConfirm={confirmNightAction} onCancel={() => setGame((state) => ({ ...state, nightSelection: null }))} onResolve={resolveNight} />}
          {game.phase === 'Morning' && <MorningPanel round={game.round} report={game.morningReport} winner={game.winner} onContinue={openDiscussion} />}
          {game.phase === 'Discussion' && <DiscussionPanel round={game.round} chat={game.chat} chatInput={game.chatInput} canChat={currentPlayer.alive} onInput={(chatInput) => setGame((state) => ({ ...state, chatInput }))} onSubmit={sendChat} onVote={openVoting} onPrivate={() => setGame((state) => ({ ...state, privateOpen: !state.privateOpen }))} />}
          {game.phase === 'Voting' && <VotingPanel round={game.round} publicPlayers={game.publicPlayers} voteSelection={game.voteSelection} privateVote={currentSecret.vote} voteConfirmOpen={game.voteConfirmOpen} votesRevealed={game.votesRevealed} voteCounts={game.voteCounts} voteSummary={game.voteSummary} winner={game.winner} player={currentPlayer} voteTarget={voteTarget} onSkip={() => chooseVote('skip')} onReview={confirmVote} onSubmit={submitVote} onCancel={() => setGame((state) => ({ ...state, voteConfirmOpen: false, voteSelection: null }))} onResolveDead={resolveDeadPlayerVote} onNext={nextNight} />}
          <div className="public-event-log"><span><Info size={11} /> {i18n.game.messages.publicLogs}</span>{game.publicEventLog.slice(-2).map((entry, index) => <p key={`${entry}-${index}`}>{translateMessage(entry)}</p>)}</div>
        </section>
        <aside className="game-player-list game-player-list-right"><div className="game-list-heading">{i18n.game.stillInIt} <span>{String(living.length).padStart(2, '0')}</span></div>{rightPlayers.map((player) => <GamePlayerCard key={player.id} player={player} isCurrent={player.id === currentPlayer.id} selected={game.phase === 'Night' ? game.nightSelection === player.id : game.voteSelection === player.id} selectable={game.phase === 'Night' ? canChooseNightTarget(player) : canSelectForVote(player)} voteCount={game.votesRevealed ? publicVoteCount(player.id) : undefined} voteTargetName={player.voteTargetId === null ? undefined : voteName(player.voteTargetId)} onSelect={() => game.phase === 'Night' ? selectNightTarget(player.id) : chooseVote(player.id)} />)}<button className="private-info-button" onClick={() => setGame((state) => ({ ...state, privateOpen: !state.privateOpen }))}><LockKeyhole size={13} /> {i18n.game.privateInfo}</button></aside>
      </div>
      <div className="core-game-bottom"><div className="phase-caption"><span>{game.phase === 'Night' ? <Moon size={12} /> : game.phase === 'Morning' ? <Sun size={12} /> : game.phase === 'Voting' ? <Vote size={12} /> : <MessageCircle size={12} />}{translatePhase(game.phase)}</span><small>{phaseHint(game, currentPlayer)}</small></div><div className="bottom-local-note"><Users size={12} /> {i18n.game.localDemo} · {i18n.game.notSharedOnline}</div></div>
    </>}

    {game.privateOpen && <PrivateInfoPanel player={currentPlayer} secret={currentSecret} mafiaNames={mafiaNames} publicNames={privateNames} onClose={() => setGame((state) => ({ ...state, privateOpen: false }))} />}
    {game.leaveDialog && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="leave-game-title"><div className="modal-symbol"><ArrowLeft size={18} /></div><h2 id="leave-game-title">Энэ тоглоомоос гарах уу?</h2><p>Таны туршилтын ээлж дуусна. Та лобби руу буцаж дахин эхлүүлж болно.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setGame((state) => ({ ...state, leaveDialog: false }))}>ҮЛДЭХ</button><button className="primary-button" onClick={onLeave}>ТОГЛООМООС ГАРАХ</button></div></section></div>}
    {game.settingsOpen && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"><div className="modal-symbol"><Settings size={18} /></div><h2 id="game-settings-title">Тоглоомын тохиргоо</h2><p>Туршилтын цаг үеийг автоматаар солихгүй. Бэлэн үедээ үеийн удирдлагыг ашиглана уу.</p><button className="secondary-button timer-toggle" onClick={() => setGame((state) => ({ ...state, timerPaused: !state.timerPaused }))}>{game.timerPaused ? 'ЦАГИЙГ ҮРГЭЛЖЛҮҮЛЭХ' : 'ЦАГИЙГ ЗОГСООХ'}</button><div className="modal-actions"><button className="primary-button" onClick={() => setGame((state) => ({ ...state, settingsOpen: false }))}>ТОГЛООМ ҮРГЭЛЖЛҮҮЛЭХ</button></div></section></div>}
  </div></VoiceChatProvider>;
}

function phaseHint(game: GameState, currentPlayer: PublicGamePlayer) {
  if (game.phase === 'Night') return currentPlayer.alive ? 'Үйлдлээ сонгоод шөнийг шийднэ үү.' : translateMessage('You can only observe the simulated night.');
  if (game.phase === 'Morning') return `${game.publicPlayers.filter((player) => player.alive).length} тоглогч амьд үлдсэн.`;
  if (game.phase === 'Discussion') return 'Сэжүүрийг ярилц. Хувийн мэдээлэл хувийн хэвээр үлдэнэ.';
  if (game.phase === 'Voting') return game.votesRevealed ? 'Туршилтын санал хураалт дууслаа.' : 'Амьд тоглогч сонгох эсвэл саналаа алгасах боломжтой.';
  return 'Таны дүр болон мэдээлэл хувийн хэвээр байна.';
}

function RoleReveal({ player, secret, privateNames, roomName, onContinue }: { player: PublicGamePlayer; secret: PrivateGamePlayer; privateNames: (ids: number[]) => string[]; roomName: string; onContinue: () => void }) {
  const role = roleInfo(secret.role);
  const RoleIcon = role.icon;
  const roleSecret = secret.role === 'Mafia' ? `Таны мафийн хамтрагчид: ${privateNames(secret.info.mafiaTeammateIds).join(', ') || 'байхгүй'}.` : secret.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${privateNames(secret.info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}.` : secret.role === 'Bad Informant' ? translateMessage(secret.info.badInformantObjective) : '';
  return <main className="role-reveal-screen"><div className="reveal-backdrop"><div className="reveal-moon" /><div className="reveal-city" /></div><div className="reveal-heading"><span>ЭЭЛЖ 01 <i>•</i> {roomName.toUpperCase()}</span><h1>Хот <em>шийдвэрээ гаргалаа.</em></h1><p>{player.name}, таны дүр нууц. Бусад тоглогчийн дүр мөн нууц хэвээр байна.</p></div><article className={`reveal-role-card team-${role.team}`}><div className="reveal-card-art"><div className="reveal-ring" /><RoleIcon size={36} strokeWidth={1.4} /><span>НУУЦ</span></div><div className="reveal-card-copy"><span className={`team-tag ${role.team}`}>{translateTeam(role.team).toUpperCase()} {i18n.game.messages.specialAbility.toUpperCase()}</span><h2>{translateRole(role.name)}</h2><p>{role.description}</p>{roleSecret && <div className="role-reveal-secret"><LockKeyhole size={12} />{roleSecret}</div>}<div className="reveal-private-note"><LockKeyhole size={13} /><span>Энэ картыг зөвхөн та харах боломжтой.</span></div></div></article><button className="primary-button reveal-continue" onClick={onContinue}>ШӨНИЙН ҮЙЛДЭЛД ШИЛЖИХ <ChevronRight size={16} /></button><span className="reveal-simulated"><Users size={12} /> Энэ бол хиймэл тоглогчидтой туршилт. Онлайн тоглолтод хувийн мэдээллийг серверээр хамгаална.</span></main>;
}

function NightPanel({ round, player, secret, mafiaNames, selectedTarget, nightSelection, isNightActionRole, onConfirm, onCancel, onResolve }: {
  round: number; player: PublicGamePlayer; secret: PrivateGamePlayer; mafiaNames: string[]; selectedTarget?: PublicGamePlayer; nightSelection: number | null; isNightActionRole: boolean;
  onConfirm: () => void; onCancel: () => void; onResolve: () => void;
}) {
  const isAlive = player.alive;
  const role = secret.role;
  const targetVerb = role === 'Mafia' ? 'Мафийн зорилт сонгоно уу.' : role === 'Doctor' ? 'Шөнө хамгаалах тоглогчоо сонгоно уу.' : role === 'Detective' ? 'Шалгах тоглогчоо сонгоно уу.' : 'Таны дүрт идэвхтэй шөнийн үйлдэл байхгүй.';
  const actionSubmitted = secret.nightAction.submitted;
  const privateResult = role === 'Detective' ? translateMessage(secret.info.investigationResult) : role === 'Doctor' ? translateMessage(secret.info.protectionResult) : '';
  return <div className="phase-panel night-panel"><div className="phase-panel-heading"><span className="night-panel-icon"><Moon size={17} /></span><div><small>ШӨНӨ {round} · ХУВИЙН ҮЙЛДЭЛ</small><h2>{isAlive ? translateRole(role) : 'Шөнө бууж ирлээ'}</h2></div></div>{!isAlive ? <p>Та хасагдсан тул шөнийн үйлдэл хийх боломжгүй.</p> : <><p>{isNightActionRole ? targetVerb : 'Таны дүрд зорилтот үйлдэл байхгүй. Хувийн мэдээлэл бэлэн.'}</p>{role === 'Good Informant' && <div className="night-secret"><LockKeyhole size={12} /> Таны хувийн сэжүүр: {mafiaNames.join(', ') || 'Идэвхтэй мафийн гишүүн алга.'}</div>}{role === 'Bad Informant' && <div className="night-secret"><LockKeyhole size={12} /> {translateMessage(secret.info.badInformantObjective)}</div>}{role === 'Old Lady with Shotgun' && <div className="night-secret"><Crosshair size={12} /> Тусгай чадвар: мафи тан руу халдвал буугаар хариу довтолж болно.</div>}{role === 'Citizen' && <div className="night-secret"><Shield size={12} /> Тусгай шөнийн үйлдэл байхгүй. Өглөөний тайланг анхаараарай.</div>}{privateResult && <div className="action-locked"><LockKeyhole size={12} /> {privateResult}</div>}{actionSubmitted && <div className="action-locked"><Check size={13} /> Шөнийн үйлдэл баталгаажсан{selectedTarget ? ` · ${selectedTarget.name}` : ''}</div>}{!actionSubmitted && isNightActionRole && <div className="night-target-hint"><Target size={12} /> {selectedTarget ? `Сонгосон: ${selectedTarget.name}` : 'Амьд тоглогчийн картыг товшоод зорилт сонгоно уу.'}</div>}</>}
    <div className="phase-panel-actions">{!actionSubmitted && isAlive && <><button className="secondary-button" onClick={onCancel} disabled={nightSelection === null}>БОЛИХ</button><button className="primary-button" onClick={onConfirm}>{isNightActionRole ? 'ҮЙЛДЭЛ БАТЛАХ' : 'ӨГЛӨӨНД БЭЛЭН'} <Check size={14} /></button></>}{actionSubmitted && <button className="primary-button" onClick={onResolve}>ШӨНИЙГ ШИЙДЭХ <ChevronRight size={15} /></button>}{!isAlive && <button className="primary-button" onClick={onResolve}>ДЕМО ШӨНИЙГ ШИЙДЭХ <ChevronRight size={15} /></button>}</div>
  </div>;
}

function MorningPanel({ round, report, winner, onContinue }: { round: number; report: string; winner: WinningTeam; onContinue: () => void }) {
  const headline = report.includes('No Mafia attack') ? 'Шөнө тайван өнгөрлөө.' : report.includes('shotgun answered') ? 'Харанхуйд буун дуу гарав.' : report.includes('No one was eliminated') || report.includes('stopped') ? 'Халдлага няцаагдлаа.' : 'Бие олдлоо.';
  return <div className="phase-panel morning-panel"><div className="morning-seal"><Sun size={21} /></div><div className="morning-kicker">ӨГЛӨӨНИЙ ТАЙЛАН · ЭЭЛЖ {round}</div><h2>{headline}</h2><p className="morning-report-text">{translateMessage(report)}</p><div className="clue-disclaimer"><Info size={13} /> Сэжүүр нь нотлох баримт биш, зөвхөн заалт юм.</div><button className="primary-button" onClick={onContinue}>{winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ХЭЛЭЛЦҮҮЛЭГ НЭЭХ'} <ChevronRight size={15} /></button></div>;
}

function DiscussionPanel({ round, chat, chatInput, canChat, onInput, onSubmit, onVote, onPrivate }: {
  round: number; chat: string[]; chatInput: string; canChat: boolean; onInput: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onVote: () => void; onPrivate: () => void;
}) {
  return <div className="phase-panel discussion-panel"><div className="discussion-head"><div><small>ӨДӨР {round} · ХОТЫН ЧАТ</small><h2>Юу харсан бэ?</h2></div><span className="chat-sim-tag"><Users size={11} /> ТУРШИЛТЫН</span></div><div className="discussion-messages" aria-live="polite">{chat.slice(-4).map((message, index) => <p key={`${message}-${index}`} className={message.startsWith('Violet') || message.startsWith('Marlow') || message.startsWith('Rook') ? 'simulated-message' : ''}>{message}</p>)}</div><form className="discussion-form" onSubmit={onSubmit}><input value={chatInput} onChange={(event) => onInput(event.target.value)} placeholder={canChat ? 'Түүхээ тайлбарла…' : 'Та хасагдсан тул бичих боломжгүй'} aria-label="Орон нутгийн туршилтын чатын зурвас" maxLength={140} disabled={!canChat} /><button type="submit" aria-label="Зурвас илгээх" disabled={!canChat}><ChevronRight size={16} /></button></form><div className="discussion-actions"><button className="secondary-button" onClick={onPrivate}><LockKeyhole size={13} /> НУУЦ МЭДЭЭЛЭЛ</button><button className="primary-button" onClick={onVote}>САНАЛ ХУРААЛТ НЭЭХ <Vote size={14} /></button></div></div>;
}

function VotingPanel({ round, publicPlayers, voteSelection, privateVote, voteConfirmOpen, votesRevealed, voteCounts, voteSummary, winner, player, voteTarget, onSkip, onReview, onSubmit, onCancel, onResolveDead, onNext }: {
  round: number; publicPlayers: PublicGamePlayer[]; voteSelection: VoteChoice; privateVote: PrivateGamePlayer['vote']; voteConfirmOpen: boolean; votesRevealed: boolean;
  voteCounts: Record<string, number>; voteSummary: string; winner: WinningTeam; player: PublicGamePlayer; voteTarget?: PublicGamePlayer;
  onSkip: () => void; onReview: () => void; onSubmit: () => void; onCancel: () => void; onResolveDead: () => void; onNext: () => void;
}) {
  const totals = Object.entries(voteCounts).sort((left, right) => right[1] - left[1]);
  const submittedVote = privateVote.choice;
  const submittedName = typeof submittedVote === 'number' ? publicPlayers.find((candidate) => candidate.id === submittedVote)?.name : undefined;
  return <div className="phase-panel voting-panel"><div className="discussion-head"><div><small>ӨДӨР {round} · ЭЦСИЙН САНАЛ</small><h2>{votesRevealed ? 'Хот шийдвэрээ гаргалаа.' : 'Сэжүүрээ хэлээрэй.'}</h2></div><Vote size={19} /></div>
    {!votesRevealed ? <>{player.alive ? <><p>Өөрөөсөө бусад амьд тоглогчийг сонгох эсвэл саналаа алгасана уу. Тоглогч бүр нэг санал өгнө.</p><div className="vote-choices"><button className={`skip-vote ${voteSelection === 'skip' ? 'chosen' : ''}`} onClick={onSkip}><ArrowLeft size={13} /> САНАЛ АЛГАСАХ</button><span>{voteTarget ? `Сонгосон: ${voteTarget.name}` : voteSelection === 'skip' ? 'Сонгосон: Санал алгасах' : 'Үргэлжлүүлэхийн тулд тоглогч сонгоно уу.'}</span></div><button className="primary-button" onClick={onReview} disabled={voteSelection === null}>САНАЛЫГ ХЯНАХ <ChevronRight size={15} /></button></> : <><p>Та хасагдсан тул санал өгөх боломжгүй. Хиймэл тоглогчид санал хураалтыг дуусгана.</p><button className="primary-button" onClick={onResolveDead}>ТУРШИЛТЫН САНАЛЫГ ШИЙДЭХ <ChevronRight size={15} /></button></>}</> : <><p className="vote-summary">{translateMessage(voteSummary)}</p><p className="your-vote-status">ТАНЫ САНАЛ · {submittedVote === 'skip' ? 'АЛГАСАХ' : submittedName ?? 'ӨГӨӨГҮЙ'}</p><div className="vote-count-list">{totals.map(([key, count]) => <div key={key}><span>{key === 'skip' ? 'САНАЛ АЛГАСАХ' : publicPlayers.find((candidate) => candidate.id === Number(key))?.name ?? 'Үл мэдэгдэх'}</span><b>{count}</b></div>)}</div><button className="primary-button" onClick={onNext}>{winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ДАРААХ ШӨНӨ'} <ChevronRight size={15} /></button></>}
    {voteConfirmOpen && !votesRevealed && player.alive && <div className="vote-confirm-card"><div><small>САНАЛАА БАТЛАХ</small><p>{voteSelection === 'skip' ? 'Энэ саналыг алгасах уу?' : `Энэ тоглогчийг хасах санал өгөх үү? ${voteTarget?.name ?? 'энэ тоглогч'}?`}</p></div><div><button className="secondary-button" onClick={onCancel}>БОЛИХ</button><button className="primary-button" onClick={onSubmit}>САНАЛ ИЛГЭЭХ <Check size={13} /></button></div></div>}
  </div>;
}

function PrivateInfoPanel({ player, secret, mafiaNames, publicNames, onClose }: { player: PublicGamePlayer; secret: PrivateGamePlayer; mafiaNames: string[]; publicNames: (ids: number[]) => string[]; onClose: () => void }) {
  const role = roleInfo(secret.role);
  const info = secret.info;
  const isMafia = isMafiaAligned(secret.role);
  const privateRoleMessage = secret.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${publicNames(info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}` : '';
  return <aside className="game-private-panel" aria-label="Нууц дүрийн мэдээлэл"><header><span><LockKeyhole size={12} /> ЗӨВХӨН {player.name.toUpperCase()} ҮҮНИЙГ ХАРАХ БОЛОМЖТОЙ</span><button onClick={onClose} aria-label="Нууц мэдээлэл хаах"><X size={15} /></button></header><div className="private-game-role"><span className={`private-game-icon team-${role.team}`}><NightIcon role={role.name} /></span><div><small>ТАНЫ ДҮР</small><b>{translateRole(role.name)}</b></div></div><p>{role.description}</p>{secret.role === 'Mafia' && <div className="private-secret-line"><b>МАФИЙН ХАМТРАГЧИД</b><span>{mafiaNames.join(', ') || 'Та цорын ганц идэвхтэй мафийн гишүүн байна.'}</span></div>}{privateRoleMessage && <div className="private-secret-line"><b>ХУВИЙН СЭЖҮҮР</b><span>{privateRoleMessage}</span></div>}{secret.role === 'Bad Informant' && <div className="private-secret-line"><b>НУУЦ ЗОРИЛГО</b><span>{translateMessage(info.badInformantObjective)}</span></div>}{info.investigationResult && <div className="private-secret-line"><b>ШАЛГАЛТ · ХУВИЙН</b><span>{translateMessage(info.investigationResult)}</span></div>}{info.protectionResult && <div className="private-secret-line"><b>ХАМГААЛАЛТ · ХУВИЙН</b><span>{translateMessage(info.protectionResult)}</span></div>}{info.traceExplanation && !isMafia && <div className="private-trace-card"><span><Fingerprint size={13} /> ТАНЫ ХУВИЙН СЭЖҮҮРИЙН ТАЙЛБАР</span><p>{translateMessage(info.traceExplanation)}</p><small>Энэ картыг хувийн байлга. Хэлэлцүүлэг үед чанга дуугаар тайлбарлаж болно.</small></div>}{!info.investigationResult && !info.protectionResult && !info.traceExplanation && !privateRoleMessage && !info.badInformantObjective && <div className="private-no-trace">Одоогоор нэмэлт хувийн мэдээлэл байхгүй.</div>}</aside>;
}

function ResultsScreen({ game, roomName, onReplay, onMenu }: { game: GameState; roomName: string; onReplay: () => void; onMenu: () => void }) {
  const winningTeam = game.winner ?? 'Citizens';
  const headline = winningTeam === 'Citizens' ? i18n.game.results.citizensWin : winningTeam === 'Mafia' ? i18n.game.results.mafiaWin : i18n.game.results.draw;
  return <main className="game-results-screen"><div className="results-glow" /><div className="results-heading"><span>ЭЭЛЖ {String(game.round).padStart(2, '0')} · {roomName.toUpperCase()}</span><h1>{headline}</h1><p>{i18n.game.results.shadowsRecede}</p></div><div className="results-player-list">{game.publicPlayers.map((player) => { const role = roleInfo(game.privatePlayers[player.id].role); return <div className={`results-player ${!player.alive ? 'is-dead' : ''}`} key={player.id}><span className={`avatar avatar-${player.color}`}><span>{player.initials}</span><VoiceAvatarIndicator name={player.name} /></span><span className="results-name">{player.name}{player.id === 1 && <small>ЧИ</small>}</span><span className={`team-tag ${role.team}`}>{translateRole(role.name)}</span><span className="results-status">{player.alive ? 'АМЬД' : 'ХАСАГДСАН'}</span></div>; })}</div><div className="results-actions"><button className="secondary-button" onClick={onMenu}><ArrowLeft size={14} /> {i18n.game.results.mainMenu}</button><button className="primary-button" onClick={onReplay}>{i18n.game.results.playAgain} <ChevronRight size={15} /></button></div><div className="results-simulated"><Users size={12} /> Энэ табын туршилтын үр дүн · онлайн тоглогч байхгүй</div></main>;
}