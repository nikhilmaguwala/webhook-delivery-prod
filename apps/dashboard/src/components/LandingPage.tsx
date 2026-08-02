"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo, Icon } from "@/components/Icon";
import { api } from "@/lib/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://webhook-delivery-api.nikhilkmaguwala.workers.dev";

const FEATURES = [
  {
    icon: "replay",
    title: "Automatic retries",
    desc: "Exponential backoff up to 5 attempts. Failed deliveries land in a dead-letter queue — never silently lost.",
  },
  {
    icon: "verified_user",
    title: "HMAC signatures",
    desc: "Every outbound webhook is signed with SHA-256. Verify authenticity on your server in one line.",
  },
  {
    icon: "monitoring",
    title: "Full visibility",
    desc: "Inspect payloads, response codes, and latency. Replay any delivery from the dashboard.",
  },
  {
    icon: "group",
    title: "Project-level teams",
    desc: "Invite teammates per project with Admin or Member roles. OTP-verified email invites.",
  },
  {
    icon: "speed",
    title: "Built for scale",
    desc: "Cloudflare Workers + Queues handle async delivery. Rate limits protect your endpoints.",
  },
  {
    icon: "key",
    title: "API keys per project",
    desc: "Scoped ingestion keys, per-endpoint signing secrets, and idempotency keys built in.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Create a project",
    desc: "Register, add your webhook URL, and copy your API key.",
  },
  {
    num: "02",
    title: "Ingest events",
    desc: "POST events from your app. We fan out to every enabled endpoint.",
  },
  {
    num: "03",
    title: "Monitor & replay",
    desc: "Track success rates, debug failures, and replay with one click.",
  },
];

const CODE = `curl -X POST ${API_URL}/v1/ingest/events \\
  -H "Authorization: Bearer whk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "order.created",
    "payload": { "order_id": "ord_123" }
  }'`;

export function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!api.getToken());
  }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="app-brand">
            <BrandLogo />
            Webhook Delivery
          </Link>
          <nav className="landing-nav-links hide-mobile">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#developers">Developers</a>
          </nav>
          <div className="landing-nav-actions">
            {loggedIn ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm">
                Open dashboard
                <Icon name="arrow_forward" size={16} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary btn-sm hide-mobile">
                  Sign in
                </Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  Get started
                  <Icon name="arrow_forward" size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-container landing-hero-inner">
          <div className="landing-hero-badge">
            <Icon name="bolt" size={14} filled />
            Reliable webhook infrastructure
          </div>
          <h1 className="landing-hero-title">
            Deliver webhooks your users can{" "}
            <span className="landing-gradient-text">trust</span>
          </h1>
          <p className="landing-hero-sub">
            Ingest events once. We sign, deliver, retry, and log every attempt — so you can ship
            integrations without building delivery infrastructure from scratch.
          </p>
          <div className="landing-hero-cta">
            <Link href="/register" className="btn btn-primary btn-lg">
              Start for free
              <Icon name="rocket_launch" size={20} />
            </Link>
            <a href="#developers" className="btn btn-secondary btn-lg">
              <Icon name="code" size={20} />
              View API
            </a>
          </div>
          <div className="landing-hero-stats">
            <div className="landing-stat">
              <span className="landing-stat-value">5×</span>
              <span className="landing-stat-label">Retry attempts</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <span className="landing-stat-value">HMAC</span>
              <span className="landing-stat-label">Signed payloads</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <span className="landing-stat-value">&lt;50ms</span>
              <span className="landing-stat-label">Ingest latency</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-flow" aria-hidden>
        <div className="landing-container">
          <div className="landing-flow-diagram">
            <div className="landing-flow-node">
              <Icon name="deployed_code" size={28} />
              <span>Your app</span>
            </div>
            <div className="landing-flow-line">
              <Icon name="arrow_forward" size={20} />
            </div>
            <div className="landing-flow-node landing-flow-node-primary">
              <Icon name="bolt" size={28} filled />
              <span>Webhook Delivery</span>
            </div>
            <div className="landing-flow-line">
              <Icon name="arrow_forward" size={20} />
            </div>
            <div className="landing-flow-node">
              <Icon name="hub" size={28} />
              <span>Your endpoints</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-container">
          <div className="landing-section-header">
            <p className="landing-eyebrow">Features</p>
            <h2>Everything you need to ship webhooks</h2>
            <p>Production-grade delivery, debugging, and team access — without running your own queue.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="glass-card landing-feature-card">
                <div className="landing-feature-icon">
                  <Icon name={f.icon} size={24} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="landing-section-header">
            <p className="landing-eyebrow">How it works</p>
            <h2>Up and running in minutes</h2>
            <p>No SDK required. REST API + dashboard. Works with any stack.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map((s) => (
              <div key={s.num} className="landing-step">
                <span className="landing-step-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="developers" className="landing-section">
        <div className="landing-container landing-dev-grid">
          <div>
            <p className="landing-eyebrow">Developers</p>
            <h2>One endpoint to ingest them all</h2>
            <p className="landing-dev-desc">
              Send JSON events with an API key. We handle fan-out to every endpoint in the project,
              attach signatures, and queue retries in the background.
            </p>
            <ul className="landing-checklist">
              <li>
                <Icon name="check_circle" size={20} />
                Idempotency keys prevent duplicates
              </li>
              <li>
                <Icon name="check_circle" size={20} />
                Per-endpoint signing secrets
              </li>
              <li>
                <Icon name="check_circle" size={20} />
                Manual replay from the dashboard
              </li>
              <li>
                <Icon name="check_circle" size={20} />
                1,000 events / min rate limit per project
              </li>
            </ul>
            <Link href="/register" className="btn btn-primary" style={{ marginTop: 24 }}>
              Create free account
            </Link>
          </div>
          <div className="landing-terminal">
            <div className="landing-terminal-bar">
              <span className="landing-terminal-dot" />
              <span className="landing-terminal-dot" />
              <span className="landing-terminal-dot" />
              <span className="landing-terminal-title">terminal</span>
            </div>
            <pre className="landing-terminal-body">{CODE}</pre>
          </div>
        </div>
      </section>

      <section className="landing-section landing-cta-section">
        <div className="landing-container">
          <div className="landing-cta-card">
            <h2>Ready to deliver webhooks reliably?</h2>
            <p>Free to start. Email signup. No credit card.</p>
            <div className="landing-hero-cta" style={{ justifyContent: "center" }}>
              <Link href="/register" className="btn btn-primary btn-lg">
                Get started free
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <Link href="/" className="app-brand">
              <BrandLogo />
              Webhook Delivery
            </Link>
            <p>Reliable webhook delivery for modern apps.</p>
          </div>
          <div className="landing-footer-links">
            <Link href="/register">Register</Link>
            <Link href="/login">Sign in</Link>
            <a href={`${API_URL}/health`} target="_blank" rel="noopener noreferrer">
              API status
            </a>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <div className="landing-container">
            <p>© {new Date().getFullYear()} Webhook Delivery. Built on Cloudflare + Neon.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
