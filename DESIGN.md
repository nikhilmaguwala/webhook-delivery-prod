# Webhook Delivery — Design Brief

Document for designers and frontend developers. Describes every page, feature, user flow, and brand/SEO requirements. Visual design will be replaced later; this is the functional and information architecture spec.

---

## Product summary

**Webhook Delivery** is a B2B developer tool for reliably sending webhook events to customer endpoints.

- Users create **projects** (one app / environment each)
- Each project has **webhook endpoints** (URLs that receive POSTs)
- Events are sent via **API key** to our ingest API
- The platform delivers, retries, signs (HMAC), and logs every attempt
- Multiple people can be invited to **one project** (not org-wide teams)

**Live URLs (reference)**

| Environment | URL |
|-------------|-----|
| Dashboard | https://webhook-master-nikhil.vercel.app |
| API | https://webhook-delivery-api.nikhilkmaguwala.workers.dev |

**Auth model**

- Email + password only (no Google, no SSO)
- JWT session stored in browser `localStorage`
- Project invites use email OTP verification before account setup

---

## Brand & visual direction (current placeholder)

| Token | Value | Usage |
|-------|-------|--------|
| Primary | `#6366F1` (indigo) | Buttons, active nav, links |
| Success | Green | Healthy endpoints, delivered status |
| Warning | Orange/amber | Pending, degraded |
| Danger | Red | Failed, disabled, errors |
| Background | Near-black `#0a0a0a` | App shell |
| Surface | Dark gray cards | Panels, tables |
| Font | System UI stack | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| Monospace | For IDs, URLs, API keys | `mono` class |

**Logo mark:** Lightning bolt ⚡ + wordmark **Webhook Delivery**

**Favicon assets** (already in repo)

- `apps/dashboard/public/icon.svg` — 32×32 tab icon
- `apps/dashboard/public/apple-icon.svg` — 180×180 Apple touch icon
- `apps/dashboard/public/site.webmanifest` — PWA manifest

---

## SEO & meta (implemented)

| Item | Value |
|------|--------|
| Site title | Webhook Delivery |
| Title template | `%s \| Webhook Delivery` |
| Default description | Reliable webhook delivery platform. Ingest events, deliver with retries, HMAC signatures, and full visibility. |
| `metadataBase` | `NEXT_PUBLIC_SITE_URL` or production dashboard URL |
| Open Graph | `website`, locale `en_US` |
| Twitter card | `summary_large_image` |
| `robots.txt` | Allow `/`, disallow `/dashboard/` and `/invite/` |
| Keywords | webhooks, delivery, retries, HMAC, API, developer tools |

**Per-page titles to design for**

| Page | Suggested `<title>` |
|------|---------------------|
| Login | Sign in |
| Register | Create account |
| Projects | Projects |
| Project detail | `{Project name}` |
| Invite | Join `{Project name}` |
| Audit logs | Audit Logs |

---

## Global layout (authenticated)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Logo | Projects | Audit Logs     [User name] [Sign out] │
├─────────────────────────────────────────────────────────────┤
│ MAIN CONTENT AREA                                            │
│   Page title + subtitle                                      │
│   Actions (primary/secondary buttons)                        │
│   Cards / tables / forms                                     │
└─────────────────────────────────────────────────────────────┘
```

**Header components**

- Brand link → `/dashboard`
- Nav links: **Projects**, **Audit Logs** (only if user owns an org)
- User display name
- **Sign out** button (clears session → `/login`)

**Mobile:** Hamburger menu for nav links

**Shared UI components to style**

- Buttons: `primary`, `secondary`, `danger`, sizes `sm` / default / `block`
- Form: `label`, `input`, `form-group`, `form-actions`
- Cards: default, `empty-state`, `card-form`, `stat-card`
- Tables: sortable rows, hover, `row-disabled` (red text for disabled endpoints)
- Badges: `success`, `warning`, `danger`, `neutral` — for statuses
- Tabs: horizontal scroll on mobile, no vertical scrollbar
- Copy buttons: copy ID, URL, JSON, API keys, invite links
- Alerts: `alert-danger` for errors
- Loading: full-screen spinner, inline spinner

---

## Pages inventory

### 1. Root `/`

**Purpose:** Redirect only  
**Behavior:** If logged in → `/dashboard`, else → `/login`  
**Design:** Minimal loading text (optional branded splash)

---

### 2. Login `/login`

**Purpose:** Sign in with email + password  
**Auth:** Public  

**Content**

- Brand block (logo, headline, short description)
- Form: Email, Password
- Submit: **Sign in**
- Footer link: → Register
- Error alert on failed login

**States:** default, loading, error

---

### 3. Register `/register`

**Purpose:** Create new account + personal workspace (org)  
**Auth:** Public  

**Content**

- Brand block
- Form: Name, Email, Password (min 8 chars)
- Submit: **Create account**
- Footer link: → Login

**Post-submit:** Redirect to `/dashboard`

---

### 4. Projects list `/dashboard`

**Purpose:** Home after login — all projects user can access  
**Auth:** Required  

**Content**

- **Page header:** Title “Projects”, subtitle
- **Action:** “+ New Project” (only for org owner/admin)
- **Project grid:** Cards with name, description, slug, “Shared with you” badge if invited-only access
- **Empty state:** Icon, message, CTA to create project

**Create project modal/card**

- Name (required)
- Description (optional)
- Create / Cancel

---

### 5. Project detail `/dashboard/projects/[id]`

**Purpose:** Main operational hub for one project  
**Auth:** Required (owner, org member, or project invitee)  

**Top bar**

- ← Back to projects
- Project ID + Copy ID button

**Tab navigation** (horizontal, 6 tabs)

| Tab | Purpose |
|-----|---------|
| **Overview** | Stats + endpoint health |
| **Endpoints** | Webhook receiver URLs |
| **Deliveries** | Delivery log + inspect/replay |
| **Events** | Ingested events list |
| **API Keys** | Keys for sending events |
| **Members** | Invite collaborators |

---

#### Tab: Overview

**Stat cards (4-up grid)**

1. Total deliveries  
2. Success rate %  
3. Avg response time (ms)  
4. Pending count  

**Endpoint health table**

| Column | Notes |
|--------|--------|
| URL | Truncate long URLs |
| Status | healthy / degraded / unhealthy / disabled |
| Avg response | ms or — |
| Failures | consecutive failure count |

Disabled endpoints: row styled in red

---

#### Tab: Endpoints

**Add endpoint form:** URL input + Add button  

**One-time secret banner** (after create)

- Signing secret shown once
- Copy block + Dismiss
- Helper text: used on *your server* to verify incoming webhooks

**Table**

| URL | Status | Enabled | Actions |
|-----|--------|---------|---------|
| Copy URL button | Badge | Enabled/Disabled text | Enable / Disable toggle |

---

#### Tab: Deliveries

**Table**

| Event type | Endpoint | Status | Attempts | Response code | Time | Actions |
|------------|----------|--------|----------|---------------|------|---------|

**Actions per row:** Inspect, Replay  

**Delivery detail panel** (expand below table)

- Full JSON (delivery, event, attempts, dead letter)
- Copy JSON
- Close

---

#### Tab: Events

**Table**

| Type | ID (copy) | Created | Payload |
|------|-----------|---------|---------|

Payload: collapsible “View payload” with JSON + copy

---

#### Tab: API Keys

**One-time key banner** (after create)

- Full API key (copy)
- Example `curl` command (copy)
- Dismiss

**Create form:** Key name + Create Key  

**Table**

| Name | Prefix | Created | Status | Actions |
|------|--------|---------|--------|---------|
| | whk_live_… | date | Active/Revoked | Revoke |

---

#### Tab: Members

**Purpose:** Invite people to *this project only* and manage roles

**Role definitions**

| Role | Who | Permissions |
|------|-----|-------------|
| **Creator** | User who created the project | Full access. Shown first in list. Cannot be removed or demoted. |
| **Admin** | Invited with admin role | Manage endpoints, API keys, deliveries, replays, invites, remove members |
| **Member** | Invited with member role | View-only — can see data but cannot change settings |

**Role legend** — callout box explaining all three roles

**Invite form** (Creator/Admin only)

- Email input
- Role dropdown: Member (view only) / Admin (full manage)
- “Create invite link” button

**People with access** — card list (not table)

- Name, email, joined date, “You” badge
- Creator badge (purple), Admin (green), Member (gray)
- Admin actions: change role dropdown, “Remove access” button
- Creator row: no remove/change actions

**Pending invitations table**

| Email | Role | Status | Invite link | Actions |
|-------|------|--------|-------------|---------|
| | Admin/Member badge | Pending/Expired | Copy URL | Revoke |

**View-only banner** — shown at top of project page for Members

---

### 6. Audit logs `/dashboard/audit?org={orgId}`

**Purpose:** Org-level activity log  
**Auth:** Required  

**Table**

| Action | Resource | IP | Time |

Badge for action type. Empty state if no logs.

---

### 7. Project invite onboarding `/invite/[token]`

**Purpose:** Accept project invitation  
**Auth:** Public (multi-step)  

**Flow (3 steps)**

```
Step 1: OTP verification
  → Auto-send 6-digit code to invited email
  → User enters code → Verify email
  → Resend code button

Step 2a (new user): Set password
  → Email (read-only), Name, Password
  → Create account & join project

Step 2b (existing user): Sign in
  → Email (read-only), Password
  → Sign in & join project
```

**Error states**

- Invitation not found
- Already accepted → link to login
- Expired → ask owner for new link
- Invalid OTP
- Email send failure

**Design notes**

- Same auth shell layout as login/register
- Clear step indicator optional (Verify → Account)
- OTP input: 6 digits, numeric keyboard on mobile

---

## User flows (for journey maps)

### New user registration

1. `/register` → create account  
2. `/dashboard` → create first project  
3. Project → API Keys → create key  
4. Project → Endpoints → add URL, save signing secret  
5. Send test event via API / curl  

### Invite teammate to project

1. Project owner → Members tab  
2. Enter email → Create invite link  
3. Copy URL → send via Slack/email  
4. Invitee opens `/invite/{token}`  
5. OTP sent → verify → set password or login  
6. Redirect to project dashboard  

### Debug failed webhook

1. Project → Deliveries  
2. Find failed row → Inspect  
3. View attempts, response body, errors  
4. Optional: Replay  

---

## Status vocabulary (use consistent colors)

| Domain | Values |
|--------|--------|
| Endpoint health | `healthy`, `degraded`, `unhealthy`, `disabled` |
| Delivery | `pending`, `delivering`, `delivered`, `failed`, `dead_lettered` |
| API key | `Active`, `Revoked` |
| Invite | `Pending`, `Expired` |
| Member role | `creator`, `admin`, `member` |

---

## Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| Desktop ≥1024px | Full nav, multi-column stat grid |
| Tablet 768–1023px | 2-column stats, scrollable tabs |
| Mobile <768px | Hamburger nav, stacked forms, horizontal table scroll |

---

## Assets checklist for designer

- [ ] Logo (SVG, light + dark)
- [ ] Favicon set (16, 32, 180, 512) — placeholder SVG exists
- [ ] OG image 1200×630 (`opengraph-image.png` for Next.js)
- [ ] Empty state illustrations (no projects, no deliveries)
- [ ] Email template: OTP verification (HTML matches brand)
- [ ] Icon set for nav/tabs if replacing emoji ⚡ 📦

---

## What is OUT of scope (do not design)

- Organization / team management pages (removed)
- Google / OAuth login
- Billing / pricing
- Public marketing landing page (only auth + dashboard)
- Mobile native apps

---

## Technical notes for handoff

- Framework: **Next.js 15** App Router
- Styling: global CSS variables in `apps/dashboard/src/app/globals.css`
- API base: `NEXT_PUBLIC_API_URL`
- Email OTP: Resend (`RESEND_API_KEY`, `EMAIL_FROM` on API worker)

---

## File map (dashboard routes)

```
/                          → redirect
/login                     → sign in
/register                  → sign up
/dashboard                 → projects list
/dashboard/projects/[id]   → project tabs
/dashboard/audit           → audit logs
/invite/[token]            → invite + OTP onboarding
```

---

*Last updated: August 2026 — aligned with production feature set.*
