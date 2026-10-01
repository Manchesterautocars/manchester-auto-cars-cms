/**
 * server.js
 * Local development server. Serves the CMS's static files AND dispatches
 * /api/* requests to the same handler files Vercel will run in
 * production (api/status.js, api/cloudinary-sign.js, etc.), so the API
 * layer can actually be exercised locally — including its "not
 * configured" error paths when Cloudinary/GitHub env vars aren't set.
 *
 * This does not replace testing on Vercel itself: Vercel's Node runtime
 * adds a few conveniences (e.g. automatic req.body parsing) that this
 * shim does not fully emulate, and only Vercel has your real environment
 * variables. Treat this as a fast local smoke test, not a substitute for
 * a Vercel preview deployment.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Map /api/<name> to ./api/<name>.js. Files starting with "_" (shared
// helpers) are never routable, matching Vercel's convention.
const API_DIR = path.join(ROOT, "api");
function resolveApiHandler(urlPath) {
  const name = urlPath.replace(/^\/api\//, "").replace(/\/$/, "");
  if (!name || name.startsWith("_") || name.includes("..") || name.includes("/")) return null;
  const filePath = path.join(API_DIR, `${name}.js`);
  if (!filePath.startsWith(API_DIR) || !fs.existsSync(filePath)) return null;
  return filePath;
}

function serveStatic(req, res, urlPath) {
  let p = urlPath;
  if (p === "/") p = "/index.html";
  const filePath = path.normalize(path.join(ROOT, p));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath.startsWith("/api/")) {
    const handlerPath = resolveApiHandler(urlPath);
    if (!handlerPath) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown API route: " + urlPath }));
      return;
    }
    try {
      delete require.cache[require.resolve(handlerPath)];
      const handler = require(handlerPath);
      await handler(req, res);
    } catch (err) {
      console.error(`[api] ${urlPath} threw:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal error: " + err.message }));
      }
    }
    return;
  }

  serveStatic(req, res, urlPath);
});

server.listen(PORT, () => {
  console.log(`Manchester Auto Cars CMS running at http://localhost:${PORT}`);
  console.log(`(local /api/* dispatch is a dev-only shim — see server.js header comment)`);
});
