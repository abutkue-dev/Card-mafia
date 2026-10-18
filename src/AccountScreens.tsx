import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Award, Check, ChevronRight, Crown, LoaderCircle, LockKeyhole,
  Medal, Shield, Trophy, UserRound, Users,
} from 'lucide-react';
import { calculateRankProgress, rankTiers } from './rank';
import { supabase, supabaseConfigured, type PublicProfile, type RatingChange } from './supabaseClient';
import { i18n, translateRank } from './i18n';

export const avatarOptions = [
  { key: 'rose', label: 'Сарнай ягаан' },
  { key: 'violet', label: 'Нил ягаан' },
  { key: 'gold', label: 'Алтан шар' },
  { key: 'teal', label: 'Цэнхэр ногоон' },
  { key: 'blue', label: 'Цэнхэр' },
  { key: 'plum', label: 'Чавганы ягаан' },
] as const;

const leaderboardColumns = 'id,display_name,avatar_key,rank_name,rank_points,wins,total_matches';

type LeaderboardProfile = Pick<PublicProfile, 'id' | 'display_name' | 'avatar_key' | 'rank_name' | 'rank_points' | 'wins' | 'total_matches'>;

export function ProfileScreen({ profile, loading, loadError, onBack, onSignIn, onSignOut, onSave }: {
  profile: PublicProfile | null; loading: boolean; loadError: string; onBack: () => void; onSignIn: () => void; onSignOut: () => void;
  onSave: (displayName: string, avatarKey: string) => Promise<string>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar_key ?? 'rose');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setAvatar(profile?.avatar_key ?? 'rose');
  }, [profile?.display_name, profile?.avatar_key]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (name.trim().length < 2 || name.trim().length > 24) { setError(i18n.account.displayNameRule); return; }
    setSaving(true);
    const result = await onSave(name.trim(), avatar);
    setSaving(false);
    if (result) setError(result);
    else { setMessage(i18n.account.profileUpdated); setEditing(false); }
  };

  return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.yourFile.toUpperCase()} subtitle={i18n.account.playerProfile.toUpperCase()} onBack={onBack} trailing={profile && <button className="account-signout-link" onClick={onSignOut}>{i18n.account.signOut}</button>} />
    {!supabaseConfigured ? <BackendSetupNotice /> : loading ? <LoadingState label={i18n.account.loadingAccount} /> : !profile ? <AccountEmpty title={i18n.account.profileWaiting} detail={loadError || i18n.account.profileDetail} action={i18n.account.signInAction} onAction={onSignIn} /> : <div className="account-body profile-body">
      <div className="profile-identity-row"><div className={`account-avatar avatar avatar-${profile.avatar_key}`}><span>{initials(profile.display_name)}</span></div><div className="profile-identity"><div className="eyebrow left-eye">{profile.is_verified ? i18n.account.verifiedAccount : i18n.account.verificationRequired} <span className={profile.is_verified ? 'verified-led' : 'unverified-led'} /></div><h1>{profile.display_name}</h1><p>{i18n.account.memberSince} {formatDate(profile.created_at)} · {profile.registration_method === 'email' ? i18n.account.emailAccount : i18n.account.phoneAccount}</p></div><div className={`rank-badge rank-${rankColor(profile.rank_points)}`}><RankIcon points={profile.rank_points} /><span>{translateRank(calculateRankProgress(profile.rank_points).current.name)}</span><b>{profile.rank_points} RP</b></div></div>
      {loadError && <div className="account-inline-error">{loadError}</div>}
      {message && <div className="account-inline-success"><Check size={13} /> {message}</div>}
      <div className="profile-data-grid"><Stat value={profile.total_matches} label={i18n.account.matches} /><Stat value={profile.wins} label={i18n.account.wins} /><Stat value={profile.losses} label={i18n.account.losses} /><Stat value={`${profile.win_rate.toFixed(1)}%`} label={i18n.account.winRate} /><Stat value={profile.current_win_streak} label={i18n.account.currentStreak} /><Stat value={profile.best_win_streak} label={i18n.account.bestStreak} /><Stat value={`ТҮВШИН ${profile.player_level}`} label={i18n.account.level} /><Stat value={profile.is_verified ? i18n.account.verified : i18n.account.unverified} label={i18n.account.accountStatus} />
      </div>
      {editing ? <form className="profile-edit-form" onSubmit={saveProfile}><label className="auth-field"><span>{i18n.account.displayNameLabel}</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={24} /></label><fieldset className="avatar-picker"><legend>{i18n.account.chooseAvatar}</legend><div>{avatarOptions.map((option) => <button type="button" key={option.key} aria-label={option.label} title={option.label} aria-pressed={avatar === option.key} className={`avatar-choice avatar avatar-${option.key} ${avatar === option.key ? 'chosen' : ''}`} onClick={() => setAvatar(option.key)}><span>{initials(name || profile.display_name)}</span></button>)}</div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="account-actions"><button type="button" className="secondary-button" onClick={() => { setEditing(false); setError(''); }}>{i18n.account.cancel}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'ХАДГАЛЖ БАЙНА…' : i18n.account.saveProfile} <Check size={14} /></button></div></form> : <div className="profile-footer"><span><Shield size={13} /> {i18n.account.profileNote}</span><button className="secondary-button" onClick={() => { setEditing(true); setMessage(''); }}>{i18n.account.editProfile} <ChevronRight size={14} /></button></div>}
    </div>}
  </div>;
}

export function RankScreen({ profile, history, loading, error, onBack, onSignIn }: {
  profile: PublicProfile | null; history: RatingChange[]; loading: boolean; error: string; onBack: () => void; onSignIn: () => void;
}) {
  if (!supabaseConfigured) return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.rankTitle} subtitle={i18n.account.competitiveLadder} onBack={onBack} /><BackendSetupNotice /></div>;
  if (loading) return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.rankTitle} subtitle={i18n.account.competitiveLadder} onBack={onBack} /><LoadingState label={i18n.account.rankHistoryLoading} /></div>;
  if (!profile) return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.rankTitle} subtitle={i18n.account.competitiveLadder} onBack={onBack} /><AccountEmpty title={i18n.account.rankBelongsToAccount} detail={i18n.account.rankDetail} action={i18n.account.signIn} onAction={onSignIn} /></div>;

  const progress = calculateRankProgress(profile.rank_points);
  const latestResult = history[0];
  return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.rankTitle} subtitle={i18n.account.competitiveLadder} onBack={onBack} /><div className="account-body rank-body">
    <div className={`rank-hero rank-${progress.current.color}`}><div className="rank-orbit" /><div className="rank-hero-copy"><div className="eyebrow left-eye">{i18n.account.currentCompetitiveTier}</div><h1>{translateRank(progress.current.name)}</h1><p>{i18n.account.rankPoints} · {i18n.account.backendVerifiedOnly}</p><strong>{profile.rank_points} <small>RP</small></strong></div><div className="rank-emblem"><RankIcon points={profile.rank_points} size={43} /></div></div>
    <div className="rank-progress-block"><div className="rank-progress-head"><span>{progress.next ? `${progress.pointsToNext} RP · ${translateRank(progress.next.name).toUpperCase()}` : `${i18n.account.topTier} · ${translateRank('Master').toUpperCase()}`}</span><b>{profile.rank_points} RP</b></div><div className="rank-progress-track"><span style={{ width: `${progress.progress}%` }} /></div><div className="rank-progress-foot"><span>{progress.current.min} RP · {translateRank(progress.current.name)}</span><span>{progress.next ? `${progress.next.min} RP · ${translateRank(progress.next.name)}` : i18n.account.maxRank}</span></div></div>
    <div className="rank-tier-strip">{rankTiers.map((tier) => <div className={`rank-tier rank-${tier.color} ${tier.name === progress.current.name ? 'active' : ''}`} key={tier.name}><RankIcon points={tier.min} size={15} /><span>{translateRank(tier.name)}</span><small>{tier.min}+ RP</small></div>)}</div>
    {!profile.is_verified && <div className="rank-verification-note"><Shield size={14} /> {i18n.account.verificationNote}</div>}
    {latestResult && <section className={`competitive-result ${latestResult.new_rank !== latestResult.previous_rank ? 'rank-change-animation' : ''}`}><div><span>{i18n.account.lastVerifiedMatch}</span><b>{outcomeLabel(latestResult.outcome)}</b></div><strong className={latestResult.rp_change >= 0 ? 'rp-positive' : 'rp-negative'}>{latestResult.rp_change > 0 ? '+' : ''}{latestResult.rp_change} RP</strong><p>{translateRank(latestResult.previous_rank)} <ChevronRight size={12} /> {translateRank(latestResult.new_rank)} <small>· {latestResult.rank_points_before} → {latestResult.rank_points_after} RP</small></p></section>}
    <div className="rank-history"><div className="section-eyebrow">{i18n.account.ratingHistory} <span>{history.length}</span></div>{error && <div className="account-inline-error">{error}</div>}{history.length ? history.slice(0, 8).map((entry) => <div className="history-row" key={entry.id}><span className={`history-outcome outcome-${entry.outcome}`}>{outcomeLabel(entry.outcome)}</span><span>{translateRank(entry.previous_rank)} <ChevronRight size={11} /> {translateRank(entry.new_rank)}</span><small>{formatDate(entry.created_at)}</small><b className={entry.rp_change >= 0 ? 'rp-positive' : 'rp-negative'}>{entry.rp_change > 0 ? '+' : ''}{entry.rp_change} RP</b></div>) : <p className="empty-history">{i18n.account.completedMatches}</p>}</div>
  </div></div>;
}

export function LeaderboardScreen({ userId, onBack, onSignIn }: { userId: string | null; onBack: () => void; onSignIn: () => void }) {
  const [tab, setTab] = useState<'all' | 'friends' | 'mine'>('all');
  const [rows, setRows] = useState<LeaderboardProfile[]>([]);
  const [myPlace, setMyPlace] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const client = supabase;
    setError('');
    if (!supabaseConfigured || !client || tab === 'friends') {
      setRows([]);
      setMyPlace(null);
      setHasMore(false);
      return () => { active = false; };
    }
    setLoading(true);
    const load = async () => {
      if (tab === 'mine') {
        if (!userId) { setRows([]); setMyPlace(null); setLoading(false); return; }
        const { data: me, error: meError } = await client.from('profiles').select(leaderboardColumns).eq('id', userId).maybeSingle();
        if (meError || !me) { if (active) { setError(i18n.account.leaderboardLoadFailed); setRows([]); setLoading(false); } return; }
        const [higherRp, tiedHigherWins] = await Promise.all([
          client.from('profiles').select('id', { count: 'exact', head: true }).gt('rank_points', me.rank_points),
          client.from('profiles').select('id', { count: 'exact', head: true }).eq('rank_points', me.rank_points).gt('wins', me.wins),
        ]);
        if (!active) return;
        if (higherRp.error || tiedHigherWins.error) setError(i18n.account.leaderboardPlaceFailed);
        setRows([me as LeaderboardProfile]);
        setMyPlace((higherRp.count ?? 0) + (tiedHigherWins.count ?? 0) + 1);
        setHasMore(false);
        setLoading(false);
        return;
      }

      const from = page * 20;
      const { data, count, error: queryError } = await client.from('profiles').select(leaderboardColumns, { count: 'exact' })
        .order('rank_points', { ascending: false }).order('wins', { ascending: false }).order('display_name', { ascending: true })
        .range(from, from + 19);
      if (!active) return;
      if (queryError) { setError(i18n.account.leaderboardLoadFailed); setRows([]); }
      else setRows((current) => page === 0 ? (data ?? []) as LeaderboardProfile[] : [...current, ...(data ?? []) as LeaderboardProfile[]]);
      setHasMore(from + (data?.length ?? 0) < (count ?? 0));
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [page, tab, userId]);

  const selectTab = (next: 'all' | 'friends' | 'mine') => { setTab(next); setPage(0); setRows([]); setError(''); };
  return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.leaderboardTitle} subtitle={i18n.account.blackwaterStandings} onBack={onBack} /><div className="account-body leaderboard-body">
    <div className="leaderboard-heading"><div><div className="eyebrow left-eye">{i18n.account.cityKeepsScore.toUpperCase()}</div><h1>{i18n.account.whoOwnsNight.split(' ').slice(0, 2).join(' ')} <i>{i18n.account.whoOwnsNight.split(' ').slice(2).join(' ')}</i></h1></div><span>{i18n.account.publicRankOnly}</span></div>
    <div className="leaderboard-tabs" role="tablist" aria-label="Тэргүүлэгчдийн жагсаалтын харагдац"><button className={tab === 'all' ? 'selected' : ''} onClick={() => selectTab('all')}><Trophy size={13} /> {i18n.account.allPlayers}</button><button className={tab === 'friends' ? 'selected' : ''} onClick={() => selectTab('friends')}><Users size={13} /> {i18n.account.friends}</button><button className={tab === 'mine' ? 'selected' : ''} onClick={() => selectTab('mine')}><UserRound size={13} /> {i18n.account.myRank}</button></div>
    {!supabaseConfigured ? <BackendSetupNotice /> : tab === 'friends' ? <div className="friends-empty"><Users size={23} /><b>{i18n.account.friendsUnavailable}</b><span>{i18n.account.noFriendsList}</span></div> : tab === 'mine' && !userId ? <AccountEmpty title={i18n.account.signInToSeePlace} detail={i18n.account.rankPrivate} action={i18n.account.signIn} onAction={onSignIn} /> : <>
      {error && <div className="account-inline-error">{error}</div>}
      <div className="leaderboard-list"><div className="leaderboard-columns"><span>{i18n.account.place} / {i18n.account.player}</span><span>{i18n.account.rankTitle}</span><span>{i18n.account.wins}</span><span>{i18n.account.matches}</span><span>RP</span></div>
        {rows.map((row, index) => <LeaderboardRow key={row.id} profile={row} place={tab === 'mine' ? myPlace ?? 0 : page * 20 + index + 1} isCurrent={row.id === userId} />)}
        {!loading && !error && rows.length === 0 && <div className="leaderboard-empty">{i18n.account.noRankedAccounts}</div>}
        {loading && <LoadingState label={i18n.account.loadingStandings} compact />}
      </div>
      {tab === 'all' && hasMore && !loading && <button className="secondary-button load-more-button" onClick={() => setPage((value) => value + 1)}>{i18n.account.loadMore} <ChevronRight size={14} /></button>}
      {tab === 'mine' && myPlace !== null && rows[0] && <p className="my-place-note">{i18n.account.currentPosition}: <b>#{myPlace}</b> (RP, дараа нь ялалтаар эрэмбэлэв).</p>}
    </>}
  </div></div>;
}

function AccountTopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: React.ReactNode }) {
  return <header className="top-bar account-top-bar"><button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><div className="account-top-trailing">{trailing}</div></header>;
}

function LeaderboardRow({ profile, place, isCurrent }: { profile: LeaderboardProfile; place: number; isCurrent: boolean }) {
  const rank = calculateRankProgress(profile.rank_points).current;
  return <div className={`leaderboard-row ${isCurrent ? 'current-player-row' : ''}`}><div className="leaderboard-player"><span className={`avatar avatar-${profile.avatar_key}`}><span>{initials(profile.display_name)}</span></span><span><b>{profile.display_name}{isCurrent && <small>{i18n.account.myRank}</small>}</b><i>#{place || '—'}</i></span></div><span className={`leaderboard-rank rank-text-${rank.color}`}><RankIcon points={profile.rank_points} size={13} />{translateRank(rank.name)}</span><b>{profile.wins}</b><b>{profile.total_matches}</b><strong>{profile.rank_points} <small>RP</small></strong></div>;
}

function RankIcon({ points, size = 18 }: { points: number; size?: number }) {
  const rank = calculateRankProgress(points).current;
  if (rank.name === 'Master') return <Crown size={size} />;
  if (rank.name === 'Diamond') return <Award size={size} />;
  if (rank.name === 'Platinum' || rank.name === 'Gold') return <Trophy size={size} />;
  if (rank.name === 'Silver') return <Medal size={size} />;
  return <Shield size={size} />;
}

function BackendSetupNotice() {
  return <div className="account-setup-notice"><div><LockKeyhole size={19} /></div><h2>{i18n.account.backendSetupRequired}</h2><p>{i18n.account.backendSetupMessage}</p></div>;
}

function AccountEmpty({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="account-empty"><div><LockKeyhole size={18} /></div><h2>{title}</h2><p>{detail}</p><button className="primary-button" onClick={onAction}>{action} <ChevronRight size={14} /></button></div>;
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`account-loading ${compact ? 'compact' : ''}`}><LoaderCircle size={17} />{label}</div>;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <div className="account-stat"><b>{value}</b><span>{label}</span></div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

function rankColor(points: number) {
  return calculateRankProgress(points).current.color;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Тодорхойгүй огноо' : new Intl.DateTimeFormat('mn-MN', { month: 'short', year: 'numeric' }).format(date);
}

function outcomeLabel(outcome: string) {
  return outcome === 'win' ? 'ЯЛАЛТ' : outcome === 'loss' ? 'ЯЛАГДАЛ' : 'ТЭНЦЭЭ';
}