/**
 * GET /api/status
 * Reports whether Cloudinary and GitHub publishing are configured, WITHOUT
 * ever returning the actual credential values. Used by the dashboard/
 * settings banners so staff see accurate status instead of a guess.
 */
const { sendJson, methodNotAllowed } = require("./_util");

module.exports = async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");

  const cloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  const githubConfigured = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);

  sendJson(res, 200, {
    cloudinaryConfigured,
    githubConfigured,
    githubRepo: process.env.GITHUB_REPO || null,
    githubBranch: process.env.GITHUB_BRANCH || "main"
  });
};
