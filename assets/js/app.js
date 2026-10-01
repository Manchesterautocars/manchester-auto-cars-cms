/**
 * app.js
 * Shared runtime for the Vehicle CMS: local working-copy data layer,
 * sidebar/topbar chrome (with the official logo), toasts, confirm modal,
 * unsaved-changes guard and the activity log.
 *
 * Data model note:
 * localStorage here is a WORKING COPY / draft cache only. The real source
 * of truth is data/vehicles.json in the manchesterauto/manchester-auto-cars GitHub
 * repo. Use "Pull Latest" to sync down from GitHub and "Publish" to push
 * up — see assets/js/vehicles.js and /api/publish-vehicles.js.
 */

/* ---------------------------------------------------------------- */
/* Icon set (inline SVG, no external icon fonts)                     */
/* ---------------------------------------------------------------- */

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13"/><rect x="2.5" y="13" width="19" height="5.5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.5 19H8a5 5 0 1 1 1.6-9.75A6 6 0 0 1 21 12.5a4 4 0 0 1-3.5 6.5z"/></svg>'
};

/* ---------------------------------------------------------------- */
/* Data store — vehicles-only working-copy layer                     */
/* ---------------------------------------------------------------- */

const Store = {
  async getVehicles() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.VEHICLES);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* fall through to seed */ }
    }
    const res = await fetch(CONFIG.SEED_PATHS.VEHICLES);
    const seed = await res.json();
    const list = Array.isArray(seed) ? seed : (seed.vehicles || []);
    localStorage.setItem(CONFIG.STORAGE_KEYS.VEHICLES, JSON.stringify(list));
    return list;
  },
  async saveVehicles(list) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.VEHICLES, JSON.stringify(list));
  },

  getActivity() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVITY);
    return raw ? JSON.parse(raw) : [];
  },
  logActivity(message) {
    const list = this.getActivity();
    list.unshift({ message, at: new Date().toISOString() });
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVITY, JSON.stringify(list.slice(0, 100)));
  },

  resetAll() {
    Object.values(CONFIG.STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  }
};

/* ---------------------------------------------------------------- */
/* Utilities                                                          */
/* ---------------------------------------------------------------- */

function uid(prefix) {
  // URL-safe: lowercase letters, digits and hyphens only — safe for
  // Website 1's /cars/<id> route.
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
}

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isUrlSafeId(id) {
  return typeof id === "string" && /^[a-z0-9-]+$/.test(id) && id.length <= 80;
}

/**
 * Published vehicles store photos as plain URLs, so after "Pull Latest" the
 * Cloudinary publicId is no longer known. Recover it from a Cloudinary URL
 * like .../image/upload/v123/manchester-auto-cars/vehicles/<id>/<file>.jpg so
 * deleting a pulled photo also removes it from Cloudinary. Only URLs inside
 * our own folder are recognised; anything else returns null.
 */
function publicIdFromCloudinaryUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/image\/upload\/(?:v\d+\/)?(manchester-auto-cars\/vehicles\/[^?#]+?)\.[a-z0-9]+(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Local-only optimistic preview while a file uploads to Cloudinary. Never persisted. */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no JSON body */ }
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

/* ---------------------------------------------------------------- */
/* Toasts                                                             */
/* ---------------------------------------------------------------- */

function ensureToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(title, message, type = "default") {
  const stack = ensureToastStack();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(message || "")}`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 200ms ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, 4200);
}

/* ---------------------------------------------------------------- */
/* Confirm modal                                                     */
/* ---------------------------------------------------------------- */

function ensureModal() {
  let backdrop = document.getElementById("confirm-modal");
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "confirm-modal";
  backdrop.innerHTML = `
    <div class="modal" role="alertdialog" aria-modal="true">
      <h3 id="confirm-modal-title">Are you sure?</h3>
      <p id="confirm-modal-message"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="confirm-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="confirm-modal-ok">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  return backdrop;
}

function openConfirmModal({ title = "Are you sure?", message, confirmText = "Confirm", danger = false, onConfirm }) {
  const backdrop = ensureModal();
  backdrop.querySelector("#confirm-modal-title").textContent = title;
  backdrop.querySelector("#confirm-modal-message").textContent = message;
  const okBtn = backdrop.querySelector("#confirm-modal-ok");
  okBtn.textContent = confirmText;
  const cancelBtn = backdrop.querySelector("#confirm-modal-cancel");

  const close = () => backdrop.classList.remove("open");
  const okHandler = () => { close(); onConfirm && onConfirm(); cleanup(); };
  const cancelHandler = () => { close(); cleanup(); };
  function cleanup() {
    okBtn.removeEventListener("click", okHandler);
    cancelBtn.removeEventListener("click", cancelHandler);
  }
  okBtn.addEventListener("click", okHandler);
  cancelBtn.addEventListener("click", cancelHandler);
  backdrop.classList.add("open");
}

function confirmDelete(itemLabel, onConfirm) {
  openConfirmModal({
    title: "Delete this item?",
    message: `Are you sure you want to delete ${itemLabel}? This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
    onConfirm
  });
}

/* ---------------------------------------------------------------- */
/* Unsaved-changes guard                                             */
/* ---------------------------------------------------------------- */

const UnsavedGuard = {
  dirty: false,
  arm() { this.dirty = true; },
  disarm() { this.dirty = false; },
  init() {
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    });
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (!link) return;
      if (link.target === "_blank" || link.hasAttribute("data-ignore-guard")) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (this.dirty) {
        e.preventDefault();
        openConfirmModal({
          title: "Unsaved changes",
          message: "You have unsaved changes. Leave without saving?",
          confirmText: "Leave without saving",
          danger: true,
          onConfirm: () => { this.dirty = false; window.location.href = href; }
        });
      }
    }, true);
  }
};

/* ---------------------------------------------------------------- */
/* Sidebar / topbar chrome                                           */
/* ---------------------------------------------------------------- */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: ICONS.dashboard },
  {
    key: "vehicles", label: "Vehicles", icon: ICONS.car,
    children: [
      { key: "vehicles", label: "All Vehicles", href: "vehicles.html" },
      { key: "vehicle-edit", label: "Add Vehicle", href: "vehicle-edit.html" }
    ]
  }
];

function renderSidebar(activeKey) {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;

  const navHtml = NAV_ITEMS.map((item) => {
    if (item.children) {
      const childHtml = item.children.map((c) => `
        <a class="nav-link ${c.key === activeKey ? "active" : ""}" href="${c.href}">${c.label}</a>
      `).join("");
      const groupActive = item.children.some((c) => c.key === activeKey);
      return `
        <div class="nav-group">
          <div class="nav-link ${groupActive ? "active" : ""}" style="cursor:default;">${item.icon}<span>${item.label}</span></div>
          <div class="nav-sub">${childHtml}</div>
        </div>`;
    }
    return `<a class="nav-link ${item.key === activeKey ? "active" : ""}" href="${item.href}">${item.icon}<span>${item.label}</span></a>`;
  }).join("");

  mount.innerHTML = `
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-logo-plate"><img src="${CONFIG.LOGO_PATH}" alt="Manchester Auto Cars"></div>
      </div>
      <nav class="sidebar-nav">
        ${navHtml}
        <div class="nav-divider"></div>
        <a class="nav-link" href="${CONFIG.PUBLIC_WEBSITE_URL}" target="_blank" rel="noopener">${ICONS.eye}<span>View Website</span></a>
        <div class="nav-divider"></div>
        <a class="nav-link ${activeKey === "settings" ? "active" : ""}" href="settings.html">${ICONS.settings}<span>Settings</span></a>
        <a class="nav-link" href="index.html" data-ignore-guard>${ICONS.logout}<span>Logout</span></a>
      </nav>
      <div class="sidebar-foot">Manchester Auto Cars<br>Vehicle Management CMS</div>
    </aside>`;

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const hamburger = document.querySelector(".hamburger");
  const closeSidebar = () => { sidebar.classList.remove("open"); overlay.classList.remove("open"); };
  if (hamburger) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("open");
    });
  }
  overlay.addEventListener("click", closeSidebar);
  sidebar.querySelectorAll("a.nav-link").forEach((a) => a.addEventListener("click", closeSidebar));
}

function initTopbar(title, subtitle) {
  const el = document.getElementById("topbar-title");
  if (el) {
    el.innerHTML = `<h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}`;
  }
}

/* ---------------------------------------------------------------- */
/* Page bootstrap                                                    */
/* ---------------------------------------------------------------- */

function initPage(activeKey, title, subtitle) {
  renderSidebar(activeKey);
  initTopbar(title, subtitle);
  UnsavedGuard.init();
}
