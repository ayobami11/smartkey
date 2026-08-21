---
version: alpha
name: SmartKey
description: Design system for the SmartKey AI-powered key request and approval system at the University of Lagos. Institutional but modern, anchored on UNILAG maroon, optimised for non-technical users operating under time pressure at a security desk.

colors:
  # Brand
  primary: '#7B1F2D'
  primary-foreground: '#FFFFFF'
  primary-dark: '#B33A4A'
  primary-dark-foreground: '#FFFFFF'
  primary-deep: '#5A1620'
  gold: '#D4A437'

  # Neutral / surface (light mode)
  background: '#FFFFFF'
  surface: '#FFFFFF'
  on-surface: '#0F172A'
  muted: '#F8FAFC'
  muted-foreground: '#64748B'
  border: '#E2E8F0'
  input: '#E2E8F0'
  ring: '#7B1F2D'

  # Neutral / surface (dark mode)
  background-dark: '#0A0A0F'
  surface-dark: '#18181B'
  on-surface-dark: '#F8FAFC'
  muted-dark: '#27272A'
  muted-foreground-dark: '#A1A1AA'
  border-dark: '#27272A'
  input-dark: '#27272A'
  ring-dark: '#B33A4A'

  # Secondary (subtle UI surfaces)
  secondary: '#F1F5F9'
  secondary-foreground: '#0F172A'
  secondary-dark: '#27272A'
  secondary-dark-foreground: '#F8FAFC'

  # Accent (callouts, highlight surfaces)
  accent: '#FEF3C7'
  accent-foreground: '#78350F'
  accent-dark: '#44403C'
  accent-dark-foreground: '#FBBF24'

  # Status
  success: '#10B981'
  success-foreground: '#FFFFFF'
  success-soft: '#D1FAE5'
  success-strong: '#065F46'
  warning: '#F59E0B'
  warning-foreground: '#FFFFFF'
  warning-soft: '#FEF3C7'
  warning-strong: '#78350F'
  error: '#DC2626'
  error-foreground: '#FFFFFF'
  error-soft: '#FEE2E2'
  error-strong: '#7F1D1D'
  info: '#3B82F6'
  info-foreground: '#FFFFFF'
  info-soft: '#DBEAFE'
  info-strong: '#1E3A8A'

  # Risk tiers (semantic aliases of status, used on the verifier dashboard)
  risk-low: '#10B981'
  risk-low-soft: '#D1FAE5'
  risk-low-strong: '#065F46'
  risk-medium: '#F59E0B'
  risk-medium-soft: '#FEF3C7'
  risk-medium-strong: '#78350F'
  risk-high: '#DC2626'
  risk-high-soft: '#FEE2E2'
  risk-high-strong: '#7F1D1D'

typography:
  headline-display:
    fontFamily: Fraunces
    fontSize: 60px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Fraunces
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Fraunces
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.01em
  heading-xl:
    fontFamily: DM Sans
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
  heading-lg:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
  heading-md:
    fontFamily: DM Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  heading-sm:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.02em
  code-display:
    fontFamily: JetBrains Mono
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0.1em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.4
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  4xl: 96px
  base: 16px
  gutter: 24px
  page-padding: 24px
  page-padding-mobile: 16px

components:
  # Primary action button (UNILAG maroon)
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px
  button-primary-hover:
    backgroundColor: '{colors.primary-deep}'
    textColor: '{colors.primary-foreground}'
  button-primary-disabled:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'

  # Secondary (subtle) button
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px
  button-secondary-hover:
    backgroundColor: '{colors.muted}'

  # Destructive action button
  button-destructive:
    backgroundColor: '{colors.error}'
    textColor: '{colors.error-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px

  # Ghost / link button
  button-ghost:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px

  # Surface containers
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: 24px
  card-dark:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.on-surface-dark}'

  # Form input
  input:
    backgroundColor: '{colors.background}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px
  input-focus:
    backgroundColor: '{colors.background}'
    textColor: '{colors.on-surface}'
  input-error:
    backgroundColor: '{colors.error-soft}'
    textColor: '{colors.on-surface}'

  # Application bar (top of every authenticated screen)
  app-bar:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.heading-sm}'
    padding: 16px

  # Risk tier badges (verifier dashboard)
  badge-risk-low:
    backgroundColor: '{colors.risk-low-soft}'
    textColor: '{colors.risk-low-strong}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 8px
  badge-risk-medium:
    backgroundColor: '{colors.risk-medium-soft}'
    textColor: '{colors.risk-medium-strong}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 8px
  badge-risk-high:
    backgroundColor: '{colors.risk-high-soft}'
    textColor: '{colors.risk-high-strong}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 8px
  badge-neutral:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 8px

  # Verification code display (the 6-digit OTP shown to the requester)
  verification-code-display:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    typography: '{typography.code-display}'
    rounded: '{rounded.lg}'
    padding: 32px

  # Key tile (used on Dean key grid and Requester authorised-keys grid)
  key-tile:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.heading-md}'
    rounded: '{rounded.md}'
    padding: 24px

  # Persistent banners
  offline-banner:
    backgroundColor: '{colors.warning-soft}'
    textColor: '{colors.warning-strong}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.none}'
    padding: 12px
  high-risk-banner:
    backgroundColor: '{colors.risk-high-soft}'
    textColor: '{colors.risk-high-strong}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 16px
  success-banner:
    backgroundColor: '{colors.success-soft}'
    textColor: '{colors.success-strong}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 16px
---

# SmartKey Design System

## Overview

SmartKey is a digital key management system for the University of Lagos Senate Building. It replaces a paper logbook used by four roles — Chief Security Officer (CSO), Deans, security verifiers at the desk, and university staff (requesters) — with role-specific dashboards, immutable audit trails, and three AI components: rule-based risk scoring, Gemini-generated shift reports, and pixel-level signature verification.

The visual language reads as a modern operational tool issued by a heritage institution. UNILAG's deep maroon carries identity; quiet neutrals carry information density; status colours are reserved exclusively for risk, alerts, and confirmations. Brand colour appears only on primary actions, the application bar, and brand surfaces — never decoratively.

The product is bilingual in usage modes, not language: it must read instantly under time pressure at a 24/7 security desk _and_ be patient enough for occasional staff users on a phone. Every flow targets three interactions or fewer from the relevant dashboard's home screen. Every consequential action ends in a named, persistent confirmation that says what happened and who did it.

The system supports light and dark themes as first-class peers. Light is the default; dark is a fully designed theme for the security desk's overnight shifts. Both themes share the same component vocabulary — only token values change.

## Colors

The palette is anchored on UNILAG's institutional maroon and supported by a quiet neutral system that lets information density carry through clearly.

- **Primary (`#7B1F2D` UNILAG Maroon)**: heritage colour of the institution. Reserved for primary actions, the application bar, brand surfaces, and the focus ring. Never used for decoration. In dark mode, the primary lightens to `#B33A4A` to maintain WCAG AA contrast on dark surfaces.
- **Primary deep (`#5A1620`)**: hover and pressed state for primary actions in light mode.
- **Gold (`#D4A437`)**: institutional accent inherited from UNILAG ceremonial use. Reserved for the wordmark and rare moments of celebration; never an interactive colour.
- **Background and surface**: pure white in light mode; warm near-black `#0A0A0F` in dark mode. Cards sit on `#18181B` in dark to maintain a soft brand temperature rather than a cold neutral.
- **Muted**: `#F8FAFC` in light, `#27272A` in dark. Used for table stripes, empty backgrounds, and subtle section separations.
- **Border**: low-contrast `#E2E8F0` (light) / `#27272A` (dark). Borders define structure; they never compete with content.
- **Status colours** are semantic only. They appear paired with an icon and a text label in every use, so colour is never the sole carrier of meaning (WCAG 1.4.1).
  - **Success / Risk Low (`#10B981`)**: confirmations, returned keys, low-risk indicator.
  - **Warning / Risk Medium (`#F59E0B`)**: pending review, medium-risk indicator.
  - **Error / Risk High (`#DC2626`)**: high-risk requests, validation errors, overdue keys.
  - **Info (`#3B82F6`)**: neutral system messages.

Dark mode tokens are suffixed `-dark` (e.g., `background-dark`, `surface-dark`, `primary-dark`). The active theme swaps these via a CSS class on the document root. Status colours use the same hex in both modes, paired with the lighter risk-soft surfaces in light and slightly desaturated soft variants in dark.

## Typography

Three families. The display family carries the institutional voice; the operational sans serif carries every dashboard; the monospace is reserved for verification codes and timestamps where character disambiguation matters operationally.

- **Display (Fraunces)**: a contemporary transitional serif used for landing-page hero, page H1s, and report covers. It evokes scholarship without feeling dated. Used at weight 600 with optical-size set by the rendered size. Never used inside dashboards — Fraunces is a brand surface, not a UI surface.
- **UI (DM Sans)**: the workhorse. Every label, button, table row, and form field is DM Sans. It is highly legible at small sizes for non-technical users, supports the full weight range, and pairs cleanly with Fraunces.
- **Monospace (JetBrains Mono)**: reserved for the 6-digit verification code, audit-log timestamps, request IDs, and key codes. Disambiguates O/0 and l/1 — operationally important when an officer is reading a code aloud or transcribing one.

The 6-digit verification code is the signature typographic moment of the product. It renders at 64px in JetBrains Mono with generous letter-spacing, large enough to read across a desk, and sits inside its own card as the primary content of the requester's screen after a request is approved.

## Layout

A 4px base unit with an 8px primary rhythm. Every value in the spacing scale is a multiple of 4px; do not invent intermediate values.

- **Mobile**: single-column, fluid grid. Page padding 16px. Touch targets ≥ 44×44px (WCAG 2.5.5). Primary CTAs stretch full-width and stick to the bottom of the viewport on long flows like the issue-key sheet.
- **Tablet (≥ 768px)**: two-column layouts available; Dean and Requester key grids expand to 3 columns.
- **Desktop (≥ 1024px)**: 12-column grid, 24px gutters, max content width 1280px on widest screens. Verifier dashboard splits 60/40 (queue/outstanding); CSO dashboard splits into three columns (live counters, anomaly feed, events stream).

Cards are the primary container. Internal padding is 24px on desktop and 16px on mobile. Cards never nest more than one level deep.

The verifier dashboard at the security desk runs on a shared desktop and must be readable across the desk: prefer larger type, more whitespace, and one piece of authoritative information per region rather than dense info-graphics.

## Elevation & Depth

Elevation is restrained. Cards rest on the surface with a subtle 1px border (`border` token) and a near-imperceptible 2px shadow `0 2px 4px rgba(15,23,42,0.06)` to define edges without lifting them. On hover, cards gain a slightly stronger shadow `0 4px 8px rgba(15,23,42,0.08)` to communicate interactivity.

Modals and popovers carry stronger elevation `0 8px 24px rgba(15,23,42,0.12)` to separate them clearly from page content. In dark mode, shadows are replaced by a stronger border (`#3F3F46`) since shadows are illegible against deep backgrounds.

Hierarchy is conveyed primarily through type weight and colour contrast, not elevation. Never use elevation to substitute for proper information architecture.

## Shapes

The shape language is `8px-default-rounded`. Buttons, cards, and inputs all share `rounded.md` (8px) — soft enough to feel modern, structured enough to read as institutional. Inputs and badges may use `rounded.sm` (4px) where compactness matters. Pills and avatars use `rounded.full`. Modals use `rounded.lg` (12px) to subtly differentiate from page-level cards.

Never mix sharp and rounded corners in the same view. The 0px radius is reserved exclusively for full-bleed banners that intentionally read as system messages rather than UI elements (the offline banner, for example).

## Components

Components extend the shadcn/ui base library with SmartKey-specific additions. Refer to the YAML token block above for exact values; the prose below explains application.

- **Buttons**: `button-primary` for the single most important action per screen (one only); `button-secondary` for alternative actions; `button-ghost` for navigation-style actions; `button-destructive` for actions that delete or reverse state. On dashboards with a clear primary action (Issue, Approve, Submit), the primary button is sticky on mobile and prominent on desktop.
- **Cards** are the default container. They group related information, never decorate. A card without content inside is a structural error.
- **Input fields** carry a left-aligned label above (never inside the field as a placeholder, since placeholders disappear on focus and fail screen readers). Helper text below the field. Error state replaces helper text and turns the border and icon to `error`.
- **Risk tier badges** (`badge-risk-low`, `badge-risk-medium`, `badge-risk-high`) appear on the verifier dashboard for every queued request. The badge is at `heading-md` size — non-trivial — paired with a shield icon. A "View factors" link beneath the badge opens a popover listing each contributing rule and its weight. For high-risk requests, the issue flow inserts an explicit acknowledgement step.
- **Verification code display** is the requester's anchor moment. The component renders the 6-digit code at `code-display` size (64px JetBrains Mono) inside a generously padded card, with a copy-to-clipboard control and a 10-minute expiry countdown. On expiry, the code is replaced by a "Request a new code" CTA in the same surface.
- **Key tile** is used in two places: the Dean key grid (showing the three authorisation slots filled or vacant) and the Requester authorised-keys grid. The tile shows zone, room name, and key code; tapping opens slot management (Dean) or the request sheet (Requester).
- **Offline banner** is persistent, full-bleed, top-of-screen, `warning-soft` background. While shown, destructive and authoritative actions disable; tooltip on a disabled button reads "Available again when you reconnect."
- **Application bar** is the only place where the maroon `primary` colour spans a large surface. It carries the SmartKey wordmark, the active user identity, the realtime-connection indicator (small green/amber/red dot), and the profile dropdown.

## Iconography

Use lucide-react as the single icon library (the same set ships with shadcn/ui). Icons render at 20px in body contexts, 16px in compact contexts, 24px on standalone interactive controls. Stroke 1.5px for body, 2px on small targets to maintain visibility.

Custom icons designed to match lucide stroke conventions:

- **Key icon variants**: in-zone, issued, returned, overdue, weekend.
- **Risk tier icons**: shield-low, shield-medium, shield-high.
- **SmartKey product mark** (a custodial monogram pairing K with a key glyph).

Icons that convey meaning have a minimum 3:1 contrast against their background. Decorative icons may go lower but must have `aria-hidden="true"`.

## Motion

Motion is restrained, purposeful, and respects `prefers-reduced-motion` globally.

- **Duration tokens**: fast 150ms (hover, focus), base 200ms (default), slow 300ms (modals, drawers).
- **Easing**: `cubic-bezier(0.2, 0, 0, 1)` for the standard ease.
- New realtime items slide in over 200ms; nothing animates longer than 300ms.
- Skeleton loaders use a subtle shimmer that disables under reduced-motion.

No motion ever conveys essential information. A new request appearing must also produce a non-motion cue (sound, optional, off by default; or a count-badge update).

## Accessibility

Floor: WCAG 2.2 AA across every flow. Audit:

- **Contrast**: all body text ≥ 4.5:1, large text ≥ 3:1, meaningful icons ≥ 3:1. Validated by the DESIGN.md linter and by axe-core in the E2E suite.
- **Focus visible**: every interactive element has a 2px maroon outline with 2px offset. Never remove the default focus ring; replace it with the design-system one.
- **Keyboard navigation**: tab order follows visual order. Every flow completable by keyboard alone. Modals trap focus and return it on close. Escape closes any overlay.
- **Screen reader**: every form field has a real label (not just a placeholder); every status badge has an `aria-label`; live regions announce realtime updates ("New request from Dr. Bakare") at polite priority.
- **Colour as carrier**: never used alone. Risk tiers use colour + icon + text. Validation states use colour + icon + helper text.
- **Touch targets**: minimum 44×44px (WCAG 2.5.5).
- **Timeouts**: the 10-minute code expiry is operational, not interactive — show clear remaining time and let the user request a new code.

## Voice & Tone

- Sentence case for buttons, labels, and headings. Title Case is reserved for proper nouns and the wordmark.
- Active voice. "Issue key" not "Key will be issued."
- Address users by name and title where known: "Good afternoon, Officer Musa."
- Time format 24-hour: `14:32`. Date format `Wed 6 May 2026`. ISO `2026-05-06` only inside the audit log.
- Errors are calm, never alarmist: "High-risk request — review before issuing." not "WARNING!"
- Never expose stack traces. Surface a correlation ID for support: "Error reference: 7f3e9b22 — share this with the CSO if you contact support."

Standard strings (use verbatim — consistency across screens is part of usability):

- Submit confirmation: "Request submitted. Check your email for the code."
- Code expired: "This code has expired. Request a new one to continue."
- High-risk acknowledgement: "I have reviewed the contributing factors above."
- Issue success: "Issued to {name} at {time}."
- Return success: "Returned by {name} at {time}."
- Approval success: "Approved. {requester} has been notified by email."
- Generic destructive confirmation: "This cannot be undone. Continue?"
- Offline banner: "You are offline. Live updates are paused. New requests will appear when you reconnect."

## Do's and Don'ts

- **Do** use the maroon `primary` colour for one action per screen — the most important thing the user can do here.
- **Do** pair every status colour with an icon and a text label.
- **Do** keep core tasks within three interactions of the dashboard home.
- **Do** end every consequential action with a persistent named confirmation, not just a toast.
- **Do** disable destructive actions while offline; never let a verifier believe a key was logged when it has not yet synced.
- **Do** show AI outputs (risk tier, signature match, generated report) inspectably — let users see the contributing factors.
- **Don't** use the maroon `primary` colour decoratively. It carries identity and authority; spreading it dilutes both.
- **Don't** use placeholders as labels. They disappear on focus and fail screen readers.
- **Don't** mix sharp and rounded corners in the same view.
- **Don't** use Fraunces inside dashboards. It is a brand surface, not a UI surface.
- **Don't** convey state through colour alone.
- **Don't** rely on motion for essential information; many users have reduced-motion enabled.
- **Don't** present any AI output as a black-box decision. The institution's users must be able to challenge what the system says.
