# /api — Server-Side API

These are Vercel serverless functions (plain Node request handlers — they
also run under the local dev server in `server.js`). They are the only
place Cloudinary and GitHub credentials are ever read. Nothing in the
browser-facing code (`assets/js/*`, any `*.html`) has access to them.

## Endpoints

### `GET /api/status`
Returns booleans only — never the credential values:
```json
{ "cloudinaryConfigured": true, "githubConfigured": true, "githubRepo": "manchesterauto/manchester-auto-cars", "githubBranch": "main" }
```
Used by the Dashboard and Settings pages so staff see accurate status
instead of a guess.

### `POST /api/cloudinary-sign`
Body: `{ "vehicleId": "mac-bmw-320d-001" }`

Returns a signature the browser uses to upload **one** image directly to
Cloudinary (the CMS never proxies the image bytes through this function —
only the small JSON signature request goes through the server):
```json
{
  "cloudName": "...", "apiKey": "...", "timestamp": 1234567890,
  "folder": "manchester-auto-cars/vehicles/mac-bmw-320d-001",
  "allowedFormats": "jpg,jpeg,png,webp",
  "signature": "...",
  "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload"
}
```
`apiKey` is Cloudinary's public key, not a secret — only
`CLOUDINARY_API_SECRET` is confidential, and it never leaves this
function. `vehicleId` is validated as URL-safe before it's used to build
the folder path, so it can't be used to write outside
`manchester-auto-cars/vehicles/`.

The browser then `POST`s the file directly to `uploadUrl` as
`multipart/form-data` with `file`, `api_key`, `timestamp`, `folder`,
`allowed_formats` and `signature`. Cloudinary itself enforces the
signature, so none of those fields can be tampered with client-side
without invalidating the upload.

### `POST /api/delete-vehicle-image`
Body: `{ "publicId": "manchester-auto-cars/vehicles/mac-bmw-320d-001/abc123" }`

Deletes one Cloudinary asset server-side. Rejects any `publicId` that
doesn't start with `manchester-auto-cars/vehicles/`, so this endpoint
can't be used to delete unrelated Cloudinary assets in the same account.

### `GET /api/get-vehicles`
Reads the **currently published** `data/vehicles.json` from the public-website
GitHub repo (using `GITHUB_TOKEN` server-side) and returns it. This is
what "Pull Latest" on the Vehicles page uses, so the CMS can treat GitHub
— not the browser's local storage — as the source of truth.

### `POST /api/publish-vehicles`
Body: `{ "vehicles": [ ...CMS vehicle records... ] }`

1. Validates every vehicle ID is URL-safe (so it can't break Website 1's
   `/cars/<id>` routing) and that there are no duplicate IDs.
2. Transforms the CMS's internal vehicle shape into the public schema
   (flattens `images` to an array of URLs, adds `mainImage`, wraps
   everything in `{ schemaVersion: 1, vehicles: [...] }`).
3. Looks up the current file's SHA on GitHub (needed to update an
   existing file) and commits the new content to `data/vehicles.json` on
   the configured branch via the GitHub Contents API.

Deleting a vehicle in the CMS and then publishing simply omits it from
this array, which removes it from the file — and therefore from the
public site once Vercel redeploys Website 1.

## Environment variables (set in Vercel, never in code)

| Variable | Purpose |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key (not secret, but still set as an env var for consistency) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret — **used only inside `/api`, never sent to the browser** |
| `GITHUB_TOKEN` | Fine-grained PAT with contents:write on `manchesterauto/manchester-auto-cars` |
| `GITHUB_REPO` | `manchesterauto/manchester-auto-cars` |
| `GITHUB_BRANCH` | `main` (defaults to `main` if unset) |

Set these in **Vercel → your project → Settings → Environment Variables**.
Until they're set, `/api/status` reports them as not configured, and the
upload/publish endpoints return a clear error instead of pretending to
succeed.

## Authentication

This CMS relies on **Vercel's deployment protection** on the project
itself, not a login page inside the app — a client-side password check
can be bypassed by editing the page's JavaScript, so it isn't implemented
here. Make sure deployment protection is turned on for
this project in Vercel's project settings.

## Local development note

`server.js` dispatches `/api/*` requests to these same files, so you can
smoke-test request parsing, validation and error paths locally (including
without any environment variables set, to confirm the "not configured"
messages work). It does **not** fully emulate Vercel's Node runtime
(e.g. automatic `req.body` parsing), and it obviously can't have your real
Cloudinary/GitHub credentials — treat it as a fast local check, not a
substitute for testing on a Vercel preview deployment.
