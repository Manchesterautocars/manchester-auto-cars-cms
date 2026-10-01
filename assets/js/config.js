/**
 * config.js
 * Central configuration for the Manchester Auto Cars Vehicle CMS.
 * No secrets live here or anywhere else in frontend code — Cloudinary and
 * GitHub credentials stay server-side in /api/*.js, read from Vercel
 * environment variables.
 */
const CONFIG = Object.freeze({
  BUSINESS_NAME: "Manchester Auto Cars",
  PUBLIC_WEBSITE_URL: "https://manchesterautocars.com/",
  BUSINESS_LOCATION: "Manchester, United Kingdom",
  PHONE_DISPLAY: "+44 7769 006333",
  WHATSAPP_DISPLAY: "+44 7769 006333",
  WHATSAPP_NUMBER: "447769006333",

  LOGO_PATH: "assets/images/manchester-autocars-logo.png",

  // Server-side API routes (Vercel serverless functions). None of these
  // paths carry credentials — the functions behind them read Cloudinary
  // and GitHub secrets from process.env.
  API: {
    STATUS: "/api/status",
    CLOUDINARY_SIGN: "/api/cloudinary-sign",
    DELETE_IMAGE: "/api/delete-vehicle-image",
    GET_VEHICLES: "/api/get-vehicles",
    PUBLISH_VEHICLES: "/api/publish-vehicles"
  },

  // Informational only (not secret) — shown in the UI so staff know where
  // "Publish" actually sends data.
  GITHUB_REPO_DISPLAY: "manchesterauto/manchester-auto-cars",
  GITHUB_BRANCH_DISPLAY: "main",
  GITHUB_PUBLISH_PATH: "data/vehicles.json",

  // localStorage is used ONLY as a working-copy/draft cache for the CMS
  // UI between page loads. It is never the source of truth — "Pull Latest"
  // reads the real file from GitHub, and "Publish" writes back to GitHub.
  STORAGE_KEYS: {
    VEHICLES: "mac_cms_vehicles",
    ACTIVITY: "mac_cms_activity"
  },
  SEED_PATHS: {
    VEHICLES: "/data/vehicles.json"
  },

  VEHICLE_STATUSES: ["available", "reserved", "sold"],
  IMAGE_ACCEPT: "image/jpeg,image/png,image/webp",
  MAX_IMAGE_SIZE_MB: 8,
  MAX_IMAGES_PER_VEHICLE: 20
});
