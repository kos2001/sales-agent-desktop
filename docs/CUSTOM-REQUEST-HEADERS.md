# Custom Request Headers

Stamp extra HTTP headers onto every chat-completion and model-discovery request to OpenAI-compatible providers. Useful when an internal corporate gateway sits in front of OpenRouter (or any other OpenAI-compatible API) and requires identity headers like `Service-Id` and `User-Id` for billing or audit.

The headers are configured per **profile**, stored in that profile's `.env` (under `~/.hermes/`), and resolved at request time. They merge on top of the default profile's `.env` — profile values win on conflict, same precedence as `API_SERVER_KEY`.

## Supported keys

| `.env` key | Resulting header | Notes |
| --- | --- | --- |
| `SERVICE_ID` | `Service-Id` | Shortcut for the most common case. |
| `USER_ID` | `User-Id` | Pair with `SERVICE_ID` when the gateway needs both. |
| `OPENAI_HEADER_<NAME>` | `<Name>` | Generic escape hatch. Underscores in the suffix become hyphens; each part is title-cased. Example: `OPENAI_HEADER_X_TENANT_GROUP=acme` → `X-Tenant-Group: acme`. |

Empty values are skipped silently. Names that would collide with headers the app sets explicitly — `Authorization`, `Content-Type`, `X-Hermes-Session-Id` — are dropped at send time; you cannot override them through this mechanism.

## Configuration

### Via the GUI

Open **Settings → Custom Request Headers** and fill in `Service-Id` / `User-Id`. The values are written to the active profile's `.env`. Leave a field blank to disable that header.

For non-standard headers, edit the profile's `.env` directly and add an `OPENAI_HEADER_*` entry; the GUI does not expose those.

### Via `.env`

```ini
# ~/.hermes/.env (default profile)
SERVICE_ID=hermes-internal
USER_ID=oseok.kim@example.com

# Arbitrary header passthrough
OPENAI_HEADER_X_TENANT=acme
OPENAI_HEADER_X_REQUEST_SOURCE=desktop
```

Profile-scoped overrides live alongside the default file (path layout matches the rest of the profile env system).

## Where the headers are attached

Two request paths pick up the headers automatically:

- **Chat completions** — `src/main/hermes.ts`, before the SSE stream is opened. Headers are spread *after* `Content-Type`, `Authorization`, and `X-Hermes-Session-Id` are set, with a deny-list to prevent overriding those three.
- **Model discovery** — `src/main/model-discovery.ts`, on the `GET /v1/models` request used to populate the model picker. The same gateway typically wants the same audit headers here.

The resolution logic itself lives in `src/main/config.ts`:

- `getCustomRequestHeaders(profile)` — cached lookup (5s TTL, matches `readEnv` / `getApiServerKey`).
- `resolveCustomRequestHeaders(profileEnv, defaultEnv)` — pure function, profile-over-default precedence, exported for tests.
- `suffixToHeader(suffix)` — `X_TENANT_GROUP` → `X-Tenant-Group`.

## Verifying without sending a request

`scripts/check-custom-headers.mjs` reproduces the resolution logic against `~/.hermes/.env` and prints the header names plus value *lengths* — no secret values land in the transcript.

```sh
node scripts/check-custom-headers.mjs
```

Sample output:

```
Headers that will be attached to outgoing chat requests:

  Service-Id: <16 chars>
  User-Id: <21 chars>
  X-Tenant: <4 chars>

Total: 3 custom header(s) — Authorization, Content-Type, X-Hermes-Session-Id added separately.
```

If you expected a header to appear and it didn't, common causes are: the value is empty/whitespace-only, the key is in the wrong profile's `.env`, or the name collides with one of the three protected headers.

## Tests

- `tests/custom-request-headers.test.ts` — unit tests for `resolveCustomRequestHeaders` and `suffixToHeader` (precedence, empty-value skip, collision handling, suffix casing).
- `tests/hermes-api.test.ts` — integration mock covering the chat path; mocks `getCustomRequestHeaders` to assert the merge order in `sendMessageViaApi`.

Run them with:

```sh
npx vitest run tests/custom-request-headers.test.ts tests/hermes-api.test.ts
```

## Security notes

- Header **values are not logged** anywhere by the app. The diagnostic script prints lengths only.
- Authorization is **never** overridable through `OPENAI_HEADER_AUTHORIZATION` — the deny-list in `src/main/hermes.ts` drops it before send. To change the bearer token, edit `API_SERVER_KEY` instead.
- Values are read from disk on each cache miss (5s TTL), so rotating a header takes effect within seconds without restarting the app.
