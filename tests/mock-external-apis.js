// TEST-ONLY preload (never used in production): replaces outbound fetch to GitHub/Cloudinary with an
// in-memory fake, so the real API handlers can be exercised without credentials or touching real services.
// Output directory comes from TEST_OUT.
const fs = require("fs");
const OUT = process.env.TEST_OUT || "/tmp/mac-cms-tests";
fs.mkdirSync(OUT, { recursive: true });
const LOG = OUT + "/requests.jsonl";
fs.writeFileSync(LOG, "");
const realFetch = global.fetch;
// Pre-existing "published" inventory in the fake repo (uses mac- IDs, URL-string images like real published data)
let file = {
  schemaVersion: 1,
  vehicles: [
    { id: "mac-bmw-320d-001", make: "BMW", model: "3 Series", variant: "320d M Sport", year: 2021, registration: "", mileage: 48000, fuel: "Diesel", transmission: "Automatic", engine: "2.0L", bodyType: "Saloon", colour: "Black", price: 18990, previousPrice: null, status: "available", featured: true, description: "Pulled from repo", highlights: ["Full service history"], location: "Manchester",
      images: ["https://res.cloudinary.com/testcloud/image/upload/v1700000000/manchester-auto-cars/vehicles/mac-bmw-320d-001/pic1.jpg"],
      mainImage: "https://res.cloudinary.com/testcloud/image/upload/v1700000000/manchester-auto-cars/vehicles/mac-bmw-320d-001/pic1.jpg", seoTitle: "", seoDescription: "", dateAdded: "2026-06-01" },
    { id: "mac-audi-a4-002", make: "Audi", model: "A4", variant: "2.0 TDI S Line", year: 2019, registration: "", mileage: 51230, fuel: "Diesel", transmission: "Automatic", engine: "2.0L TDI", bodyType: "Saloon", colour: "Grey", price: 15990, previousPrice: null, status: "reserved", featured: false, description: "", highlights: [], location: "Manchester", images: [], mainImage: "", seoTitle: "", seoDescription: "", dateAdded: "2026-05-02" }
  ]
};
let sha = "sha-0";
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.github.com/") || u.startsWith("https://api.cloudinary.com/")) {
    const rec = { url: u, method: opts.method || "GET", headers: opts.headers || {}, body: opts.body ? String(opts.body).slice(0, 200000) : null };
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n");
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
    if (u.startsWith("https://api.github.com/")) {
      if (!u.includes("/repos/manchesterauto/manchester-auto-cars/contents/data/vehicles.json")) return json(404, { message: "Not Found (wrong repo/path in test)" });
      if ((opts.method || "GET") === "GET") return json(200, { sha, encoding: "base64", content: Buffer.from(JSON.stringify(file)).toString("base64") });
      if (opts.method === "PUT") {
        const b = JSON.parse(opts.body);
        if (b.sha !== sha) return json(409, { message: "sha mismatch" });
        file = JSON.parse(Buffer.from(b.content, "base64").toString("utf8")); sha = "sha-" + (Number(sha.split("-")[1]) + 1);
        fs.writeFileSync(OUT + "/published.json", JSON.stringify(file, null, 2));
        return json(200, { commit: { sha: "commit-" + sha, html_url: "https://github.com/manchesterauto/manchester-auto-cars/commit/" + sha } });
      }
    }
    if (u.includes("/image/destroy")) return json(200, { result: "ok" });
    return json(404, { error: { message: "unexpected" } });
  }
  return realFetch(url, opts);
};
