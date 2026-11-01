# North Star Radar — Mobile API

Base URL: `https://www.nsradar.co.il/api/mobile` (HTTPS only).
All responses are JSON. Every endpoint except `login` and `refresh` needs:

```
Authorization: Bearer <token>
```

## Errors

Every error has the same shape:

```json
{ "error": { "code": "invalid_token", "message": "…", "retry_after": 120 } }
```

`retry_after` (in seconds) appears only on `429` responses, and also in the `Retry-After` header.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request`, `invalid_cursor` | A parameter is wrong or missing. |
| 401 | `unauthorized`, `invalid_token` | The Bearer token is missing, invalid or expired. Call `refresh`, then retry once. |
| 401 | `invalid_credentials`, `invalid_refresh_token` | Wrong email or password, or a dead refresh token. Show the login screen. |
| 403 | `https_required` | The request was sent over plain HTTP. |
| 403 | `no_company` | The account has no business profile yet. |
| 429 | `too_many_attempts`, `rate_limited` | Wait `retry_after` seconds before trying again. |
| 5xx | `server_error`, `unavailable` | A server-side failure. Retry later. |

## Rate limits

- **Login:** 5 *failed* attempts per email, and separately per IP, in 15 minutes. After that, login returns `429` until the window ends. A successful login resets both counters.
- **Refresh:** 30 per IP in 15 minutes.
- **Authenticated endpoints:** 60 requests per minute per account.

---

## POST `/auth/login`

There is no auth on this endpoint.

Request body:

```json
{ "email": "owner@business.co.il", "password": "…" }
```

`200` response:

```json
{
  "token": "eyJ…",
  "refresh_token": "v1.abc…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": 1793000000,
  "company_id": "uuid"
}
```

Possible errors: `400`, `401 invalid_credentials`, `403 no_company`, `429 too_many_attempts`.

Store both tokens in secure storage (Keychain or Keystore).

## POST `/auth/refresh`

There is no auth on this endpoint.

Request body:

```json
{ "refresh_token": "v1.abc…" }
```

The `200` response has the same shape as `login`.

Refresh tokens **rotate**. Every refresh returns a new `refresh_token`, and the old one stops working. Always save the new one.

Possible errors: `400`, `401 invalid_refresh_token` (send the user to the login screen), `429`.

**Suggested app flow:**

1. Before `expires_at`, or after any `401 invalid_token`, call `refresh`.
2. Retry the original request once.
3. If `refresh` itself returns `401`, show the login screen.

## GET `/feed`

Requires a Bearer token. Returns the business's activity feed, newest first.

| Query parameter | Default | Description |
|---|---|---|
| `limit` | 20 | Number of items, from 1 to 50. |
| `cursor` | – | The `next_cursor` value from the previous page. |
| `types` | all | Comma-separated item types. The options are `news`, `opportunity`, `tender`, `conference`, `lead` and `competitor_update`. |

`200` response:

```json
{
  "items": [
    {
      "id": "news:6f1c…",
      "type": "news",
      "title": "…",
      "summary": "…",
      "date": "2026-10-30T08:00:00.000Z",
      "source_url": "https://…",
      "read_status": "unread",
      "payload": { "source": "ynet", "category": "ישראל", "sentiment": "neutral" }
    }
  ],
  "next_cursor": "eyJkIjoi…"
}
```

When `next_cursor` is `null`, there are no more items.

Any field may be `null`. The `payload` fields depend on the item type:

| `type` | `payload` fields |
|---|---|
| `news` | `source`, `category`, `sentiment` |
| `opportunity` | `impact_score`, `confidence_score`, `priority`, `opportunity_type`, `actions[]`, `sources[]` |
| `tender` | `organization`, `deadline`, `budget`, `relevance_score` |
| `conference` | `event_date`, `location`, `category` |
| `lead` | `industry`, `location`, `score`, `source` |
| `competitor_update` | `competitor_name`, `links {website, instagram, facebook, linkedin, maps}`, `activity` (posting cadence, themes, top posts, followers), `reviews` (Google rating, count, recent and new reviews, sentiment, themes) |

## POST `/feed/read`

Requires a Bearer token. Marks feed items as read, or as unread with `"read": false`.

Request body:

```json
{ "ids": ["news:6f1c…", "lead:91ab…"], "read": true }
```

`200` response:

```json
{ "updated": 2, "read_status": "read" }
```

## GET `/profile`

Requires a Bearer token.

`200` response:

```json
{
  "company_id": "uuid",
  "name": "…",
  "industry": "…",
  "area": "תל אביב",
  "website": "https://…",
  "keywords": ["…"],
  "report_url": "https://www.nsradar.co.il/r/<token>"
}
```

`report_url` is the permanent web report link. It is `null` if the business has no report yet.

---

### Security notes for the owner

- **Business scoping.** The server uses the Supabase service role, which bypasses RLS. So each business's data is scoped in code:
  - The company id comes **only** from the verified token (`companies.id` is the auth user id). The request never supplies it.
  - Every query goes through `scopedDb(companyId)` in `lib/mobile/core.ts`, which adds `.eq(company_id, …)` itself. A client cannot request another business's data.
- **One-time setup.** Run `supabase/add_mobile_api.sql` before connecting the API to production. It creates the shared rate-limit table and function, and the read-status table.
