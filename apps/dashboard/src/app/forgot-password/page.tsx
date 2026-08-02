"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/Icon";
import { OtpInput } from "@/components/OtpInput";

type Step = "email" | "otp" | "password" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(resend = false) {
    setError("");
    setLoading(true);
    try {
      const result = await api.sendPasswordResetOtp(email, { resend });
      setMessage(result.message);
      if (result.fallback_otp) setFallbackOtp(result.fallback_otp);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.verifyPasswordResetOtp(email, otp);
      setResetToken(result.reset_token);
      setMessage(result.message);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const result = await api.resetPassword(email, resetToken, password);
      api.setToken(result.token);
      setStep("done");
      setTimeout(() => router.replace("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Link href="/" className="app-brand">
          <BrandLogo />
          Webhook Delivery
        </Link>
      </header>

      <main className="auth-main">
        <div className="auth-panel">
          <div className="auth-brand-block">
            <h1>Reset password</h1>
            <p>
              {step === "email" && "Enter your account email and we will send a verification code."}
              {step === "otp" && "Enter the 6-digit code we sent to your email."}
              {step === "password" && "Choose a new password for your account."}
              {step === "done" && "Password updated. Redirecting to your dashboard..."}
            </p>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {message && step !== "done" && <div className="alert alert-info">{message}</div>}

          {step === "email" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendOtp(false);
              }}
            >
              <div className="form-group">
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset code"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp}>
              {fallbackOtp && (
                <div className="otp-fallback">
                  <p className="text-muted">Email delivery failed. Use this code:</p>
                  <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "0.2em", fontFamily: "var(--font-mono)" }}>
                    {fallbackOtp}
                  </p>
                </div>
              )}
              <OtpInput value={otp} onChange={setOtp} />
              <button className="btn btn-primary btn-block" type="submit" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying..." : "Verify code"}
              </button>
              <button
                className="btn btn-ghost btn-block"
                type="button"
                onClick={() => handleSendOtp(true)}
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? "Sending..." : "Resend code"}
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label className="label">New password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <div className="form-group">
                <label className="label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="alert alert-success">Password updated successfully.</div>
          )}

          <p className="auth-footer">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
