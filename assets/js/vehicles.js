(async function () {
  initPage("vehicles", "Vehicles", "Manage vehicles listed on the Manchester Auto Cars website");

  document.getElementById("publish-target").textContent = `${CONFIG.GITHUB_REPO_DISPLAY} @ ${CONFIG.GITHUB_BRANCH_DISPLAY}`;
  document.getElementById("publish-path-label").textContent = CONFIG.GITHUB_PUBLISH_PATH;

  let vehicles = await Store.getVehicles();

  const els = {
    search: document.getElementById("f-search"),
    status: document.getElementById("f-status"),
    featured: document.getElementById("f-featured"),
    tbody: document.getElementById("vehicles-tbody"),
    empty: document.getElementById("vehicles-empty"),
    count: document.getElementById("result-count"),
    table: document.getElementById("vehicles-table")
  };

  function mainImageOf(v) {
    if (!v.images || !v.images.length) return "";
    const first = v.images[0];
    return typeof first === "string" ? first : first.url;
  }

  function statusBadge(status) {
    return `<span class="badge badge-${status}">${status}</span>`;
  }

  function render() {
    const q = els.search.value.trim().toLowerCase();
    const statusFilter = els.status.value;
    const featuredFilter = els.featured.value;

    const filtered = vehicles.filter(v => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (featuredFilter === "yes" && !v.featured) return false;
      if (featuredFilter === "no" && v.featured) return false;
      if (q) {
        const hay = `${v.make} ${v.model} ${v.variant}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    els.count.textContent = `${filtered.length} of ${vehicles.length} vehicles`;
    els.table.style.display = filtered.length ? "" : "none";
    els.empty.style.display = filtered.length ? "none" : "";

    els.tbody.innerHTML = filtered.map(v => {
      const thumb = mainImageOf(v);
      return `
      <tr>
        <td data-label="Photo">
          ${thumb ? `<img class="cell-thumb" src="${thumb}" alt="">` : `<div class="cell-thumb"></div>`}
        </td>
        <td data-label="Vehicle">
          <div class="cell-primary">${escapeHtml(v.make)} ${escapeHtml(v.model)}</div>
          <div class="cell-sub">${escapeHtml(v.variant || "")} · ${v.year || ""}</div>
        </td>
        <td data-label="Price">
          ${formatCurrency(v.price)}
          ${v.previousPrice ? `<div class="cell-sub" style="text-decoration:line-through;">${formatCurrency(v.previousPrice)}</div>` : ""}
        </td>
        <td data-label="Mileage">${v.mileage ? Number(v.mileage).toLocaleString("en-GB") + " mi" : "—"}</td>
        <td data-label="Status">${statusBadge(v.status)}</td>
        <td data-label="Featured">${v.featured ? `<span class="badge badge-featured">Featured</span>` : `<span class="text-grey text-sm">—</span>`}</td>
        <td data-label="Added">${formatDate(v.dateAdded)}</td>
        <td data-label="Actions">
          <div class="flex gap-8" style="justify-content:flex-end;">
            <a class="btn btn-ghost btn-sm" href="vehicle-edit.html?id=${encodeURIComponent(v.id)}">Edit</a>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${v.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join("");
  }

  els.tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='delete']");
    if (!btn) return;
    const id = btn.dataset.id;
    const v = vehicles.find(x => x.id === id);
    confirmDelete(`${v.make} ${v.model} ${v.variant || ""}`.trim(), async () => {
      vehicles = vehicles.filter(x => x.id !== id);
      await Store.saveVehicles(vehicles);
      Store.logActivity(`Vehicle deleted: ${v.make} ${v.model} ${v.variant || ""}`.trim());
      showToast("Vehicle deleted", "Remember to Publish so this is removed from the live site too.", "success");
      render();
    });
  });

  [els.search, els.status, els.featured].forEach(el => el.addEventListener("input", render));

  /* ---------------- Pull latest from GitHub ---------------- */

  function openPullConfirm() {
    openConfirmModal({
      title: "Pull latest from GitHub?",
      message: "This replaces everything currently shown here with the vehicles published in data/vehicles.json on GitHub. Any unpublished local changes in this browser will be lost.",
      confirmText: "Pull latest",
      onConfirm: async () => {
        try {
          const result = await apiRequest(CONFIG.API.GET_VEHICLES);
          vehicles = result.vehicles || [];
          await Store.saveVehicles(vehicles);
          Store.logActivity("Pulled latest vehicle inventory from GitHub");
          showToast("Pulled latest", `${vehicles.length} vehicle(s) loaded from GitHub.`, "success");
          render();
        } catch (err) {
          showToast("Pull failed", err.message, "warn");
        }
      }
    });
  }
  document.getElementById("btn-pull").addEventListener("click", openPullConfirm);

  /* ---------------- Publish to website ---------------- */

  async function doPublish(btn) {
    btn.disabled = true;
    btn.textContent = "Publishing…";
    try {
      const result = await apiRequest(CONFIG.API.PUBLISH_VEHICLES, {
        method: "POST",
        body: JSON.stringify({ vehicles })
      });
      Store.logActivity(`Published ${result.vehicleCount} vehicle(s) to GitHub`);
      showToast("Published", `${result.vehicleCount} vehicles committed to ${CONFIG.GITHUB_PUBLISH_PATH}.`, "success");
    } catch (err) {
      showToast("Publish failed", err.message, "warn");
    } finally {
      btn.disabled = false;
      btn.textContent = "Publish All Vehicles";
    }
  }

  document.getElementById("btn-publish").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!vehicles.length) {
      // An empty list replaces the live inventory with nothing, so make that deliberate.
      openConfirmModal({
        title: "Publish an empty inventory?",
        message: "There are no vehicles in this browser's working copy. Publishing now will REMOVE every vehicle from the live website. If you meant to load the existing inventory, cancel and use Pull Latest first.",
        confirmText: "Publish empty list",
        danger: true,
        onConfirm: () => doPublish(btn)
      });
      return;
    }
    doPublish(btn);
  });

  if (window.location.hash === "#pull") openPullConfirm();

  if (window.location.hash === "#publish") {
    document.getElementById("publish").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  render();
})();
