# Creator Card Microservice — Solution

A REST API for publishing shareable creator profile cards ("link-in-bio" cards
with rate cards attached), implemented on the provided Resilience 17 Node.js
backend template.

- `POST /creator-cards` — create a card
- `GET /creator-cards/:slug` — public retrieval (respects draft + private access)
- `DELETE /creator-cards/:slug` — soft-delete a card

All endpoints live at the **root** of the base URL (no `/v1`, no `/api`) and
require **no authentication**.

---

## Where everything lives (template structure)

The implementation follows the template's layered architecture
(`endpoint → service → repository → database`) and conventions exactly:

| Concern | File(s) |
|---|---|
| Endpoints (routing only) | `endpoints/creator-cards/{create,get,delete}.js` |
| Business logic + validation | `services/creator-card/{create,get,delete}-creator-card.js` |
| Shared service helpers | `services/creator-card/helpers.js` |
| Messages + custom error codes | `messages/creator-card.js` (registered in `messages/index.js`) |
| Mongoose model | `models/creator-card.js` (registered in `models/index.js`) |
| Repository | `repository/creator-card/index.js` |
| Endpoint registration | `app.js` (`ENDPOINT_CONFIGS`) |

Conventions honoured:

- Services take `(serviceData, options = {})`, validate **first** with the VSL
  validator, and use a **single exit point**.
- Field-level validation (types, required, lengths, enums) uses the template's
  VSL validator and returns **HTTP 400**.
- Business-rule errors are thrown with `throwAppError` and the template's error
  utilities.
- All imports use the `@app-core/*` / `@app/*` path aliases.
- No `console.log`; the `@app-core/logger` is used throughout.
- Slug/format checks use plain string methods (no regex), per the template guide.
- The model holds only DB concerns (types, indexes, defaults); all validation is
  in the service layer.

---

## Validation split (VSL vs. business rules)

The VSL spec in `create-creator-card.js` handles everything the validator can
express: required fields, types, `lengthBetween`/`maxLength`/`length`, the
currency/status/access_type enums, and the non-empty `rates` array. Anything VSL
cannot express is enforced in the service and still returns **HTTP 400**:

- slug character set (letters, numbers, `-`, `_`)
- link `url` must start with `http://` or `https://`
- `access_code` must be alphanumeric
- rate `amount` must be a positive **integer** (minor units)

The dedicated **business-rule** errors carry the codes from the brief:

| Rule | Code | HTTP |
|---|---|---|
| Slug already taken | `SL02` | 400 |
| `access_code` required for private card | `AC01` | 400 |
| `access_code` set on a public card | `AC05` | 400 |
| Card not found / deleted | `NF01` | 404 |
| Card exists but is a draft | `NF02` | 404 |
| Private card, no access code supplied | `AC03` | 403 |
| Private card, wrong access code | `AC04` | 403 |

Retrieval applies `NF01 → NF02 → AC03 → AC04` strictly in that order.

---

## Key behaviours

- **`_id` vs `id`** — documents are stored with a ULID `_id`; the serializer in
  `services/creator-card/helpers.js` always exposes it as `id` and never leaks
  `_id`.
- **`access_code`** — returned on create/delete responses (the creator needs
  it), but **omitted entirely** from the public retrieval response, even for a
  correctly-authenticated private card.
- **Slug auto-generation** — when `slug` is omitted: lowercase the title,
  whitespace → hyphens, drop disallowed characters; if the result is shorter
  than 5 chars or already taken, append `-` + a random 6-char alphanumeric
  suffix (via the template's `randomBytes`). A client-provided slug that is
  already taken returns `SL02` and is never silently modified.
- **Soft delete** — delete sets `deleted` to a Unix-ms timestamp (leaving
  `updated` untouched, matching the brief's example) and returns the deleted
  card in the creation response shape. Deleted cards return `NF01` from the
  public endpoint.
- **Robustness** — malformed JSON bodies return 400 (handled by the framework),
  unknown routes return 404, and the service never crashes on bad input.

### Design decisions (deliberate)

- **DELETE `creator_reference`** — the brief requires it as a 20-char field but
  lists only `NF01` as a delete error and never specifies an ownership check, so
  the field is validated for shape only and **not** matched against the stored
  card (following the spec to the letter).
- **Slug uniqueness** is enforced at the service layer (a pre-insert lookup) so
  duplicates return `SL02` (400) rather than a database duplicate-key error.

---

## Changes made to the template core (2, minimal & additive)

The brief mandates an error body of `{ status, message, code }`, but the
template's success path hard-codes `status: 'success'` and its error path did
not emit a top-level `code`. The README documents `code` as part of the error
format, so two small additive edits bring the implementation in line with the
documented contract:

1. `core/express/server.js` — in the error handler, emit
   `responseComponents.body.code = error.errorCode` for application errors.
2. `core/errors/constants.js` — add the custom codes to
   `ERROR_STATUS_CODE_MAPPING` so `NF01/NF02 → 404`, `AC03/AC04 → 403`, and
   `SL02/AC01/AC05 → 400`.

No structural conventions were changed and no existing behaviour was removed.

---

## Environment variables

Copy `.env.example` to `.env` and set at least:

```
PORT=8811
MONGODB_URI=<your MongoDB Atlas connection string>
```

`REDIS_URL` is optional — when unset, the template's queue/worker become no-ops,
so no Redis is required to run this service.

---

## Run locally

```bash
npm install
# create .env with MONGODB_URI (and optionally PORT)
npm start          # node bootstrap.js -> app.js
```

Quick smoke test:

```bash
curl -X POST http://localhost:8811/creator-cards \
  -H "Content-Type: application/json" \
  -d '{"title":"George Cooks","slug":"george-cooks","creator_reference":"crt_8f2k1m9x4p7w3q5z","status":"published"}'

curl http://localhost:8811/creator-cards/george-cooks
```

## Tests

An offline, end-to-end integration test boots the real Express app against an
in-memory repository (no MongoDB needed) and exercises all 16 brief scenarios
plus edge cases:

```bash
npm run test:e2e
```

## Deploy

- **Render** — `render.yaml` is included (build `npm install`, start
  `node bootstrap.js`). Set `MONGODB_URI` in the dashboard; Render injects
  `PORT` automatically.
- **Heroku** — the template's `Procfile` (`web: node bootstrap.js`) is used; set
  `MONGODB_URI` config var.

Submit the **base URL only** (e.g. `https://creator-card-api.onrender.com`) —
the graders call `POST /creator-cards`, `GET /creator-cards/:slug`, and
`DELETE /creator-cards/:slug` against it.
