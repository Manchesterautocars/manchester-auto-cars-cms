(async function () {
  initPage("vehicles", "Add Vehicle", "Add a new vehicle to the Manchester Auto Cars inventory");

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");

  let vehicles = await Store.getVehicles();
  let vehicle = editId ? vehicles.find(v => v.id === editId) : null;

  const isNew = !vehicle;
  if (isNew) {
    vehicle = {
      id: uid("mac"), make: "", model: "", variant: "", year: new Date().getFullYear(),
      registration: "", mileage: "", fuel: "Petrol", transmission: "Manual", engine: "",
      bodyType: "", colour: "", price: "", previousPrice: "", status: "available",
      featured: false, description: "", highlights: [], location: "", images: [],
      seoTitle: "", seoDescription: "", dateAdded: new Date().toISOString().slice(0, 10)
    };
  } else {
    initTopbar("Edit Vehicle", `${vehicle.make} ${vehicle.model} ${vehicle.variant || ""}`.trim());
  }
  // Vehicle ID is fixed for the lifetime of this form load — editing never
  // regenerates it, and a new vehicle keeps the ID it was given above.
  const vehicleId = vehicle.id;

  const form = document.getElementById("vehicle-form");
  let highlights = [...(vehicle.highlights || [])];

  // Normalise images to a consistent working shape: { url, publicId, status, tempId }.
  // Legacy plain-string image entries (from before this Cloudinary rework)
  // are treated as already-uploaded images; their publicId is recovered from the Cloudinary URL where possible.
  let images = (vehicle.images || []).map((img) => {
    if (typeof img === "string") return { url: img, publicId: publicIdFromCloudinaryUrl(img), status: "done", tempId: uid("img") };
    return { url: img.url, publicId: img.publicId || publicIdFromCloudinaryUrl(img.url), status: "done", tempId: uid("img") };
  });

  /* ---------------- Populate form ---------------- */

  function populateForm() {
    Object.entries(vehicle).forEach(([key, value]) => {
      const input = form.elements[key];
      if (!input) return;
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = value ?? "";
    });
    renderHighlights();
    renderImages();
  }
  populateForm();

  /* ---------------- Tabs ---------------- */

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    });
  });

  function goToTab(name) {
    document.querySelector(`.tab-btn[data-tab="${name}"]`)?.click();
  }

  /* ---------------- Dirty tracking ---------------- */

  form.addEventListener("input", () => UnsavedGuard.arm());

  /* ---------------- Highlights ---------------- */

  function renderHighlights() {
    document.getElementById("highlight-list").innerHTML = highlights.map((h, i) => `
      <span class="chip">${escapeHtml(h)}<button type="button" data-i="${i}" aria-label="Remove">&times;</button></span>
    `).join("") || `<span class="text-grey text-sm">No key features added yet.</span>`;
  }
  document.getElementById("highlight-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn) return;
    highlights.splice(Number(btn.dataset.i), 1);
    renderHighlights();
    UnsavedGuard.arm();
  });
  function addHighlight() {
    const input = document.getElementById("highlight-input");
    const val = input.value.trim();
    if (!val) return;
    highlights.push(val);
    input.value = "";
    renderHighlights();
    UnsavedGuard.arm();
  }
  document.getElementById("highlight-add").addEventListener("click", addHighlight);
  document.getElementById("highlight-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addHighlight(); }
  });

  /* ---------------- Photos: Cloudinary direct upload, reorder, main photo, delete ---------------- */

  function renderImages() {
    const grid = document.getElementById("vimg-grid");
    if (!images.length) {
      grid.innerHTML = `<p class="text-grey text-sm">No photos uploaded yet. The first photo becomes the main photo.</p>`;
      return;
    }
    grid.innerHTML = images.map((img, i) => `
      <div class="vimg-tile ${i === 0 ? "is-cover" : ""} ${img.status === "uploading" ? "is-uploading" : ""} ${img.status === "error" ? "upload-failed" : ""}"
           draggable="${img.status === "done"}" data-tempid="${img.tempId}">
        <img src="${img.url}" alt="">
        ${img.status === "uploading" ? `<div class="vimg-progress">Uploading…</div>` : ""}
        ${img.status === "error" ? `<div class="vimg-progress error">Upload failed<br>Tap ✕ to remove</div>` : ""}
        ${img.status === "done" ? `
          <div class="vimg-controls">
            ${i !== 0 ? `<button type="button" data-action="cover" data-tempid="${img.tempId}" title="Set as main photo">★</button>` : ""}
            <button type="button" data-action="remove" data-tempid="${img.tempId}" title="Remove">✕</button>
          </div>` : `
          <div class="vimg-controls" style="opacity:1;">
            <button type="button" data-action="remove" data-tempid="${img.tempId}" title="Cancel/Remove">✕</button>
          </div>`}
      </div>
    `).join("");
    attachDragHandlers();
  }

  function findByTempId(tempId) { return images.findIndex(i => i.tempId === tempId); }

  document.getElementById("vimg-grid").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const i = findByTempId(btn.dataset.tempid);
    if (i === -1) return;
    if (btn.dataset.action === "remove") {
      const [removed] = images.splice(i, 1);
      UnsavedGuard.arm();
      renderImages();
      if (removed.status === "done" && removed.publicId) {
        try {
          await apiRequest(CONFIG.API.DELETE_IMAGE, { method: "POST", body: JSON.stringify({ publicId: removed.publicId }) });
        } catch (err) {
          showToast("Cloudinary cleanup failed", `The photo was removed from this vehicle, but deleting it from Cloudinary failed: ${err.message}`, "warn");
        }
      }
    } else if (btn.dataset.action === "cover") {
      const [img] = images.splice(i, 1);
      images.unshift(img);
      UnsavedGuard.arm();
      renderImages();
    }
  });

  function attachDragHandlers() {
    const tiles = [...document.querySelectorAll(".vimg-tile[draggable='true']")];
    let dragFrom = null;
    tiles.forEach(tile => {
      tile.addEventListener("dragstart", () => { dragFrom = findByTempId(tile.dataset.tempid); tile.classList.add("dragging"); });
      tile.addEventListener("dragend", () => tile.classList.remove("dragging"));
      tile.addEventListener("dragover", (e) => e.preventDefault());
      tile.addEventListener("drop", (e) => {
        e.preventDefault();
        const dragTo = findByTempId(tile.dataset.tempid);
        if (dragFrom === null || dragFrom === dragTo || dragFrom === -1) return;
        const [moved] = images.splice(dragFrom, 1);
        images.splice(dragTo, 0, moved);
        UnsavedGuard.arm();
        renderImages();
      });
    });
  }

  const vimgInput = document.getElementById("vimg-input");
  const vimgDrop = document.getElementById("vimg-drop");
  const ACCEPTED_TYPES = CONFIG.IMAGE_ACCEPT.split(",");

  async function uploadOne(file) {
    const tempId = uid("img");
    const localPreview = await readFileAsDataURL(file).catch(() => "");
    images.push({ url: localPreview, publicId: null, status: "uploading", tempId });
    UnsavedGuard.arm();
    renderImages();

    try {
      const sign = await apiRequest(CONFIG.API.CLOUDINARY_SIGN, {
        method: "POST",
        body: JSON.stringify({ vehicleId })
      });

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey);
      form.append("timestamp", sign.timestamp);
      form.append("signature", sign.signature);
      form.append("folder", sign.folder);
      form.append("allowed_formats", sign.allowedFormats);

      const uploadRes = await fetch(sign.uploadUrl, { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error?.message || "Cloudinary upload failed.");

      const idx = findByTempId(tempId);
      if (idx === -1) {
        // The user removed this tile while the upload was still in flight —
        // best-effort clean up the asset we just created.
        apiRequest(CONFIG.API.DELETE_IMAGE, { method: "POST", body: JSON.stringify({ publicId: uploadData.public_id }) }).catch(() => {});
        return;
      }
      images[idx] = { url: uploadData.secure_url, publicId: uploadData.public_id, status: "done", tempId };
      renderImages();
    } catch (err) {
      const idx = findByTempId(tempId);
      if (idx !== -1) {
        images[idx].status = "error";
        renderImages();
      }
      showToast("Upload failed", `${file.name}: ${err.message}`, "warn");
    }
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (images.length + files.length > CONFIG.MAX_IMAGES_PER_VEHICLE) {
      showToast("Too many photos", `A vehicle can have up to ${CONFIG.MAX_IMAGES_PER_VEHICLE} photos.`, "warn");
    }
    const room = Math.max(0, CONFIG.MAX_IMAGES_PER_VEHICLE - images.length);
    for (const file of files.slice(0, room)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        showToast("Unsupported format", `${file.name} was skipped — use JPEG, PNG or WEBP.`, "warn");
        continue;
      }
      if (file.size > CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showToast("File too large", `${file.name} is over ${CONFIG.MAX_IMAGE_SIZE_MB}MB and was skipped.`, "warn");
        continue;
      }
      uploadOne(file); // fire concurrently; each updates its own tile when done
    }
  }

  vimgInput.addEventListener("change", (e) => { handleFiles(e.target.files); vimgInput.value = ""; });
  ["dragenter", "dragover"].forEach(evt => vimgDrop.addEventListener(evt, (e) => { e.preventDefault(); vimgDrop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(evt => vimgDrop.addEventListener(evt, (e) => { e.preventDefault(); vimgDrop.classList.remove("dragover"); }));
  vimgDrop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  /* ---------------- Validation ---------------- */

  function clearErrors() {
    form.querySelectorAll(".field.has-error").forEach(f => f.classList.remove("has-error"));
  }

  function validate() {
    clearErrors();
    let firstBadTab = null;
    let ok = true;
    const checks = [
      { name: "make", test: v => v.trim().length > 0, tab: "basic" },
      { name: "model", test: v => v.trim().length > 0, tab: "basic" },
      { name: "year", test: v => /^\d{4}$/.test(v) && Number(v) >= 1980, tab: "basic" },
      { name: "price", test: v => v !== "" && !isNaN(Number(v)) && Number(v) >= 0, tab: "pricing" },
      { name: "mileage", test: v => v !== "" && !isNaN(Number(v)) && Number(v) >= 0, tab: "specs" }
    ];
    checks.forEach(({ name, test, tab }) => {
      const input = form.elements[name];
      const wrap = input.closest(".field");
      if (!test(input.value)) {
        wrap.classList.add("has-error");
        ok = false;
        if (!firstBadTab) firstBadTab = tab;
      }
    });
    if (!ok) goToTab(firstBadTab);
    if (ok && images.some(i => i.status === "uploading")) {
      showToast("Photos still uploading", "Wait for all photos to finish uploading before saving.", "warn");
      goToTab("images");
      ok = false;
    }
    return ok;
  }

  function buildUpdatedVehicle() {
    const fd = new FormData(form);
    return {
      ...vehicle,
      id: vehicleId, // never changes, regardless of anything else in the form
      make: fd.get("make").trim(),
      model: fd.get("model").trim(),
      variant: fd.get("variant").trim(),
      year: Number(fd.get("year")),
      registration: fd.get("registration").trim(),
      bodyType: fd.get("bodyType").trim(),
      colour: fd.get("colour").trim(),
      location: fd.get("location").trim(),
      price: Number(fd.get("price")),
      previousPrice: fd.get("previousPrice") ? Number(fd.get("previousPrice")) : null,
      mileage: Number(fd.get("mileage")),
      fuel: fd.get("fuel"),
      transmission: fd.get("transmission"),
      engine: fd.get("engine").trim(),
      description: fd.get("description").trim(),
      status: fd.get("status"),
      featured: form.elements.featured.checked,
      seoTitle: fd.get("seoTitle").trim(),
      seoDescription: fd.get("seoDescription").trim(),
      highlights,
      images: images.filter(i => i.status === "done").map(i => ({ url: i.url, publicId: i.publicId }))
    };
  }

  async function saveVehicle() {
    const updated = buildUpdatedVehicle();
    if (isNew) {
      vehicles.push(updated);
      Store.logActivity(`Vehicle added: ${updated.make} ${updated.model} ${updated.variant || ""}`.trim());
    } else {
      vehicles = vehicles.map(v => v.id === updated.id ? updated : v);
      Store.logActivity(`Vehicle edited: ${updated.make} ${updated.model} ${updated.variant || ""}`.trim());
    }
    await Store.saveVehicles(vehicles);
    UnsavedGuard.disarm();
    vehicle = updated;
    return updated;
  }

  document.getElementById("btn-save").addEventListener("click", async () => {
    if (!validate()) { showToast("Check the form", "Some required fields need attention.", "warn"); return; }
    await saveVehicle();
    showToast("Vehicle saved", "Saved to the CMS. Publish when you're ready to update the live site.", "success");
    setTimeout(() => { window.location.href = "vehicles.html"; }, 700);
  });

  document.getElementById("btn-save-publish").addEventListener("click", async (e) => {
    if (!validate()) { showToast("Check the form", "Some required fields need attention.", "warn"); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Publishing…";
    try {
      await saveVehicle();
      const result = await apiRequest(CONFIG.API.PUBLISH_VEHICLES, {
        method: "POST",
        body: JSON.stringify({ vehicles })
      });
      Store.logActivity(`Published ${result.vehicleCount} vehicle(s) to GitHub`);
      showToast("Published", `${result.vehicleCount} vehicles are now live on data/vehicles.json.`, "success");
      setTimeout(() => { window.location.href = "vehicles.html"; }, 900);
    } catch (err) {
      showToast("Publish failed", err.message, "warn");
      btn.disabled = false;
      btn.textContent = "Save & Publish";
    }
  });

  /* ---------------- Preview ---------------- */

  function buildPreviewHtml(v, imgs) {
    const cover = imgs?.[0]?.url;
    return `
      <div class="preview-hero">${cover ? `<img src="${cover}" alt="">` : "No image"}</div>
      <div class="preview-body">
        <h3 style="margin-bottom:2px;">${escapeHtml(v.make || "Make")} ${escapeHtml(v.model || "Model")}</h3>
        <p class="text-grey text-sm" style="margin:0;">${escapeHtml(v.variant || "")} · ${v.year || ""}</p>
        <div class="price-row">
          <span class="price">${formatCurrency(Number(v.price) || 0)}</span>
          ${v.previousPrice ? `<span class="prev-price">${formatCurrency(Number(v.previousPrice))}</span>` : ""}
        </div>
        <div class="preview-spec-grid">
          <div class="spec"><div class="k">Mileage</div><div class="v">${v.mileage ? Number(v.mileage).toLocaleString("en-GB") + " mi" : "—"}</div></div>
          <div class="spec"><div class="k">Fuel</div><div class="v">${escapeHtml(v.fuel || "—")}</div></div>
          <div class="spec"><div class="k">Transmission</div><div class="v">${escapeHtml(v.transmission || "—")}</div></div>
          <div class="spec"><div class="k">Body Type</div><div class="v">${escapeHtml(v.bodyType || "—")}</div></div>
          <div class="spec"><div class="k">Colour</div><div class="v">${escapeHtml(v.colour || "—")}</div></div>
          <div class="spec"><div class="k">Engine</div><div class="v">${escapeHtml(v.engine || "—")}</div></div>
        </div>
        <p style="font-size:13px; color:var(--grey); line-height:1.6;">${escapeHtml(v.description || "No description added yet.")}</p>
        ${v.highlights?.length ? `<div class="chip-list">${v.highlights.map(h => `<span class="chip">${escapeHtml(h)}</span>`).join("")}</div>` : ""}
      </div>`;
  }

  document.getElementById("btn-preview").addEventListener("click", () => {
    const fd = new FormData(form);
    const previewData = { ...vehicle, ...Object.fromEntries(fd.entries()), featured: form.elements.featured.checked, highlights };
    document.getElementById("preview-content").innerHTML = buildPreviewHtml(previewData, images);
    document.getElementById("preview-modal").classList.add("open");
  });
  document.getElementById("preview-close").addEventListener("click", () => {
    document.getElementById("preview-modal").classList.remove("open");
  });
})();
