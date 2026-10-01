(async function () {
  initPage("settings", "Settings", "Business details, publishing status and security notes");

  document.getElementById("s-name").textContent = CONFIG.BUSINESS_NAME;
  document.getElementById("s-location").textContent = CONFIG.BUSINESS_LOCATION;
  const site = document.getElementById("s-website");
  site.textContent = CONFIG.PUBLIC_WEBSITE_URL;
  site.href = CONFIG.PUBLIC_WEBSITE_URL;
  document.getElementById("s-phone").textContent = CONFIG.PHONE_DISPLAY;
  document.getElementById("s-whatsapp").textContent = CONFIG.WHATSAPP_DISPLAY;
  document.getElementById("s-repo").textContent = CONFIG.GITHUB_REPO_DISPLAY;
  document.getElementById("s-branch").textContent = CONFIG.GITHUB_BRANCH_DISPLAY;

  const cloudinaryBanner = document.getElementById("cloudinary-banner");
  const githubBanner = document.getElementById("github-banner");
  cloudinaryBanner.innerHTML = `${ICONS.alert}<span>Checking Cloudinary status…</span>`;
  githubBanner.innerHTML = `${ICONS.alert}<span>Checking GitHub status…</span>`;

  try {
    const status = await apiRequest(CONFIG.API.STATUS);
    cloudinaryBanner.innerHTML = status.cloudinaryConfigured
      ? `${ICONS.alert}<span style="color:var(--green);">Cloudinary is configured — vehicle photo uploads are live.</span>`
      : `${ICONS.alert}<span><strong style="color:var(--white);">Cloudinary is not configured.</strong> Add <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code> and <code>CLOUDINARY_API_SECRET</code> in Vercel → Project Settings → Environment Variables.</span>`;
    githubBanner.innerHTML = status.githubConfigured
      ? `${ICONS.alert}<span style="color:var(--green);">GitHub publishing is configured (${escapeHtml(status.githubRepo)} @ ${escapeHtml(status.githubBranch)}).</span>`
      : `${ICONS.alert}<span><strong style="color:var(--white);">GitHub publishing is not configured.</strong> Add <code>GITHUB_TOKEN</code>, <code>GITHUB_REPO</code> and (optionally) <code>GITHUB_BRANCH</code> in Vercel → Project Settings → Environment Variables.</span>`;
  } catch (err) {
    const msg = `${ICONS.alert}<span><strong style="color:var(--white);">Could not reach /api/status.</strong> Expected when running the static file server locally without the API layer — this check only works once deployed on Vercel (or run via \`vercel dev\`).</span>`;
    cloudinaryBanner.innerHTML = msg;
    githubBanner.style.display = "none";
  }

  document.getElementById("btn-reset").addEventListener("click", () => {
    openConfirmModal({
      title: "Reset local working copy?",
      message: "This clears the vehicle list cached in this browser and reloads the bundled seed data. Anything already published to GitHub is unaffected.",
      confirmText: "Reset",
      danger: true,
      onConfirm: () => {
        Store.resetAll();
        showToast("Working copy reset", "Reloading with seed data…", "success");
        setTimeout(() => window.location.href = "dashboard.html", 800);
      }
    });
  });
})();
