# Manchester Auto Cars — Vehicle Management CMS (Website 2)

The private inventory console for **Manchester Auto Cars**
([manchesterautocars.com](https://manchesterautocars.com/)), Manchester,
United Kingdom. It does **only** vehicle inventory management: adding,
editing, removing, photographing and publishing vehicles. It does not edit
the public website's design, pages or services — those live in the public
website's own codebase.

## Website 1 vs Website 2

| | Website 1 — public site | Website 2 — this CMS |
|---|---|---|
| URL | https://manchesterautocars.com/ | Its own private Vercel project |
| Audience | Customers | Dealership admins |
| Purpose | Used cars, vehicle pages, Sell / Swap, Services, About, Contact, WhatsApp enquiries | Managing vehicle inventory |
| Data | Reads `data/vehicles.json` from GitHub | Writes `data/vehicles.json` to GitHub |
| Repository | `manchesterauto/manchester-auto-cars` | (this project, deployed separately) |

```
CMS (browser)
   ↓
Vercel API (/api/*)   ← secrets live here only
   ↓
GitHub API
   ↓
manchesterauto/manchester-auto-cars  (branch: main, file: data/vehicles.json)
   ↓
Manchester Auto Cars public website
```

There is no database. GitHub is the source of truth for inventory and
Cloudinary hosts the photos.

## 1. What the CMS does

- Add / edit / delete vehicles
- Status: Available / Reserved / Sold; Featured on/off
- Upload multiple photos to Cloudinary, preview, delete, drag to reorder,
  and choose the main photo (the first photo is the main/cover image)
- **Publish** the inventory to GitHub; **Pull Latest** reads it back
- Dashboard with totals (Total / Available / Reserved / Sold / Featured),
  recent vehicles, quick actions, Cloudinary/GitHub status and an activity log

Prices are in £ GBP and mileage is in miles.

## 2. Local development

```bash
npm install      # no dependencies, but harmless
npm run dev      # http://localhost:3001
```

`server.js` serves the static files and dispatches `/api/*` to the same
handler files Vercel runs. Without environment variables the API reports
"not configured" rather than pretending to work. To exercise real
publishing locally, export the variables from section 6 in your shell
first (never commit them).

There is no build step — the project is static files plus serverless
functions.

### Browser tests (optional)

`tests/` holds a headless-browser suite (67 checks) that runs the real server
and API handlers with **fake** credentials and a faked GitHub/Cloudinary:

```bash
pip install playwright pillow && playwright install chromium
python3 tests/ui_test.py        # results + screenshots go to /tmp/mac-cms-tests
```

It proves our code paths, not GitHub's or Cloudinary's real behaviour — do one
real Pull / upload / Publish on a Vercel preview as well. `tests/` is excluded
from Vercel deployments via `.vercelignore`.

## 3. Folder structure

```
manchester-auto-cars-cms/
├── index.html            Entry screen
├── dashboard.html        Stats, recent vehicles, quick actions, activity
├── vehicles.html         Vehicle list, search/filter, Pull Latest, Publish
├── vehicle-edit.html     Add/edit vehicle, Cloudinary photo manager
├── settings.html         Business info, Cloudinary/GitHub status
├── assets/
│   ├── css/              style.css, components.css
│   ├── js/               config.js, app.js, dashboard.js, vehicles.js,
│   │                     vehicle-edit.js, settings.js
│   └── images/           Manchester Auto Cars logo + favicons
├── data/vehicles.json    Empty seed ([]) for a fresh browser
├── api/                  status, cloudinary-sign, delete-vehicle-image,
│                         get-vehicles, publish-vehicles (+ _util.js helper)
├── server.js             Local dev server
├── package.json
└── vercel.json
```

## 4. Vehicle data

Working-copy record (images are objects so each photo's Cloudinary
`publicId` is known for deletion):

```json
{
  "id": "mac-bmw-320d-001",
  "make": "BMW", "model": "3 Series", "variant": "320d M Sport",
  "year": 2021, "registration": "", "mileage": 48000,
  "fuel": "Diesel", "transmission": "Automatic", "engine": "2.0L",
  "bodyType": "Saloon", "colour": "Black",
  "price": 18990, "previousPrice": null,
  "status": "available", "featured": true,
  "description": "", "highlights": [], "location": "Manchester",
  "images": [
    { "url": "https://res.cloudinary.com/.../abc123.jpg",
      "publicId": "manchester-auto-cars/vehicles/mac-bmw-320d-001/abc123" }
  ],
  "seoTitle": "", "seoDescription": "", "dateAdded": "2026-09-30"
}
```

Publishing flattens `images` to an array of URLs and adds
`mainImage` (the first image), wrapped as
`{ "schemaVersion": 1, "vehicles": [...] }` — see `api/publish-vehicles.js`.

**Vehicle IDs** are created once when you start adding a vehicle
(`mac-<timestamp>-<random>`: lowercase letters, digits and hyphens) and
never change when it is edited. The ID is fixed before you type the make
and model because photo uploads are filed under it in Cloudinary. IDs
already published by another system (e.g. `mac-bmw-320d-001`) are kept
exactly as they are when pulled from GitHub.

## 5. Cloudinary

Photos never go into `localStorage`, `vehicles.json` or GitHub as image
data:

1. The browser asks `/api/cloudinary-sign` for a signed upload scoped to
   `manchester-auto-cars/vehicles/<vehicle-id>/`.
2. The browser uploads straight to Cloudinary with that signature.
3. Cloudinary returns `secure_url` and `public_id`; the CMS stores both.
4. Removing a photo deletes it from the vehicle and from Cloudinary via
   `/api/delete-vehicle-image`, which refuses any `publicId` outside
   `manchester-auto-cars/vehicles/`.

## 6. Environment variables (set in Vercel, never in code)

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT, see below |
| `GITHUB_REPO` | `manchesterauto/manchester-auto-cars` |
| `GITHUB_BRANCH` | `main` (defaults to `main` if unset) |
| `CLOUDINARY_CLOUD_NAME` | From the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard — server-side only |

**GitHub token:** fine-grained personal access token limited to the single
repository `manchesterauto/manchester-auto-cars`, with **Contents: Read and
write**. The token must belong to (or be authorised by) an account with
write access to that repository.

## 7. Vercel deployment

1. Push this project to its own repository (separate from the public site).
2. In Vercel: **Add New → Project**, import that repository. Framework
   preset **Other**; no build command; no output directory.
3. Add the environment variables above (Production, and Preview if wanted).
4. Deploy.
5. **Enable Deployment Protection** (Project Settings → Deployment
   Protection) so only authorised people can open the CMS.
6. Open Dashboard → the banner and Settings should show Cloudinary and
   GitHub as configured, pointing at
   `manchesterauto/manchester-auto-cars @ main`.
7. Go to **Vehicles → Pull Latest** before doing anything else.

## 8. Publishing workflow

1. **Pull Latest** (Vehicles page) to load the currently published
   inventory from GitHub into this browser.
2. Add / edit / delete vehicles and photos. These changes are a local
   working copy until you publish.
3. **Save & Publish** (editor) or **Publish All Vehicles** (Vehicles page)
   commits the whole list to `data/vehicles.json` on `main`. The public
   site redeploys from that commit.

Publishing replaces the whole file. A browser that has not pulled has a
stale or empty list, so always Pull Latest first; publishing an empty list
asks for explicit confirmation.

## 9. Security

- No in-app password screen (a client-side check cannot keep anyone out).
  Access is controlled by **Vercel Deployment Protection**.
- `GITHUB_TOKEN` and `CLOUDINARY_API_SECRET` exist only as Vercel
  environment variables, read in `/api/*`; they are never in HTML, CSS,
  frontend JavaScript, `localStorage`, GitHub or any API response.
  `/api/status` returns booleans and the repo/branch names only.
- Cloudinary's API key is returned with upload signatures; that is normal —
  only the secret is confidential.
- Vehicle IDs are validated server-side before publishing.
- `localStorage` keys are `mac_cms_vehicles` and `mac_cms_activity` (working
  copy and activity log only; GitHub remains the source of truth).
- The pages carry `noindex, nofollow`.
