(async function () {
  initPage("dashboard", "Dashboard", "Vehicle inventory overview");

  const banner = document.getElementById("config-banner");
  banner.innerHTML = `${ICONS.alert}<span>Checking publishing status…</span>`;

  // Ask the server (never the browser) whether Cloudinary/GitHub are wired
  // up. The endpoint only ever returns booleans — never the credentials.
  try {
    const status = await apiRequest(CONFIG.API.STATUS);
    const parts = [];
    parts.push(status.cloudinaryConfigured
      ? "Cloudinary image uploads are configured."
      : "<strong style='color:var(--white);'>Cloudinary is not configured</strong> — image uploads will fail until CLOUDINARY_* env vars are set in Vercel.");
    parts.push(status.githubConfigured
      ? `GitHub publishing is configured (${escapeHtml(status.githubRepo || CONFIG.GITHUB_REPO_DISPLAY)} @ ${escapeHtml(status.githubBranch || CONFIG.GITHUB_BRANCH_DISPLAY)}).`
      : "<strong style='color:var(--white);'>GitHub publishing is not configured</strong> — set GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH in Vercel.");
    banner.innerHTML = `${ICONS.alert}<span>${parts.join(" ")}</span>`;
  } catch (err) {
    banner.innerHTML = `${ICONS.alert}<span><strong style="color:var(--white);">Could not reach /api/status.</strong> This is expected when running the static file server locally — status checks and publishing only run once deployed on Vercel with the API functions live.</span>`;
  }

  const vehicles = await Store.getVehicles();

  const stats = [
    { label: "Total Vehicles", value: vehicles.length },
    { label: "Available", value: vehicles.filter(v => v.status === "available").length },
    { label: "Reserved", value: vehicles.filter(v => v.status === "reserved").length },
    { label: "Sold", value: vehicles.filter(v => v.status === "sold").length },
    { label: "Featured", value: vehicles.filter(v => v.featured).length }
  ];

  document.getElementById("stat-cards").innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-accent"></div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
    </div>
  `).join("");

  const recentVehicles = [...vehicles].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, 6);
  document.getElementById("recent-vehicles").innerHTML = recentVehicles.length ? recentVehicles.map(v => `
    <div class="recent-item">
      <img class="thumb" src="${mainImageOf(v) || ""}" alt="" onerror="this.style.visibility='hidden'">
      <div class="info">
        <div class="title">${escapeHtml(v.make)} ${escapeHtml(v.model)} ${escapeHtml(v.variant || "")}</div>
        <div class="sub">${formatCurrency(v.price)} · ${escapeHtml(v.status)}</div>
      </div>
      <a class="btn btn-ghost btn-sm" href="vehicle-edit.html?id=${encodeURIComponent(v.id)}">Edit</a>
    </div>
  `).join("") : `<p class="text-grey text-sm">No vehicles in this browser's local working copy. Open Vehicles and use Pull Latest to load the published inventory, or add a vehicle.</p>`;

  function mainImageOf(v) {
    if (!v.images || !v.images.length) return "";
    const first = v.images[0];
    return typeof first === "string" ? first : first.url;
  }

  const activity = Store.getActivity();
  document.getElementById("activity-list").innerHTML = activity.length ? activity.slice(0, 12).map(a => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div class="activity-body">
        <div class="msg">${escapeHtml(a.message)}</div>
        <div class="when">${timeAgo(a.at)}</div>
      </div>
    </div>
  `).join("") : `<p class="text-grey text-sm">No activity recorded yet.</p>`;
})();
