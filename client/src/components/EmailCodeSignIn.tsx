/**
 * Sign-in by a code emailed to a UTA address, in two steps on one card:
 *
 *   1. "UTA email" -> Email me a code
 *   2. "Enter the code we sent to x" -> Sign in,
 *      with Resend code (after a countdown) and Change email.
 *
 * Every error is shown under the field it is about, announced as it appears
 * (role="alert") and tied to the field (aria-describedby), and focus moves to
 * the field that needs attention. A correct code signs the app in through
 * AuthProvider, and the login page then sends the student on to the page
 * they came from.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { emailProblem, formatCountdown, LOGIN_CODE_DIGITS, typedCode } from '../emailSignIn';

/** Whole seconds until `deadline` (a Date.now() value), ticking once a second. */
function useSecondsUntil(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function messageOf(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.';
}

/** Server answers after which the code in the field can never work, so it is cleared. */
const DEAD_CODE_ERRORS = new Set(['code_used_up', 'code_expired']);

export function EmailCodeSignIn(): ReactNode {
  const { config, signInWithEmailCode } = useAuth();
  const domains = config?.emailDomains ?? null;

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailValue, setEmailValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const secondsToResend = useSecondsUntil(resendAt);

  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  // Focus follows the step only once the student has moved between steps, so
  // opening the page does not pop up a phone's keyboard over the heading.
  const stepChanged = useRef(false);

  useEffect(() => {
    if (stepChanged.current) (step === 'code' ? codeInput : emailInput).current?.focus();
  }, [step]);

  function showCodeStep(email: string, resendAfterSeconds: number, minutes: number | null, message: string | null): void {
    setSentTo(email);
    setCodeValue('');
    setExpiresInMinutes(minutes);
    setResendAt(Date.now() + resendAfterSeconds * 1000);
    setError(null);
    setNotice(message);
    stepChanged.current = true;
    setStep('code');
  }

  function showFieldError(message: string, field: 'email' | 'code'): void {
    setError(message);
    const input = (field === 'email' ? emailInput : codeInput).current;
    input?.focus();
    input?.select();
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const problem = emailProblem(emailValue, domains);
    if (problem !== null) {
      showFieldError(problem, 'email');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const sent = await api.startEmailSignIn(emailValue.trim());
      showCodeStep(sent.email, sent.resendAfterSeconds, Math.round(sent.expiresInSeconds / 60), null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'resend_too_soon') {
        // A code went out moments ago (another tab, a double click, a
        // reload): it still works, so go straight to where it is typed.
        showCodeStep(
          emailValue.trim().toLowerCase(),
          caught.retryAfterSeconds ?? 60,
          null,
          'We already sent a code to this address a moment ago. Enter it below.',
        );
      } else {
        showFieldError(messageOf(caught), 'email');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const code = typedCode(codeValue);
    if (code === null) {
      showFieldError(`Enter the ${String(LOGIN_CODE_DIGITS)}-digit code from the email.`, 'code');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // On success the app is signed in and the login page navigates away.
      await signInWithEmailCode(sentTo, code);
    } catch (caught) {
      if (caught instanceof ApiError && DEAD_CODE_ERRORS.has(caught.code)) setCodeValue('');
      showFieldError(messageOf(caught), 'code');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const sent = await api.startEmailSignIn(sentTo);
      setCodeValue('');
      setExpiresInMinutes(Math.round(sent.expiresInSeconds / 60));
      setResendAt(Date.now() + sent.resendAfterSeconds * 1000);
      setNotice(`We sent a new code to ${sent.email}. Only the newest code works.`);
      codeInput.current?.focus();
    } catch (caught) {
      if (caught instanceof ApiError && caught.retryAfterSeconds !== null) {
        setResendAt(Date.now() + caught.retryAfterSeconds * 1000);
      }
      showFieldError(messageOf(caught), 'code');
    } finally {
      setBusy(false);
    }
  }

  function handleChangeEmail(): void {
    setError(null);
    setNotice(null);
    setResendAt(null);
    stepChanged.current = true;
    setStep('email');
  }

  if (step === 'email') {
    return (
      <form className="cm-login__form" onSubmit={(event) => void handleEmailSubmit(event)} noValidate>
        <div className="cm-form-field">
          <label className="cm-label" htmlFor="login-email">
            UTA email
          </label>
          <input
            ref={emailInput}
            id="login-email"
            className="cm-input"
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`netid@${domains?.[0] ?? 'mavs.uta.edu'}`}
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby="login-email-message"
          />
          {error !== null ? (
            <p id="login-email-message" className="cm-field-error" role="alert">
              {error}
            </p>
          ) : (
            <p id="login-email-message" className="cm-hint">
              We&rsquo;ll email you a {LOGIN_CODE_DIGITS}-digit code. No password needed.
            </p>
          )}
        </div>
        <button type="submit" className="cm-btn cm-btn--primary cm-btn--block" disabled={busy}>
          {busy ? 'Sending code…' : 'Email me a code'}
        </button>
      </form>
    );
  }

  const hint =
    expiresInMinutes === null
      ? 'Not there? Check your junk folder.'
      : `It expires in ${String(expiresInMinutes)} minutes. Not there? Check your junk folder.`;

  return (
    <form className="cm-login__form" onSubmit={(event) => void handleCodeSubmit(event)} noValidate>
      <p className="cm-login__sent">
        Enter the code we sent to <strong className="cm-login__address">{sentTo}</strong>
      </p>
      {notice !== null && (
        <p className="cm-login__notice" role="status">
          {notice}
        </p>
      )}
      <div className="cm-form-field">
        <label className="cm-label" htmlFor="login-code">
          {LOGIN_CODE_DIGITS}-digit code
        </label>
        <input
          ref={codeInput}
          id="login-code"
          className="cm-input cm-login__code"
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          value={codeValue}
          // Digits only, so a pasted "123 456" or "123-456" fits.
          onChange={(event) => setCodeValue(event.target.value.replace(/\D/g, '').slice(0, LOGIN_CODE_DIGITS))}
          aria-invalid={error !== null}
          aria-describedby="login-code-message"
        />
        {error !== null ? (
          <p id="login-code-message" className="cm-field-error" role="alert">
            {error}
          </p>
        ) : (
          <p id="login-code-message" className="cm-hint">
            {hint}
          </p>
        )}
      </div>
      <button type="submit" className="cm-btn cm-btn--primary cm-btn--block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="cm-login__code-actions">
        <button
          type="button"
          className="cm-btn cm-btn--quiet cm-btn--sm"
          onClick={() => void handleResend()}
          disabled={busy || secondsToResend > 0}
        >
          {secondsToResend > 0 ? (
            <>
              Resend in <span className="cm-login__countdown">{formatCountdown(secondsToResend)}</span>
            </>
          ) : (
            'Resend code'
          )}
        </button>
        <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={handleChangeEmail} disabled={busy}>
          Change email
        </button>
      </div>
    </form>
  );
}
