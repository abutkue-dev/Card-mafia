import { useState, type FormEvent } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Eye, EyeOff, LockKeyhole, Mail,
  Phone, Shield, Skull, UserRound, X,
} from 'lucide-react';
import { supabase, supabaseConfigured } from './supabaseClient';
import { i18n } from './i18n';

export type AuthView = 'sign-in' | 'create-account' | 'verify-email' | 'verify-phone' | 'forgot-password' | 'verify-recovery-phone' | 'reset-password' | 'sign-out';
type RegistrationMethod = 'email' | 'phone';

export default function Auth({ initialView = 'sign-in', onBack, onAuthenticated, onSignedOut }: {
  initialView?: AuthView;
  onBack: () => void;
  onAuthenticated: () => void;
  onSignedOut: () => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [method, setMethod] = useState<RegistrationMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const resetFeedback = () => { setError(''); setMessage(''); };
  const navigate = (next: AuthView) => { resetFeedback(); setView(next); };
  const checkPassword = () => {
    if (password.length < 8) return i18n.auth.passwordMin;
    if (password !== confirmPassword) return i18n.auth.passwordMismatch;
    return '';
  };
  const checkEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const checkPhone = () => /^\+[1-9]\d{7,14}$/.test(phone.trim());
  const ensureConfigured = () => {
    if (supabaseConfigured && supabase) return true;
    setError(i18n.auth.configMessage);
    return false;
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    const identifier = email.trim();
    const isEmail = identifier.includes('@');
    if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) : !/^\+[1-9]\d{7,14}$/.test(identifier)) {
      setError(i18n.auth.invalidEmailOrPhone);
      return;
    }
    if (password.length < 8) { setError(i18n.auth.passwordMin); return; }
    setBusy(true);
    const result = await supabase!.auth.signInWithPassword(isEmail
      ? { email: identifier, password }
      : { phone: identifier, password });
    setBusy(false);
    if (result.error) {
      setError(i18n.auth.invalidCredentials);
      return;
    }
    setPassword('');
    onAuthenticated();
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    const cleanName = displayName.trim();
    if (cleanName.length < 2 || cleanName.length > 24) { setError(i18n.auth.invalidDisplayName); return; }
    const passwordError = checkPassword();
    if (passwordError) { setError(passwordError); return; }
    if (method === 'email' && !checkEmail()) { setError(i18n.auth.invalidEmail); return; }
    if (method === 'phone' && !checkPhone()) { setError(i18n.auth.invalidPhone); return; }

    setBusy(true);
    const result = method === 'email'
      ? await supabase!.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: cleanName, avatar_key: 'rose' }, emailRedirectTo: window.location.origin },
        })
      : await supabase!.auth.signUp({
          phone: phone.trim(),
          password,
          options: { data: { display_name: cleanName, avatar_key: 'rose' }, channel: 'sms' },
        });
    setBusy(false);
    setPassword('');
    setConfirmPassword('');
    if (result.error) {
      setError(method === 'phone'
        ? i18n.auth.phoneProviderWarning
        : i18n.auth.accountCreateFailed);
      return;
    }
    if (method === 'email') {
      if (result.data.session) onAuthenticated();
      else { setMessage(i18n.auth.verificationInbox); setView('verify-email'); }
    } else {
      setMessage(i18n.auth.phoneCodeSent);
      setView('verify-phone');
    }
  };

  const verifyPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    if (!checkPhone() || !/^\d{4,10}$/.test(code.trim())) { setError('Утасны дугаар болон SMS-ээр ирсэн баталгаажуулах кодоо оруулна уу.'); return; }
    setBusy(true);
    const result = await supabase!.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: 'sms' });
    setBusy(false);
    if (result.error) { setError(i18n.auth.smsCodeError); return; }
    setCode('');
    onAuthenticated();
  };

  const resendPhoneCode = async () => {
    resetFeedback();
    if (!ensureConfigured()) return;
    setBusy(true);
    const result = await supabase!.auth.signInWithOtp({ phone: phone.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (result.error) setError(i18n.auth.smsRequestFailed);
    else setMessage(i18n.auth.smsRequestSent);
  };

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    if (method === 'email' && !checkEmail()) { setError(i18n.auth.invalidEmail); return; }
    if (method === 'phone' && !checkPhone()) { setError(i18n.auth.invalidPhone); return; }
    setBusy(true);
    if (method === 'email') {
      const result = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?password-reset=1` });
      setBusy(false);
      if (result.error) { setError(i18n.auth.recoveryEmailFailed); return; }
      setMessage(i18n.auth.recoveryEmailSent);
      return;
    }
    const result = await supabase!.auth.signInWithOtp({ phone: phone.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (result.error) {
      setError(i18n.auth.recoveryRequestFailed);
      return;
    }
    setMessage(i18n.auth.recoveryPhoneSent);
    setView('verify-recovery-phone');
  };

  const verifyRecoveryPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    if (!/^\d{4,10}$/.test(code.trim())) { setError('Supabase-аас илгээсэн кодыг оруулна уу.'); return; }
    setBusy(true);
    const result = await supabase!.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: 'sms' });
    setBusy(false);
    if (result.error) { setError('Сэргээх кодыг баталгаажуулж чадсангүй. Шинэ код хүсээд дахин оролдоно уу.'); return; }
    setCode('');
    setMessage(i18n.auth.phoneVerified);
    setView('reset-password');
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    if (!ensureConfigured()) return;
    const passwordError = checkPassword();
    if (passwordError) { setError(passwordError); return; }
    setBusy(true);
    const result = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (result.error) { setError(i18n.auth.passwordUpdateFailed); return; }
    setPassword('');
    setConfirmPassword('');
    setMessage(i18n.auth.passwordUpdated);
    onAuthenticated();
  };

  const resendEmail = async () => {
    resetFeedback();
    if (!ensureConfigured()) return;
    if (!checkEmail()) { setError('Бүртгэл үүсгэхдээ ашигласан и-мэйл хаягаа оруулна уу.'); return; }
    setBusy(true);
    const result = await supabase!.auth.resend({ type: 'signup', email: email.trim() });
    setBusy(false);
    if (result.error) setError(i18n.auth.resendVerificationFailed);
    else setMessage(i18n.auth.resendVerificationSent);
  };

  const signOut = async () => {
    resetFeedback();
    if (!ensureConfigured()) return;
    setBusy(true);
    const result = await supabase!.auth.signOut();
    setBusy(false);
    if (result.error) { setError(i18n.auth.signOutFailed); return; }
    onSignedOut();
  };

  const title = view === 'sign-in' ? i18n.auth.welcomeBack : view === 'create-account' ? i18n.auth.joinCity : view === 'verify-email' ? i18n.auth.checkInbox : view === 'verify-phone' || view === 'verify-recovery-phone' ? i18n.auth.verifyPhone : view === 'forgot-password' ? i18n.auth.findWayBack : view === 'reset-password' ? i18n.auth.newPassword : i18n.auth.leavingAlready;
  const subtitle = view === 'sign-in' ? i18n.auth.signInToAccount.toUpperCase() : view === 'create-account' ? i18n.auth.createAccount.toUpperCase() : view.startsWith('verify') ? i18n.auth.supabaseVerification : view === 'forgot-password' ? i18n.auth.passwordRecovery.toUpperCase() : view === 'reset-password' ? i18n.auth.securePasswordReset.toUpperCase() : i18n.auth.signOutAccount.toUpperCase();
  const titleWords = title.split(' ');
  const titleLead = titleWords.slice(0, -1).join(' ');
  const titleEnd = titleWords[titleWords.length - 1];

  return <div className="inner-screen auth-screen"><header className="top-bar"><button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{i18n.auth.accountAccess}</strong></div><div className="auth-brand"><Skull size={18} /> MAFIA<span>:</span>SHADOWS</div></header><div className="auth-content"><div className="auth-intro"><div className="eyebrow left-eye">{i18n.auth.seatAtTable.toUpperCase()}</div><h1>{titleLead} <i>{titleEnd}</i></h1><p>{view === 'sign-in' ? 'Блэкуотер хотод таны суудал хүлээж байна.' : view.startsWith('verify') ? 'Баталгаажуулалтыг таны тохируулсан Supabase төсөл гүйцэтгэнэ.' : 'Таны бүртгэлийн мэдээлэл нийтийн профайлд харагдахгүй.'}</p><div className="auth-security-note"><Shield size={14} /> Нууц үгийг зөвхөн Supabase Auth боловсруулна.</div></div>
      <section className="auth-form-column">
        {!supabaseConfigured && <div className="auth-config-warning" role="status"><LockKeyhole size={16} /><span><b>{i18n.auth.configWarning}</b><small>{i18n.auth.configMessage}</small></span></div>}
        {error && <div className="auth-message auth-error" role="alert"><X size={14} />{error}</div>}
        {message && <div className="auth-message auth-success" role="status"><Check size={14} />{message}</div>}

        {view === 'sign-in' && <form className="auth-form" onSubmit={handleSignIn}>
          <label className="auth-field"><span>{i18n.auth.emailOrPhone}</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com эсвэл +97699112233" autoComplete="username" /></label>
          <PasswordField label={i18n.auth.password} value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" />
          <button className="auth-text-link forgot-link" type="button" onClick={() => navigate('forgot-password')}>{i18n.auth.forgotPassword}</button>
          <button className="primary-button auth-submit" type="submit" disabled={busy || !supabaseConfigured}>{busy ? i18n.auth.signingIn : i18n.auth.signIn} <ChevronRight size={16} /></button>
          <p className="auth-switch-line">{i18n.auth.newToCity} <button className="auth-text-link" type="button" onClick={() => navigate('create-account')}>{i18n.auth.createOne}</button></p>
        </form>}

        {view === 'create-account' && <>
          <div className="auth-method-tabs" role="tablist" aria-label="Бүртгүүлэх арга"><button className={method === 'email' ? 'selected' : ''} onClick={() => { setMethod('email'); resetFeedback(); }}><Mail size={14} /> И-МЭЙЛ</button><button className={method === 'phone' ? 'selected' : ''} onClick={() => { setMethod('phone'); resetFeedback(); }}><Phone size={14} /> УТАС</button></div>
          <form className="auth-form" onSubmit={handleCreateAccount}>
            <label className="auth-field"><span>{i18n.auth.displayName}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={24} autoComplete="nickname" placeholder={i18n.auth.yourCallsign} /></label>
            {method === 'email' ? <label className="auth-field"><span>{i18n.auth.emailAddress}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="email@example.com" /></label> : <label className="auth-field"><span>{i18n.auth.phoneWithCountryCode}</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+97699112233" /></label>}
            <PasswordField label={i18n.auth.newPasswordLabel} value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" />
            <PasswordField label={i18n.auth.confirmPassword} value={confirmPassword} onChange={setConfirmPassword} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} autoComplete="new-password" />
            <button className="primary-button auth-submit" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'ҮҮСГЭЖ БАЙНА…' : i18n.auth.createAccountAction} <ChevronRight size={16} /></button>
            <p className="auth-switch-line">{i18n.auth.alreadyHaveAccount} <button className="auth-text-link" type="button" onClick={() => navigate('sign-in')}>{i18n.auth.signInNow}</button></p>
          </form>
        </>}

        {view === 'verify-email' && <div className="auth-flow-card"><div className="auth-flow-icon"><Mail size={20} /></div><h2>{i18n.auth.emailVerification}</h2><p>{i18n.auth.useEmailLink}</p><button className="secondary-button" onClick={resendEmail} disabled={busy || !supabaseConfigured}>{busy ? 'ИЛГЭЭЖ БАЙНА…' : i18n.auth.resendEmail}</button><button className="auth-text-link" onClick={() => navigate('sign-in')}>{i18n.auth.backToSignIn}</button></div>}

        {(view === 'verify-phone' || view === 'verify-recovery-phone') && <form className="auth-form" onSubmit={view === 'verify-phone' ? verifyPhone : verifyRecoveryPhone}><div className="auth-flow-card compact-flow"><div className="auth-flow-icon"><Phone size={20} /></div><h2>{i18n.auth.smsCodeRequested}</h2><p>{i18n.auth.smsDescription}</p><small>{i18n.auth.destination}: {maskPhone(phone)}</small></div><label className="auth-field"><span>{i18n.auth.verificationCode}</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Код оруулна уу" /></label><button className="primary-button auth-submit" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'ШАЛГАЖ БАЙНА…' : i18n.auth.verifyPhoneAction} <Check size={15} /></button>{view === 'verify-phone' && <button className="auth-text-link" type="button" onClick={resendPhoneCode} disabled={busy || !supabaseConfigured}>{i18n.auth.requestNewCode}</button>}</form>}

        {view === 'forgot-password' && <><div className="auth-method-tabs" role="tablist" aria-label="Сэргээх арга"><button className={method === 'email' ? 'selected' : ''} onClick={() => { setMethod('email'); resetFeedback(); }}><Mail size={14} /> И-МЭЙЛ</button><button className={method === 'phone' ? 'selected' : ''} onClick={() => { setMethod('phone'); resetFeedback(); }}><Phone size={14} /> УТАС</button></div><form className="auth-form" onSubmit={requestPasswordReset}><label className="auth-field"><span>{method === 'email' ? i18n.auth.emailAddress : i18n.auth.phoneWithCountryCode}</span><input type={method === 'email' ? 'email' : 'tel'} value={method === 'email' ? email : phone} onChange={(event) => method === 'email' ? setEmail(event.target.value) : setPhone(event.target.value)} placeholder={method === 'email' ? 'email@example.com' : '+97699112233'} /></label><button className="primary-button auth-submit" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'ХҮСЭЛТ ИЛГЭЭЖ БАЙНА…' : i18n.auth.sendRecovery} <ChevronRight size={16} /></button><small className="auth-privacy-copy">{i18n.auth.privacyNote}</small></form></>}

        {view === 'reset-password' && <form className="auth-form" onSubmit={updatePassword}><div className="auth-flow-card compact-flow"><div className="auth-flow-icon"><LockKeyhole size={20} /></div><h2>{i18n.auth.verifiedRecoverySession}</h2><p>{i18n.auth.verifiedRecoveryDescription}</p></div><PasswordField label={i18n.auth.newPasswordLabel} value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" /><PasswordField label="ШИНЭ НУУЦ ҮГИЙГ БАТАЛГААЖУУЛАХ" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} autoComplete="new-password" /><button className="primary-button auth-submit" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'ШИНЭЧИЛЖ БАЙНА…' : i18n.auth.updatePassword} <Check size={15} /></button></form>}

        {view === 'sign-out' && <div className="auth-flow-card"><div className="auth-flow-icon"><UserRound size={20} /></div><h2>{i18n.auth.signOutQuestion}</h2><p>{i18n.auth.signOutDescription}</p><button className="primary-button auth-submit" onClick={signOut} disabled={busy || !supabaseConfigured}>{busy ? 'ГАРЧ БАЙНА…' : i18n.auth.signOutButton} <ArrowLeft size={15} /></button><button className="auth-text-link" onClick={onBack}>{i18n.auth.staySignedIn}</button></div>}

        {!['verify-email', 'verify-phone', 'verify-recovery-phone', 'reset-password', 'sign-out'].includes(view) && <div className="auth-back"><button className="auth-text-link" onClick={onBack}><ArrowLeft size={13} /> {i18n.auth.returnToBlackwater}</button></div>}
      </section>
    </div></div>;
}

function PasswordField({ label, value, onChange, visible, onToggle, autoComplete }: {
  label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; autoComplete: string;
}) {
  return <label className="auth-field"><span>{label}</span><span className="auth-password-wrap"><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} /><button type="button" onClick={onToggle} aria-label={visible ? 'Нууц үг нуух' : 'Нууц үг харуулах'} title={visible ? 'Нууц үг нуух' : 'Нууц үг харуулах'}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button></span></label>;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length < 5 ? phone : `+${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
}