"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type InvitationPreview } from "@/lib/api";
import { BrandLogo, Icon } from "@/components/Icon";
import { OtpInput } from "@/components/OtpInput";

type Step = "otp" | "register" | "login";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("otp");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null);
  const [otpMessage, setOtpMessage] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const otpRequested = useRef(false);

  const verificationStorageKey = `invite_verified_${token}`;

  useEffect(() => {
    api.setToken(null);
    api.getInvitation(token)
      .then((data) => {
        setInvitation(data.invitation);
        setEmail(data.invitation.email);
        const saved = sessionStorage.getItem(verificationStorageKey);
        if (saved) {
          setVerificationToken(saved);
          setStep(data.invitation.has_account ? "login" : "register");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Invitation not found"))
      .finally(() => setLoading(false));
  }, [token]);

  async function sendOtp(resend = false) {
    setError("");
    setSendingOtp(true);
    try {
      const result = await api.sendInviteOtp(token, { resend });
      setOtpSent(true);
      setOtpMessage(result.message);
      if (result.fallback_otp) setFallbackOtp(result.fallback_otp);
      if (resend) {
        setOtp("");
        setVerificationToken(null);
        sessionStorage.removeItem(verificationStorageKey);
        setStep("otp");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setSendingOtp(false);
    }
  }

  useEffect(() => {
    if (!invitation || invitation.accepted || invitation.expired || otpRequested.current) return;
    otpRequested.current = true;
    sendOtp(false);
  }, [invitation]);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setVerifyingOtp(true);
    try {
      const result = await api.verifyInviteOtp(token, otp);
      setVerificationToken(result.verification_token);
      sessionStorage.setItem(verificationStorageKey, result.verification_token);
      setError("");
      setStep(invitation?.has_account ? "login" : "register");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!verificationToken) {
      setError("Email not verified. Enter the verification code first.");
      setStep("otp");
      return;
    }
    setSubmitting(true);
    try {
      const { token: jwt, project_id } = await api.acceptInvitation(token, {
        name,
        password,
        verification_token: verificationToken,
      });
      sessionStorage.removeItem(verificationStorageKey);
      api.setToken(jwt);
      router.replace(`/dashboard/projects/${project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!verificationToken) {
      setError("Email not verified. Enter the verification code first.");
      setStep("otp");
      return;
    }
    setSubmitting(true);
    try {
      const { token: jwt } = await api.login(email, password);
      api.setToken(jwt);
      const { project_id } = await api.acceptInvitation(token, { verification_token: verificationToken });
      sessionStorage.removeItem(verificationStorageKey);
      router.replace(`/dashboard/projects/${project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = step === "otp" ? 0 : 1;

  function authShell(children: React.ReactNode) {
    return (
      <div className="auth-shell">
        <header className="auth-header">
          <Link href="/" className="app-brand">
            <BrandLogo />
            Webhook Delivery
          </Link>
        </header>
        <main className="auth-main">{children}</main>
      </div>
    );
  }

  if (loading) {
    return authShell(
      <div className="auth-panel">
        <div className="loading-inline" style={{ padding: 24 }}>
          <div className="spinner" />
          <span>Loading invitation...</span>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return authShell(
      <div className="auth-panel">
        <div className="auth-brand-block">
          <h1>Invitation not found</h1>
          <p>{error || "This link may be invalid or expired."}</p>
        </div>
        <Link href="/login" className="btn btn-primary btn-block">Go to sign in</Link>
      </div>
    );
  }

  if (invitation.accepted) {
    return authShell(
      <div className="auth-panel">
        <div className="auth-brand-block">
          <h1>Already accepted</h1>
          <p>
            This invitation to <strong>{invitation.project.name}</strong> was already used.
          </p>
        </div>
        <Link href="/login" className="btn btn-primary btn-block">Sign in</Link>
      </div>
    );
  }

  if (invitation.expired) {
    return authShell(
      <div className="auth-panel">
        <div className="auth-brand-block">
          <h1>Invitation expired</h1>
          <p>
            Ask the project owner to send a new invite link for <strong>{invitation.project.name}</strong>.
          </p>
        </div>
        <Link href="/login" className="btn btn-primary btn-block">Sign in</Link>
      </div>
    );
  }

  return authShell(
    <div className="auth-panel">
      <div className="auth-steps">
        <div className="auth-step-line">
          <div className="auth-step-line-fill" style={{ width: stepIndex === 0 ? "0%" : "100%" }} />
        </div>
        <div className="auth-step">
          <div className={`auth-step-icon ${stepIndex >= 0 ? "active" : ""}`}>
            <Icon name="mark_email_read" size={20} />
          </div>
          <span className={`auth-step-label ${stepIndex >= 0 ? "active" : ""}`}>Verify</span>
        </div>
        <div className="auth-step">
          <div className={`auth-step-icon ${stepIndex >= 1 ? "active" : ""}`}>
            <Icon name="person_add" size={20} />
          </div>
          <span className={`auth-step-label ${stepIndex >= 1 ? "active" : ""}`}>Join</span>
        </div>
      </div>

      <div className="auth-brand-block">
        <h1>Join {invitation.project.name}</h1>
        <p>
          You&apos;ve been invited as <strong>{invitation.role}</strong>.
          {invitation.project.description && <> {invitation.project.description}</>}
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp}>
          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} readOnly />
          </div>
          <p style={{ color: "var(--on-surface-variant)", fontSize: 14, marginBottom: 24, textAlign: "center" }}>
            {otpSent
              ? otpMessage || "We sent a 6-digit verification code to this email."
              : "Sending verification code..."}
          </p>
          {fallbackOtp && (
            <div className="otp-fallback">
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Your verification code</p>
              <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "0.2em", fontFamily: "var(--font-mono)" }}>{fallbackOtp}</p>
              <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 8 }}>
                Email delivery failed. Use this code to continue.
              </p>
            </div>
          )}
          <OtpInput value={otp} onChange={setOtp} />
          <button className="btn btn-primary btn-block" type="submit" disabled={verifyingOtp || otp.length !== 6}>
            {verifyingOtp ? "Verifying..." : "Verify email"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 8 }}
            onClick={() => sendOtp(true)}
            disabled={sendingOtp}
          >
            <Icon name="refresh" size={18} />
            {sendingOtp ? "Sending..." : "Resend code"}
          </button>
        </form>
      )}

      {step === "register" && (
        <form onSubmit={handleRegister}>
          <p style={{ color: "var(--on-surface-variant)", fontSize: 14, marginBottom: 16 }}>
            Email verified. Create your password to join the project.
          </p>
          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} readOnly />
          </div>
          <div className="form-group">
            <label className="label">Your name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? "Joining..." : "Create account & join project"}
          </button>
        </form>
      )}

      {step === "login" && (
        <form onSubmit={handleLogin}>
          <p style={{ color: "var(--on-surface-variant)", fontSize: 14, marginBottom: 16 }}>
            Email verified. Sign in with your existing password to join the project.
          </p>
          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} readOnly />
          </div>
          <div className="form-group">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in & join project"}
          </button>
        </form>
      )}
    </div>
  );
}
