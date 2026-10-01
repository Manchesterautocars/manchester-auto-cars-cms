/**
 * POST /api/delete-vehicle-image
 * Body: { publicId: string }
 *
 * Deletes a single Cloudinary asset server-side using the API secret.
 * Only ever operates on assets under manchester-auto-cars/vehicles/ to
 * stop this endpoint being used to delete unrelated Cloudinary assets.
 */
const { sendJson, methodNotAllowed, readJsonBody, checkEnv, cloudinarySignature } = require("./_util");

module.exports = async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const env = checkEnv(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);
  if (!env.ok) {
    return sendJson(res, 500, {
      error: `Cloudinary is not configured. Missing environment variable(s): ${env.missing.join(", ")}.`
    });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  const publicId = body.publicId;
  if (typeof publicId !== "string" || !publicId.startsWith("manchester-auto-cars/vehicles/")) {
    return sendJson(res, 400, { error: "publicId must be a Cloudinary asset under manchester-auto-cars/vehicles/." });
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env.values;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinarySignature({ public_id: publicId, timestamp }, CLOUDINARY_API_SECRET);

  try {
    const form = new URLSearchParams();
    form.set("public_id", publicId);
    form.set("api_key", CLOUDINARY_API_KEY);
    form.set("timestamp", String(timestamp));
    form.set("signature", signature);

    const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const data = await cloudRes.json();
    if (!cloudRes.ok) {
      return sendJson(res, 502, { error: data.error?.message || "Cloudinary rejected the delete request." });
    }
    sendJson(res, 200, { ok: true, result: data.result });
  } catch (err) {
    sendJson(res, 502, { error: `Could not reach Cloudinary: ${err.message}` });
  }
};
