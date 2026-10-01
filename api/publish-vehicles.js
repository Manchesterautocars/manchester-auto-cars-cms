/**
 * POST /api/publish-vehicles
 * Body: { vehicles: [ ...CMS vehicle records... ] }
 *
 * Transforms the CMS's internal vehicle records into the schema Website 1
 * expects and commits them to data/vehicles.json in the Website 1 GitHub
 * repo, server-side, using GITHUB_TOKEN. The token never leaves this
 * function and is never echoed back in the response.
 *
 * This single file-replace is the entire "publish" operation: deleting a
 * vehicle in the CMS and publishing removes it from this file, which is
 * exactly what makes it disappear from the public site once Vercel
 * redeploys Website 1 from the updated repo.
 */
const { sendJson, methodNotAllowed, readJsonBody, checkEnv, isUrlSafeId } = require("./_util");

const PUBLISH_PATH = "data/vehicles.json";
const GITHUB_API = "https://api.github.com";

function imageUrl(img) {
  if (!img) return null;
  return typeof img === "string" ? img : img.url || null;
}

function toPublicVehicle(v) {
  const images = Array.isArray(v.images) ? v.images.map(imageUrl).filter(Boolean) : [];
  return {
    id: v.id,
    make: v.make || "",
    model: v.model || "",
    variant: v.variant || "",
    year: Number(v.year) || null,
    registration: v.registration || "",
    mileage: Number(v.mileage) || 0,
    fuel: v.fuel || "",
    transmission: v.transmission || "",
    engine: v.engine || "",
    bodyType: v.bodyType || "",
    colour: v.colour || "",
    price: Number(v.price) || 0,
    previousPrice: v.previousPrice ? Number(v.previousPrice) : null,
    status: v.status || "available",
    featured: !!v.featured,
    description: v.description || "",
    highlights: Array.isArray(v.highlights) ? v.highlights : [],
    location: v.location || "",
    images,
    mainImage: images[0] || "",
    seoTitle: v.seoTitle || "",
    seoDescription: v.seoDescription || "",
    dateAdded: v.dateAdded || new Date().toISOString().slice(0, 10)
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const env = checkEnv(["GITHUB_TOKEN", "GITHUB_REPO"]);
  if (!env.ok) {
    return sendJson(res, 500, {
      error: `GitHub publishing is not configured. Missing environment variable(s): ${env.missing.join(", ")}. Add them in Vercel → Project Settings → Environment Variables.`
    });
  }
  const { GITHUB_TOKEN, GITHUB_REPO } = env.values;
  const branch = process.env.GITHUB_BRANCH || "main";

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  if (!Array.isArray(body.vehicles)) {
    return sendJson(res, 400, { error: "Request body must include a 'vehicles' array." });
  }

  // Validate every ID before publishing anything — a bad ID would break
  // Website 1's /cars/<id> routing.
  const badIds = body.vehicles.map((v) => v.id).filter((id) => !isUrlSafeId(id));
  if (badIds.length) {
    return sendJson(res, 400, { error: `These vehicle IDs are not URL-safe and would break /cars/<id> routing: ${badIds.join(", ")}` });
  }
  const ids = body.vehicles.map((v) => v.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) {
    return sendJson(res, 400, { error: `Duplicate vehicle IDs found: ${[...new Set(duplicates)].join(", ")}` });
  }

  const payload = {
    schemaVersion: 1,
    vehicles: body.vehicles.map(toPublicVehicle)
  };
  const contentBase64 = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");

  const ghHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "manchester-auto-cars-cms",
    "Content-Type": "application/json"
  };
  const contentsUrl = `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${PUBLISH_PATH}`;

  try {
    // 1. Look up the current file's sha (required by GitHub to update an
    //    existing file; omitted entirely if the file doesn't exist yet).
    let sha = null;
    const getRes = await fetch(`${contentsUrl}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    if (getRes.status === 200) {
      const current = await getRes.json();
      sha = current.sha;
    } else if (getRes.status !== 404) {
      const errBody = await getRes.json().catch(() => ({}));
      return sendJson(res, 502, { error: errBody.message || `GitHub returned ${getRes.status} while checking the existing file.` });
    }

    // 2. Commit the new content.
    const putRes = await fetch(contentsUrl, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message: `Publish vehicle inventory (${payload.vehicles.length} vehicles)`,
        content: contentBase64,
        branch,
        ...(sha ? { sha } : {})
      })
    });

    const putBody = await putRes.json().catch(() => ({}));
    if (!putRes.ok) {
      return sendJson(res, 502, { error: putBody.message || `GitHub rejected the publish (status ${putRes.status}).` });
    }

    sendJson(res, 200, {
      ok: true,
      vehicleCount: payload.vehicles.length,
      commitSha: putBody.commit?.sha || null,
      commitUrl: putBody.commit?.html_url || null
    });
  } catch (err) {
    sendJson(res, 502, { error: `Could not reach GitHub: ${err.message}` });
  }
};
