# ADR 0003 — Rule-based risk scoring (not learned)

**Status**: accepted, 2026-05

## Context

The project proposal mentioned AI-powered risk scoring. The natural reading is "machine-learned model" but this would introduce: training data we don't have, opacity of decisions, challenge of explaining scores to verifiers, inability to audit per-rule contribution.

## Decision

Implement risk scoring as a deterministic rule-based engine in pure TypeScript:

- Each rule is named, has a description in plain English, and a configurable weight.
- A request's score is the sum of weights for rules it triggers.
- Tier thresholds are configurable from the CSO settings page.
- The engine returns both the tier and the contributing factors.

## Consequences

- Risk decisions are auditable and explainable. Verifiers see the factors that drove a tier; CSOs can adjust weights with a clear effect.
- No training data needed; no ML ops burden.
- Cannot detect novel patterns the rules don't anticipate. Mitigation: the CSO can add rules over time; the audit log lets us identify missed cases retrospectively.
- The verifier UI's "View factors" popover is required, not optional; without it, the rule-based design loses its main advantage over a learned model.
