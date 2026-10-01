/**
 * api/_util.js
 * Shared helpers for the Vercel serverless functions in this folder.
 * Filename starts with "_" so Vercel does not treat it as a route.
 *
 * Written against plain Node request/response objects (not the
 * req.body/res.json() conveniences Vercel's Node runtime layers on top)
 * so these functions also run under a bare `http.createServer` locally —
 * see server.js — which lets us actually test the request/response
 * handling and error paths without needing live Cloudinary/GitHub
 * credentials.
 */

const crypto = require("crypto");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel's Node runtime may already have parsed the body onto req.body.
    if (req.body !== undefined) {
      if (typeof req.body === "string") {
        try { return resolve(req.body ? JSON.parse(req.body) : {}); }
        catch (e) { return reject(new Error("Invalid JSON body")); }
      }
      return resolve(req.body || {});
    }
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 15 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  if (typeof res.status === "function" && typeof res.json === "function") {
    // Vercel convenience API, if present.
    res.status(status).setHeader("Content-Type", "application/json");
    res.json(obj);
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function methodNotAllowed(res, allowed) {
  sendJson(res, 405, { error: `Method not allowed. Use ${allowed}.` });
}

/** Returns { ok: true, values } or { ok: false, missing } — never throws, never logs values. */
function checkEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) return { ok: false, missing };
  const values = {};
  names.forEach((n) => { values[n] = process.env[n]; });
  return { ok: true, values };
}

function isUrlSafeId(id) {
  return typeof id === "string" && /^[a-z0-9-]+$/.test(id) && id.length > 0 && id.length <= 80;
}

/** Cloudinary signs params by sorting keys, joining as key=value&key=value, then appending the secret and taking SHA-1. */
function cloudinarySignature(params, apiSecret) {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(sorted + apiSecret).digest("hex");
}

module.exports = { readJsonBody, sendJson, methodNotAllowed, checkEnv, isUrlSafeId, cloudinarySignature };
