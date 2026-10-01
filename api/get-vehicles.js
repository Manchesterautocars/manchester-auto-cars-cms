/**
 * GET /api/get-vehicles
 *
 * Reads the CURRENTLY PUBLISHED data/vehicles.json from the Website 1
 * GitHub repo, server-side, using GITHUB_TOKEN. This lets the CMS treat
 * GitHub as the real source of truth instead of trusting whatever is
 * cached in the browser's localStorage.
 */
const { sendJson, methodNotAllowed, checkEnv } = require("./_util");

const PUBLISH_PATH = "data/vehicles.json";
const GITHUB_API = "https://api.github.com";

module.exports = async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");

  const env = checkEnv(["GITHUB_TOKEN", "GITHUB_REPO"]);
  if (!env.ok) {
    return sendJson(res, 500, {
      error: `GitHub publishing is not configured. Missing environment variable(s): ${env.missing.join(", ")}.`
    });
  }
  const { GITHUB_TOKEN, GITHUB_REPO } = env.values;
  const branch = process.env.GITHUB_BRANCH || "main";

  try {
    const url = `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${PUBLISH_PATH}?ref=${encodeURIComponent(branch)}`;
    const ghRes = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "manchester-auto-cars-cms"
      }
    });

    if (ghRes.status === 404) {
      // File doesn't exist yet — that's fine, treat it as an empty inventory.
      return sendJson(res, 200, { vehicles: [], schemaVersion: 1, sha: null, existed: false });
    }
    if (!ghRes.ok) {
      const errBody = await ghRes.json().catch(() => ({}));
      return sendJson(res, 502, { error: errBody.message || `GitHub returned ${ghRes.status}.` });
    }

    const file = await ghRes.json();
    const decoded = Buffer.from(file.content, file.encoding || "base64").toString("utf8");
    let parsed;
    try { parsed = JSON.parse(decoded); }
    catch (e) { return sendJson(res, 502, { error: "data/vehicles.json in the repo is not valid JSON." }); }

    const vehicles = Array.isArray(parsed) ? parsed : (parsed.vehicles || []);
    sendJson(res, 200, { vehicles, schemaVersion: parsed.schemaVersion || 1, sha: file.sha, existed: true });
  } catch (err) {
    sendJson(res, 502, { error: `Could not reach GitHub: ${err.message}` });
  }
};
