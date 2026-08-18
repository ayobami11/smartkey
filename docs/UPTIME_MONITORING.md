# Uptime monitoring for `/api/health`

Handover note. This is a dashboard action on a third-party site — nothing
here can be finished from the repo alone.

## Why this exists

`src/app/api/health/route.ts` already explains the core reasoning in its own
comments: the landing page (`/`) is statically rendered, so it returns `200`
even when Postgres is completely down. A monitor pointed at `/` shows green
through a total outage. `/api/health` runs a real query and returns `503`
when that query fails, so it's the only URL that actually proves the system
is up.

The route was built with UptimeRobot in mind (see its docstring), but any
monitor that can do a plain HTTP GET and check the status code works the
same way.

## What to configure

| Setting                  | Value                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitor type             | HTTP(s)                                                                                                                                                                   |
| URL                      | `https://smartkey-ochre.vercel.app/api/health`                                                                                                                            |
| Method                   | GET                                                                                                                                                                       |
| Expected status          | `200`                                                                                                                                                                     |
| Alert on                 | Non-`200` (covers the `503` the route returns on DB failure)                                                                                                              |
| Keyword check (optional) | Alert if the body does _not_ contain `"status":"ok"` — this also catches `"status":"degraded"` (query succeeded but took over 1s), which a plain status-code check misses |
| Interval                 | 5 minutes is the cadence the route's own comments assume (see `head: true` query note)                                                                                    |

Response body on success:

```json
{
  "data": {
    "status": "ok",
    "database": "up",
    "latency_ms": 42,
    "timestamp": "..."
  },
  "error": null,
  "status": 200
}
```

On failure (`503`):

```json
{ "data": null, "error": "Database unreachable", "status": 503 }
```

If a custom production domain exists beyond `smartkey-ochre.vercel.app`,
point the monitor there instead — same path, same behavior.

## Step 1 — create the monitor

In the UptimeRobot dashboard (or equivalent): **Add New Monitor** → HTTP(s) →
paste the URL and settings above → save.

## Step 2 — set an alert contact

Point it at whichever email/SMS/Slack contact should page on an outage. Not
prescribed here — depends on who's on call.

## Step 3 — verify

Trigger a manual check from the monitor's dashboard right after creating it
and confirm it reports up. To confirm the failure path actually alerts
(optional, higher-effort): temporarily break Supabase connectivity in a
non-production environment running the same route and confirm a `503` fires
an alert — not required before calling this done, since the route's own
logic is already covered by reading the code, but worth doing once if this
monitor is meant to be trusted during a real incident.

## If you have an UptimeRobot API key

UptimeRobot has a REST API (`api.uptimerobot.com/v2/newMonitor`) that can
create the monitor without touching the dashboard. If there's a "Main API
Key" already generated for this account, hand it over and the monitor above
can be created with one `curl` call instead of the manual steps — otherwise
this stays a dashboard-only task.
