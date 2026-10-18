import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Clipboard, Crown, LockKeyhole, MessageCircle, Moon,
  Radio, Settings as SettingsIcon, Shield, Skull, Target, UserRound, Users, WandSparkles,
} from 'lucide-react';
import { roles, type Player } from './gameData';
import GameScreen from './Game';
import Auth, { type AuthView } from './Auth';
import { LeaderboardScreen, ProfileScreen, RankScreen } from './AccountScreens';
import { supabase, supabaseConfigured, type PublicProfile, type RatingChange } from './supabaseClient';
import { i18n, translateMessage, translateRole, translateRoleDescription } from './i18n';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';

type Screen = 'menu' | 'create-room' | 'join-room' | 'lobby' | 'game' | 'roles' | 'profile' | 'rank' | 'leaderboard' | 'settings' | 'auth';

type GameRoom = { name: string; maxPlayers: number; isPrivate: boolean; password: string; players: Player[] };
const startingPlayers: Player[] = [
  { id: 1, name: 'Та', initials: 'ТА', color: 'rose', host: true, ready: false },
  { id: 2, name: 'Violet', initials: 'VI', color: 'violet', ready: true },
  { id: 3, name: 'Marlow', initials: 'MA', color: 'gold', ready: true },
  { id: 4, name: 'Rook', initials: 'RO', color: 'teal', ready: true },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [authView, setAuthView] = useState<AuthView>('sign-in');
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingChange[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomCode, setRoomCode] = useState('NIGHT-7X');
  const [rooms, setRooms] = useState<Record<string, GameRoom>>({
    'NIGHT-7X': { name: 'Блэкуотерын туршилтын өрөө', maxPlayers: 8, isPrivate: true, password: '', players: startingPlayers },
  });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    const client = supabase;
    let active = true;
    const restoreAccount = async (id: string) => {
      setAccountLoading(true);
      setProfileError('');
      setHistoryError('');
      const [profileResult, historyResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', id).maybeSingle(),
        client.from('rating_changes').select('id,match_id,outcome,rp_change,rank_points_before,rank_points_after,previous_rank,new_rank,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      ]);
      if (!active) return;
      if (profileResult.error) setProfileError(i18n.account.profileLoadFailed);
      else setProfile(profileResult.data as PublicProfile | null);
      if (historyResult.error) {
        setHistoryError(i18n.account.ratingHistoryLoadFailed);
        setRatingHistory([]);
      } else setRatingHistory((historyResult.data ?? []) as RatingChange[]);
      setAccountLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      setUserId(id);
      if (!id) {
        setProfile(null);
        setRatingHistory([]);
        setAccountLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        window.setTimeout(() => { if (active) void restoreAccount(id); }, 0);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset-password');
        setScreen('auth');
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2600);
  };

  const activeRoom = rooms[roomCode];

  const updateActiveRoom = (updates: Partial<GameRoom>) => {
    setRooms((current) => ({ ...current, [roomCode]: { ...current[roomCode], ...updates } }));
  };

  const openDemoLobby = () => {
    setRoomCode('NIGHT-7X');
    setScreen('lobby');
  };

  const createRoom = (room: Omit<GameRoom, 'players'>) => {
    let code = '';
    do {
      code = `MAF-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    } while (rooms[code]);
    setRooms((current) => ({ ...current, [code]: { ...room, players: startingPlayers } }));
    setRoomCode(code);
    setScreen('lobby');
    notify(`${i18n.app.roomReady} ${code}`);
  };

  const joinRoom = (codeInput: string, passwordInput: string) => {
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}-[A-Z0-9]{2,4}$/.test(code)) return translateMessage('Enter a room code in the format NIGHT-7X.');
    const room = rooms[code];
    if (!room) return translateMessage('No demo room has that code. Try NIGHT-7X or create a room in this tab.');
    if (room.password && room.password !== passwordInput) return translateMessage('That room password does not match.');
    setRoomCode(code);
    setScreen('lobby');
    return '';
  };

  const toggleReady = () => {
    const host = activeRoom.players.find((player) => player.id === 1);
    if (!host) return;
    updateActiveRoom({ players: activeRoom.players.map((player) => player.id === 1 ? { ...player, ready: !player.ready } : player) });
  };

  const addSimulatedPlayer = () => {
    if (activeRoom.players.length >= activeRoom.maxPlayers) return notify(translateMessage('This room is full.'));
    const names = ['June', 'Silas', 'Mina', 'Ezra', 'Kit', 'Nico', 'Iris', 'Pike', 'Ada'];
    const colors = ['blue', 'plum', 'rose', 'gold', 'teal', 'violet'];
    const name = names.find((candidate) => !activeRoom.players.some((player) => player.name === candidate)) ?? `Guest ${activeRoom.players.length}`;
    const id = Math.max(...activeRoom.players.map((player) => player.id)) + 1;
    updateActiveRoom({ players: [...activeRoom.players, { id, name, initials: name.slice(0, 2).toUpperCase(), color: colors[id % colors.length], ready: true }] });
    notify(`${name} тоглогч өрөөнд нэмэгдлээ.`);
  };

  const updateHostIdentity = (name: string, color: string) => {
    const cleanName = name.trim().slice(0, 16) || 'Та';
    updateActiveRoom({ players: activeRoom.players.map((player) => player.id === 1 ? { ...player, name: cleanName, initials: cleanName.slice(0, 2).toUpperCase(), color } : player) });
  };

  const startGame = () => {
    const host = activeRoom.players.find((player) => player.id === 1);
    if (activeRoom.players.length < 4) return notify(translateMessage('At least 4 players are needed to start. Add simulated players first.'));
    if (!host?.ready) return notify(translateMessage('Mark yourself Ready before starting the game.'));
    setScreen('game');
  };

  const copyRoom = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify(`${i18n.app.roomCode}: ${roomCode}`);
    }
  };

  const goBack = () => setScreen('menu');

  const openAuth = (view: AuthView = 'sign-in') => {
    setAuthView(view);
    setScreen('auth');
  };

  const saveProfile = async (displayName: string, avatarKey: string) => {
    if (!supabase || !userId) return translateMessage('Sign in again before editing your profile.');
    const { data, error } = await supabase.from('profiles').update({ display_name: displayName, avatar_key: avatarKey }).eq('id', userId).select('*').single();
    if (error) return translateMessage('Profile could not be saved. Only your display name and avatar can be edited.');
    setProfile(data as PublicProfile);
    return '';
  };

  return (
    <main className="viewport">
      <section className={`game-frame screen-${screen}`} aria-label="MAFIA: SHADOWS тоглоом">
        <div className="grain" aria-hidden="true" />
        {screen === 'menu' && <Menu onNavigate={setScreen} onPlay={openDemoLobby} onCreate={() => setScreen('create-room')} onJoin={() => setScreen('join-room')} signedIn={Boolean(userId)} onAuth={openAuth} />}
        {screen === 'create-room' && <CreateRoom onBack={() => setScreen('menu')} onCreate={createRoom} />}
        {screen === 'join-room' && <JoinRoom onBack={() => setScreen('menu')} onJoin={joinRoom} />}
        {screen === 'lobby' && (
          <VoiceChatProvider roomCode={roomCode} userId={userId} phase="lobby" alive isHost={Boolean(activeRoom.players.find((player) => player.id === 1)?.host)}>
          <Lobby
            room={activeRoom}
            roomCode={roomCode}
            copied={copied}
            onCopy={copyRoom}
            onReady={toggleReady}
            onLeave={goBack}
            onStart={startGame}
            onAddPlayer={addSimulatedPlayer}
            onIdentityChange={updateHostIdentity}
          />
          </VoiceChatProvider>
        )}
        {screen === 'game' && (
          <GameScreen
            players={activeRoom.players}
            roomName={activeRoom.name}
            roomCode={roomCode}
            userId={userId}
            isHost={Boolean(activeRoom.players.find((player) => player.id === 1)?.host)}
            onLeave={() => setScreen('lobby')}
            onReturnMenu={goBack}
            onNotice={notify}
          />
        )}
        {screen === 'roles' && <RoleGallery onBack={goBack} />}
        {screen === 'profile' && <ProfileScreen profile={profile} loading={accountLoading} loadError={profileError} onBack={goBack} onSignIn={() => openAuth('sign-in')} onSignOut={() => openAuth('sign-out')} onSave={saveProfile} />}
        {screen === 'rank' && <RankScreen profile={profile} history={ratingHistory} loading={accountLoading} error={historyError || profileError} onBack={goBack} onSignIn={() => openAuth('sign-in')} />}
        {screen === 'leaderboard' && <LeaderboardScreen userId={userId} onBack={goBack} onSignIn={() => openAuth('sign-in')} />}
        {screen === 'auth' && <Auth key={authView} initialView={authView} onBack={goBack} onAuthenticated={() => setScreen('profile')} onSignedOut={() => { setUserId(null); setProfile(null); setRatingHistory([]); setScreen('menu'); }} />}
        {screen === 'settings' && <Settings onBack={goBack} onNotice={notify} onProfile={() => setScreen('profile')} onRank={() => setScreen('rank')} onLeaderboard={() => setScreen('leaderboard')} onAuth={() => openAuth(userId ? 'sign-out' : 'sign-in')} signedIn={Boolean(userId)} />}
        {notice && <div className="toast" role="status"><Check size={14} />{notice}</div>}
      </section>
      <div className="rotate-overlay" aria-live="polite">
        <div className="rotate-phone"><span /></div>
        <p>{i18n.app.turnPhone}</p>
        <small>{i18n.app.landscapePlay}</small>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'compact' : ''}`}><span className="brand-emblem"><Skull size={compact ? 17 : 23} /></span><span>MAFIA<span className="brand-colon">:</span> <b>SHADOWS</b></span></div>;
}

function Menu({ onNavigate, onPlay, onCreate, onJoin, signedIn, onAuth }: { onNavigate: (screen: Screen) => void; onPlay: () => void; onCreate: () => void; onJoin: () => void; signedIn: boolean; onAuth: (view?: AuthView) => void }) {
  return (
    <div className="menu-screen">
      <header className="menu-top"><Brand /><div className="online-note"><span className="status-dot" /> {i18n.app.localPrototype}</div></header>
      <div className="city-art" aria-hidden="true"><div className="moon-glow" /><div className="cityline" /><div className="rain-lines" /></div>
      <div className="menu-copy">
        <div className="eyebrow"><span /> {i18n.app.cityOfSecrets} <span /></div>
        <h1>Хэнд ч <i>бүү итгэ.</i></h1>
        <p>{i18n.app.darkStory}</p>
        <button className="primary-button play-button" onClick={onPlay}><span className="play-triangle" /> {i18n.app.playNow.toUpperCase()} <ChevronRight size={17} /></button>
        <div className="menu-subtext"><Users size={13} /> {i18n.app.tableCount} <span className="sub-divider" /> {i18n.app.duration}</div>
      </div>
      <nav className="menu-nav" aria-label="Үндсэн цэс">
        <button onClick={onCreate}><span className="nav-icon"><Users size={16} /></span><span>{i18n.app.createRoom}</span><ChevronRight size={14} /></button>
        <button onClick={onJoin}><span className="nav-icon"><Radio size={16} /></span><span>{i18n.app.joinRoom}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('roles')}><span className="nav-icon"><Shield size={16} /></span><span>{i18n.app.roleGallery}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('profile')}><span className="nav-icon"><UserRound size={16} /></span><span>{i18n.app.profile}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('rank')}><span className="nav-icon"><Crown size={16} /></span><span>{i18n.app.rank}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('leaderboard')}><span className="nav-icon"><Shield size={16} /></span><span>{i18n.app.leaderboard}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('settings')}><span className="nav-icon"><SettingsIcon size={16} /></span><span>{i18n.app.settings}</span><ChevronRight size={14} /></button>
        <button onClick={() => onAuth(signedIn ? 'sign-out' : 'sign-in')}><span className="nav-icon"><LockKeyhole size={16} /></span><span>{signedIn ? i18n.app.signOut : i18n.auth.signInAccount}</span><ChevronRight size={14} /></button>
      </nav>
      <footer className="menu-footer"><span>{i18n.app.afterDark.toUpperCase()}</span><span>{i18n.app.version} <i>•</i> {i18n.app.allConnectionsSimulated}</span></footer>
    </div>
  );
}

function CreateRoom({ onBack, onCreate }: { onBack: () => void; onCreate: (room: Omit<GameRoom, 'players'>) => void }) {
  const [name, setName] = useState('Блэкуотерын шөнө');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [isPrivate, setIsPrivate] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return setError('Өрөөний нэрийг оруулаад үүсгэнэ үү.');
    if (isPrivate && password && password.length < 4) return setError('Өрөөний нууц үг хамгийн багадаа 4 тэмдэгт байна.');
    setError('');
    onCreate({ name: name.trim(), maxPlayers, isPrivate, password: isPrivate ? password : '' });
  };

  return <div className="inner-screen setup-screen"><TopBar title="ӨРӨӨ ҮҮСГЭХ" subtitle="ӨРӨӨНИЙ ТӨХИРГӨӨ" onBack={onBack} /><div className="setup-content"><div className="setup-heading"><div className="eyebrow left-eye">ТӨХИРГӨӨ СОНГОХ</div><h1>Өөрийнхөө <i>өрөөг</i> бүтээ.</h1><p>Таны өрөөнд гурван симуляцийн зочин автоматаар нэмэгдэнэ.</p></div><form className="room-form" onSubmit={submit}>
    <label className="form-field room-name-field"><span>{i18n.app.roomName.toUpperCase()}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Өрөөний нэрээ оруулна уу" /></label>
    <label className="form-field"><span>{i18n.app.maxPlayers.toUpperCase()}</span><select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{[6, 8, 10, 12].map((count) => <option key={count} value={count}>{count} тоглогч</option>)}</select></label>
    <div className="private-setting"><span><b>Хувийн өрөө</b><small>Зөвхөн өрөөний кодтой тоглогч нэгдэх боломжтой</small></span><button type="button" role="switch" aria-checked={isPrivate} className={`toggle ${isPrivate ? 'toggle-on' : ''}`} onClick={() => setIsPrivate((value) => !value)}><i /></button></div>
    {isPrivate && <label className="form-field password-field"><span>ӨРӨӨНИЙ НУУЦ ҮГ <small>СОНГОЛТТОЙ</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder="Нууц үггүй орж болно" autoComplete="new-password" /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button"><Users size={15} /> {i18n.app.createRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
  </form></div></div>;
}

function JoinRoom({ onBack, onJoin }: { onBack: () => void; onJoin: (code: string, password: string) => string }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = onJoin(code, password);
    setError(result);
  };
  return <div className="inner-screen setup-screen"><TopBar title="ӨРӨӨНД НЭГДЭХ" subtitle="ШИРЭЭНД НЭГДЭХ" onBack={onBack} /><div className="join-content"><div className="setup-heading"><div className="eyebrow left-eye">ХОТ ХҮЛЭЭЖ БАЙНА</div><h1>Код <i>мэдэх үү?</i></h1><p>Энэ хөтчийн таб дээр ажиллаж буй туршилтын өрөөнд холбогдоно уу.</p></div><form className="join-form" onSubmit={submit}>
    <label className="form-field"><span>{i18n.app.roomCode.toUpperCase()}</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={11} placeholder="NIGHT-7X" autoComplete="off" /></label>
    <label className="form-field"><span>ӨРӨӨНИЙ НУУЦ ҮГ <small>ШААРДЛАГАТАЙ БОЛ</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Нууц үг оруулна уу" autoComplete="off" /></label>
    <div className="demo-note"><Radio size={15} /><span><b>Зөвхөн туршилтын өрөө</b><small>Онлайн олон тоглогчийн холболт идэвхгүй. NIGHT-7X эсвэл энэ таб дээр үүсгэсэн өрөөг ашиглаарай.</small></span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button"><Radio size={15} /> {i18n.app.joinRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
  </form></div></div>;
}

function Lobby({ room, roomCode, copied, onCopy, onReady, onLeave, onStart, onAddPlayer, onIdentityChange }: {
  room: GameRoom; roomCode: string; copied: boolean; onCopy: () => void; onReady: () => void;
  onLeave: () => void; onStart: () => void; onAddPlayer: () => void; onIdentityChange: (name: string, color: string) => void;
}) {
  const host = room.players.find((player) => player.id === 1);
  const emptySlots = Math.max(room.maxPlayers - room.players.length, 0);
  return (
    <div className="inner-screen lobby-screen">
      <TopBar title={room.name.toUpperCase()} subtitle="ТОГЛООМЫН ЛОББИ" onBack={onLeave} />
      <div className={`lobby-content capacity-${room.maxPlayers}`}>
        <div className="lobby-heading">
          <div><div className="eyebrow left-eye">ХОТ СЭРЭХЭЭСЭЭ ӨМНӨ</div><h1>Бүлгээ <i>цуглуулаарай.</i></h1></div>
          <div className="room-code"><span>{i18n.app.roomCode.toUpperCase()}</span><strong>{roomCode}</strong><button aria-label="Өрөөний код хуулах" title="Өрөөний код хуулах" onClick={onCopy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button></div>
        </div>
          <div className="identity-controls"><label>ТАНЫ НЭР<input value={host?.name ?? ''} onChange={(event) => onIdentityChange(event.target.value, host?.color ?? 'rose')} maxLength={16} /></label><label>АВАТАР<select value={host?.color ?? 'rose'} onChange={(event) => onIdentityChange(host?.name ?? 'Та', event.target.value)}><option value="rose">Сарнай ягаан</option><option value="violet">Нил ягаан</option><option value="gold">Алтан шар</option><option value="teal">Цэнхэр ногоон</option><option value="blue">Цэнхэр</option><option value="plum">Чавганы ягаан</option></select></label></div>
        <div className="lobby-toolbar"><span><Users size={14} /> ТОГЛОГЧИД <b>{String(room.players.length).padStart(2, '0')}</b> <span className="muted">/ {room.maxPlayers}</span></span><span className="sim-badge"><span className="status-dot" /> ТУРШИЛТЫН ТОГЛОГЧИД <span className="muted">·</span> {room.isPrivate ? 'ХУВИЙН ӨРӨӨ' : 'НИЙТЭД НЭЭЛТТЭЙ'}</span></div>
        <div className="player-grid">
          {room.players.map((player) => <PlayerCard key={player.id} player={player} selected={false} compact />)}
          {Array.from({ length: emptySlots }, (_, index) => <button className="invite-slot" key={`slot-${index}`} onClick={onAddPlayer} aria-label="Туршилтын тоглогч нэмэх"><span>+</span><small>ТУРШИЛТЫН ТОГЛОГЧ НЭМЭХ</small></button>)}
        </div>
        <div className="lobby-bottom">
          <div className="lobby-hint"><LockKeyhole size={14} /><span>{host?.host ? 'ТА ӨРӨӨНИЙ ЭЗЭН' : 'ТУРШИЛТЫН ӨРӨӨ'} <b>•</b> {host?.ready ? 'Эхлэхэд бэлэн' : 'Эхлүүлэхийн өмнө бэлэн гэдгээ тэмдэглэнэ үү'}</span></div>
          <div className="lobby-actions">
            <button className={`secondary-button ready-button ${host?.ready ? 'is-ready' : ''}`} onClick={onReady}>{host?.ready ? <Check size={15} /> : <Shield size={15} />}{host?.ready ? 'БЭЛЭН БИШ' : 'БИ БЭЛЭН'}</button>
            <button className="text-button" onClick={onLeave}><ArrowLeft size={15} /> {i18n.common.leave.toUpperCase()}</button>
            {host?.host && <button className="primary-button start-button" onClick={onStart}><Moon size={15} /> {i18n.app.startGame.toUpperCase()} <ChevronRight size={16} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="top-bar"><button className="icon-button back-button" onClick={onBack} aria-label="Цэс рүү буцах"><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><Brand compact /><div className="top-trailing">{trailing}</div></header>;
}

function PlayerCard({ player, selected, compact = false, onClick }: { player: Player; selected: boolean; compact?: boolean; onClick?: () => void }) {
  const content = <><div className={`avatar avatar-${player.color}`}><span>{player.initials}</span>{player.host && <i title="Өрөөний эзэн"><Crown size={11} /></i>}<VoiceAvatarIndicator name={player.name} /></div><div className="player-name">{player.name}{player.id === 1 && <small>ЧИ</small>}</div><div className={`player-status ${player.ready || player.status === 'alive' ? 'online' : ''}`}>{player.status ?? (player.ready ? 'БЭЛЭН' : player.host ? 'ЭЗЭН' : 'ЛОББИД')}</div></>;
  if (compact) return <div className={`player-card compact-card ${player.ready ? 'player-ready' : ''}`}>{content}</div>;
  return <button className={`player-card target-card ${selected ? 'target-selected' : ''}`} onClick={onClick} aria-pressed={selected}>{content}<span className="target-marker"><Target size={14} /></span></button>;
}

function RoleGallery({ onBack }: { onBack: () => void }) {
  return <div className="inner-screen gallery-screen"><TopBar title="ТОГЛОГЧИД" subtitle="ТАЛБАЙН ТУХАЙ" onBack={onBack} /><div className="gallery-heading"><div><div className="eyebrow left-eye">ДАЙСНАА БОЛОН ХАМТРАГЧАА МЭД.</div><h1>Дүрийн <i>архив.</i></h1></div><span>7 НУУЦ ДҮР</span></div><div className="role-grid">{roles.map((item, index) => { const Icon = item.icon; return <article className={`role-card team-${item.team}`} key={item.name}><div className="role-card-art"><div className="card-orbit" /><Icon size={27} strokeWidth={1.4} /><span className="role-index">0{index + 1}</span></div><div className="role-card-info"><span className={`team-tag ${item.team}`}>{item.team === 'town' ? 'ХОТ' : item.team === 'mafia' ? 'МАФИ' : 'ТУСГАЙ'}</span><h2>{translateRole(item.name)}</h2><p>{translateRoleDescription(item.name)}</p></div></article>; })}</div></div>;
}

function Settings({ onBack, onNotice, onProfile, onRank, onLeaderboard, onAuth, signedIn }: { onBack: () => void; onNotice: (text: string) => void; onProfile: () => void; onRank: () => void; onLeaderboard: () => void; onAuth: () => void; signedIn: boolean }) {
  const [sound, setSound] = useState(true);
  const [motion, setMotion] = useState(true);
  return <div className="inner-screen simple-screen"><TopBar title="ТОХИРГОО" subtitle="ТОХИРГОО" onBack={onBack} /><div className="settings-content">  <div className="settings-intro"><div className="eyebrow left-eye">ӨӨРТӨӨ ТОХИРУУЛ</div><h1>Уур амьсгалаа <i>сонго.</i></h1></div><div className="setting-list"><SettingRow icon={<Radio size={17} />} title="Дууны эффект" detail="Хотын дуу чимээ болон тоглоомын эффект" checked={sound} onToggle={() => setSound((value) => !value)} /><SettingRow icon={<WandSparkles size={17} />} title="Хөдөлгөөнийг багасгах" detail="Шилжилт, хөдөлгөөнт эффектийг хязгаарлах" checked={!motion} onToggle={() => setMotion((value) => !value)} /><button className="setting-row" onClick={() => onNotice('Хэл: Монгол')}><span className="setting-icon"><MessageCircle size={17} /></span><span className="setting-copy"><b>Хэл</b><small>Ширээний хэлээ сонгоно уу</small></span><strong className="language-value">Монгол <ChevronRight size={15} /></strong></button><SettingsLink icon={<UserRound size={17} />} label="Профайл" detail={signedIn ? 'Нэр болон аватар засах' : 'Бүртгэлээ харахын тулд нэвтэрнэ үү'} onClick={onProfile} /><SettingsLink icon={<Crown size={17} />} label="Зэрэглэл" detail="Өрсөлдөөний оноо, түүх" onClick={onRank} /><SettingsLink icon={<Shield size={17} />} label="Шилдэг тоглогчид" detail="Нийтийн байр" onClick={onLeaderboard} /><SettingsLink icon={<LockKeyhole size={17} />} label={signedIn ? 'Гарах' : 'Нэвтрэх / бүртгэл үүсгэх'} detail={signedIn ? 'Supabase бүртгэлээс гарах' : 'Бүртгэлийн боломжийг нээх'} onClick={onAuth} /></div><span className="settings-version">MAFIA: SHADOWS <i>•</i> ХУВИЛБАР 0.1.0</span></div></div>;
}

function SettingsLink({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button className="setting-row settings-link-row" onClick={onClick}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{label}</b><small>{detail}</small></span><ChevronRight size={15} /></button>;
}

function SettingRow({ icon, title, detail, checked, onToggle }: { icon: ReactNode; title: string; detail: string; checked: boolean; onToggle: () => void }) {
  return <button className="setting-row" role="switch" aria-checked={checked} onClick={onToggle}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{title}</b><small>{detail}</small></span><span className={`toggle ${checked ? 'toggle-on' : ''}`}><i /></span></button>;
}