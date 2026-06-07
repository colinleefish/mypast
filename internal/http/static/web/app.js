const API = "/api/v1/browse";

const tabs = [
  { id: "guide", label: "Guide", path: null },
  { id: "overview", label: "Overview", path: "/overview" },
  { id: "sessions", label: "Sessions", path: "/sessions" },
  { id: "atoms", label: "Atoms", path: "/atoms" },
  { id: "scenes", label: "Scenes", path: "/scenes" },
  { id: "memories", label: "Memories", path: "/memories" },
  { id: "pipeline", label: "Pipeline", path: "/pipeline-state" },
  { id: "tasks", label: "Tasks", path: "/tasks" },
];

const state = {
  tab: "overview",
  overview: null,
  selectedKey: null,
  selectedRowIdx: null,
  atomsFilter: { q: "", category: "all" },
};

const $ = (sel) => document.querySelector(sel);
const panel = () => $("#panel");
const statusEl = () => $("#status");

function showStatus(msg) {
  const el = statusEl();
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

async function api(path) {
  const res = await fetch(API + path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || res.statusText);
  }
  return body;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function fmtTimeShort(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return s;
  }
}

function field(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") return row[k];
  }
  return null;
}

function sessionKeyFromURI(uri) {
  const m = /mypast:\/\/sessions\/([^/]+)/i.exec(uri || "");
  if (!m) return null;
  const key = m[1];
  return key.length > 10 ? key.slice(0, 8) + "…" : key;
}

function truncate(s, max) {
  if (!s) return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function categoryBadge(cat) {
  const c = (cat || "default").toLowerCase();
  const cls = ["profile", "preferences", "entities", "events"].includes(c)
    ? `badge-${c}`
    : "badge-default";
  return `<span class="badge ${cls}">${esc(c)}</span>`;
}

function statusBadge(status) {
  const s = (status || "unknown").toLowerCase();
  const destructive = s === "failed";
  const cls = destructive ? "badge-destructive" : "badge-outline";
  return `<span class="badge ${cls} status-dot ${esc(s)}">${esc(s)}</span>`;
}

function pageHeader(title, description) {
  return `
    <div class="page-header">
      <h2>${esc(title)}</h2>
      ${description ? `<p>${description}</p>` : ""}
    </div>`;
}

function parseJSONL(raw) {
  if (!raw) return [];
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { role: "?", content: line, _parse_error: true };
      }
    });
}

function renderMessages(jsonl) {
  const msgs = parseJSONL(jsonl);
  if (!msgs.length) return '<p class="empty">No messages</p>';
  return msgs
    .map(
      (m) => `
    <div class="msg ${esc(m.role || "")}">
      <span class="role">${esc(m.role)}</span>
      ${esc(m.content || "")}
    </div>`
    )
    .join("");
}

function renderNav() {
  const counts = state.overview?.counts || {};
  $("#nav").innerHTML = `
    <div class="nav-group-label">Browse</div>
    ${tabs
      .map((t) => {
        const key =
          t.id === "pipeline"
            ? "pipeline_states"
            : t.id === "overview" || t.id === "guide"
              ? null
              : t.id;
        const n = key ? counts[key] ?? "—" : "";
        return `<button type="button" data-tab="${t.id}" class="${state.tab === t.id ? "active" : ""}">
        <span>${t.label}</span>
        ${n !== "" ? `<span class="count">${n}</span>` : ""}
      </button>`;
      })
      .join("")}`;

  $("#nav").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

async function switchTab(id) {
  state.tab = id;
  state.selectedKey = null;
  state.selectedRowIdx = null;
  renderNav();
  showStatus("");
  try {
    await renderPanel();
  } catch (err) {
    showStatus(err.message);
  }
}

async function goToSession(sessionKey) {
  state.tab = "sessions";
  state.selectedKey = sessionKey;
  renderNav();
  showStatus("");
  try {
    await renderPanel();
  } catch (err) {
    showStatus(err.message);
  }
}

async function loadOverviewCounts() {
  state.overview = await api("/overview");
  renderNav();
}

function renderGuideHTML() {
  return `
    ${pageHeader("Guide", "How capture and distillation layers connect.")}
    <div class="guide-flow" aria-label="Distillation pyramid">
      <div class="guide-step"><span class="guide-tier">session</span><strong>sessions</strong><span class="guide-sub">one agent conversation</span></div>
      <div class="guide-arrow">↓ hook upload</div>
      <div class="guide-step"><span class="guide-tier">T0</span><strong>session_turns</strong><span class="guide-sub">user + assistant pair</span></div>
      <div class="guide-arrow">↓ T1 extract</div>
      <div class="guide-step"><span class="guide-tier">T1</span><strong>atoms</strong><span class="guide-sub">typed facts</span></div>
      <div class="guide-arrow">↓ T2</div>
      <div class="guide-step"><span class="guide-tier">T2</span><strong>scenes</strong><span class="guide-sub">what we were doing</span></div>
      <div class="guide-arrow">↓ T3</div>
      <div class="guide-step"><span class="guide-tier">T3</span><strong>memories</strong><span class="guide-sub">profile · preferences · entities · events</span></div>
    </div>
    <div class="section">
      <h3>Memory categories</h3>
      <ul class="guide-list">
        <li><code>profile</code> — singleton identity</li>
        <li><code>preferences</code> — habits and AI behavior rules</li>
        <li><code>entities</code> — people, companies, projects</li>
        <li><code>events</code> — dated milestones (append-only)</li>
      </ul>
    </div>`;
}

function wireGuideNav(root) {
  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
}

function filterAtoms(items) {
  const { q, category } = state.atomsFilter;
  const needle = q.trim().toLowerCase();
  return items.filter((row) => {
    const cat = (field(row, "category", "Category") || "").toLowerCase();
    if (category !== "all" && cat !== category) return false;
    if (!needle) return true;
    const content = (field(row, "content", "Content") || "").toLowerCase();
    const slug = (field(row, "slug", "Slug") || "").toLowerCase();
    const scene = (field(row, "scene_name", "SceneName") || "").toLowerCase();
    const uri = (field(row, "uri", "URI") || "").toLowerCase();
    return (
      content.includes(needle) ||
      slug.includes(needle) ||
      scene.includes(needle) ||
      uri.includes(needle)
    );
  });
}

function renderAtomTableRows(items, selectedIdx) {
  if (!items.length) {
    return `<tr><td colspan="5" class="empty" style="padding:2rem;text-align:center">No atoms match your filters</td></tr>`;
  }
  return items
    .map((row, i) => {
      const content = field(row, "content", "Content") || "—";
      const category = field(row, "category", "Category");
      const scene = field(row, "scene_name", "SceneName");
      const slug = field(row, "slug", "Slug");
      const priority = field(row, "priority", "Priority") ?? "—";
      const uri = field(row, "uri", "URI");
      const created = field(row, "created_at", "CreatedAt");
      const sessionShort = sessionKeyFromURI(uri) || "—";
      const topicParts = [scene, slug].filter(Boolean);
      const topic = topicParts.length ? topicParts.join(" · ") : "—";
      const priClass = Number(priority) >= 70 ? " high" : "";
      const selected = selectedIdx === i ? " selected" : "";

      return `
        <tr data-idx="${i}" class="${selected}">
          <td>
            <div class="cell-primary cell-clamp-2">${esc(content)}</div>
          </td>
          <td>${categoryBadge(category)}</td>
          <td>
            <div class="cell-secondary">${esc(topic)}</div>
          </td>
          <td><span class="cell-mono" title="${esc(uri)}">${esc(sessionShort)}</span></td>
          <td>
            <span class="priority-pill${priClass}">${esc(priority)}</span>
            <div class="cell-meta">${fmtTimeShort(created)}</div>
          </td>
        </tr>`;
    })
    .join("");
}

function renderAtomDetailCard(row) {
  if (!row) return "";
  const content = field(row, "content", "Content");
  const uri = field(row, "uri", "URI");
  const category = field(row, "category", "Category");
  const scene = field(row, "scene_name", "SceneName");
  const slug = field(row, "slug", "Slug");
  const priority = field(row, "priority", "Priority");
  const created = field(row, "created_at", "CreatedAt");

  return `
    <div class="card row-detail">
      <div class="card-content">
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:0.75rem">
          ${categoryBadge(category)}
          ${scene ? `<span class="badge badge-outline">${esc(scene)}</span>` : ""}
          ${slug ? `<span class="badge badge-outline">${esc(slug)}</span>` : ""}
          <span class="badge badge-outline">P${esc(priority ?? "—")}</span>
        </div>
        <p class="detail-body">${esc(content)}</p>
        <p class="detail-uri">${esc(uri)}</p>
        <p class="cell-meta" style="margin-top:0.5rem">${fmtTime(created)}</p>
      </div>
    </div>`;
}

async function renderAtomsPanel(p) {
  const { items: all } = await api("/atoms");
  const filtered = filterAtoms(all);

  p.innerHTML = `
    ${pageHeader("Atoms", "Facts extracted from chat turns (T1).")}
    <div class="card data-table-card">
      <div class="card-content" style="padding:1rem 1.5rem 0">
        <div class="toolbar">
          <input type="search" class="input" id="atoms-search" placeholder="Search facts…" value="${esc(state.atomsFilter.q)}" />
          <select class="select" id="atoms-category" aria-label="Category filter">
            <option value="all"${state.atomsFilter.category === "all" ? " selected" : ""}>All categories</option>
            <option value="profile"${state.atomsFilter.category === "profile" ? " selected" : ""}>profile</option>
            <option value="preferences"${state.atomsFilter.category === "preferences" ? " selected" : ""}>preferences</option>
            <option value="entities"${state.atomsFilter.category === "entities" ? " selected" : ""}>entities</option>
            <option value="events"${state.atomsFilter.category === "events" ? " selected" : ""}>events</option>
          </select>
          <span class="toolbar-spacer"></span>
          <span class="toolbar-meta">${filtered.length} of ${all.length}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="min-width:14rem">Fact</th>
              <th>Category</th>
              <th>Topic</th>
              <th>Session</th>
              <th>Priority · When</th>
            </tr>
          </thead>
          <tbody id="atoms-tbody">
            ${renderAtomTableRows(filtered, state.selectedRowIdx)}
          </tbody>
        </table>
      </div>
    </div>
    <div id="row-detail"></div>`;

  const searchEl = p.querySelector("#atoms-search");
  const catEl = p.querySelector("#atoms-category");

  const applyFilters = () => {
    state.atomsFilter.q = searchEl.value;
    state.atomsFilter.category = catEl.value;
    state.selectedRowIdx = null;
    const next = filterAtoms(all);
    p.querySelector("#atoms-tbody").innerHTML = renderAtomTableRows(next, null);
    p.querySelector(".toolbar-meta").textContent = `${next.length} of ${all.length}`;
    p.querySelector("#row-detail").innerHTML = "";
    wireAtomRows(p, next);
  };

  searchEl.addEventListener("input", applyFilters);
  catEl.addEventListener("change", applyFilters);
  wireAtomRows(p, filtered);
}

function wireAtomRows(root, items) {
  root.querySelectorAll("#atoms-tbody tr[data-idx]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const idx = Number(tr.dataset.idx);
      state.selectedRowIdx = idx;
      root.querySelectorAll("#atoms-tbody tr.selected").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      root.querySelector("#row-detail").innerHTML = renderAtomDetailCard(items[idx]);
    });
  });

  if (state.selectedRowIdx != null && items[state.selectedRowIdx]) {
    const tr = root.querySelector(`#atoms-tbody tr[data-idx="${state.selectedRowIdx}"]`);
    tr?.classList.add("selected");
    root.querySelector("#row-detail").innerHTML = renderAtomDetailCard(items[state.selectedRowIdx]);
  }
}

function renderMemoriesPanel(p, items) {
  p.innerHTML = `
    ${pageHeader("Memories", "Long-term knowledge (T3).")}
    <div class="card data-table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Memory</th><th>Category</th><th>Slug</th><th>Version</th><th>Updated</th></tr>
          </thead>
          <tbody>
            ${items.length
              ? items
                  .map((row, i) => {
                    const abstract = field(row, "abstract", "Abstract");
                    const body = field(row, "body", "Body");
                    const primary = abstract || truncate(body, 120) || "—";
                    const secondary = abstract && body ? truncate(body, 80) : "";
                    return `
                <tr data-idx="${i}">
                  <td>
                    <div class="cell-primary cell-clamp-2">${esc(primary)}</div>
                    ${secondary ? `<div class="cell-secondary">${esc(secondary)}</div>` : ""}
                  </td>
                  <td>${categoryBadge(field(row, "category", "Category"))}</td>
                  <td class="cell-mono">${esc(field(row, "slug", "Slug") || "—")}</td>
                  <td class="cell-meta">${esc(field(row, "version", "Version") ?? "—")}</td>
                  <td class="cell-meta">${fmtTimeShort(field(row, "updated_at", "UpdatedAt"))}</td>
                </tr>`;
                  })
                  .join("")
              : `<tr><td colspan="5" class="empty" style="padding:2rem;text-align:center">No memories yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div id="row-detail"></div>`;
  wireGenericRowDetail(p, items, (row) => {
    const body = field(row, "body", "Body");
    const abstract = field(row, "abstract", "Abstract");
    return body || abstract;
  });
}

function renderScenesPanel(p, items) {
  p.innerHTML = `
    ${pageHeader("Scenes", "Session-level summaries (T2).")}
    <div class="card data-table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Scene</th><th>Session</th><th>Updated</th></tr>
          </thead>
          <tbody>
            ${items.length
              ? items
                  .map((row, i) => {
                    const abstract = field(row, "abstract", "Abstract");
                    const body = field(row, "body", "Body");
                    const uri = field(row, "uri", "URI");
                    return `
                <tr data-idx="${i}">
                  <td>
                    <div class="cell-primary cell-clamp-2">${esc(abstract || truncate(body, 100) || "—")}</div>
                    <div class="cell-secondary cell-mono">${esc(truncate(uri, 48))}</div>
                  </td>
                  <td class="cell-mono">${esc(sessionKeyFromURI(uri) || "—")}</td>
                  <td class="cell-meta">${fmtTimeShort(field(row, "updated_at", "UpdatedAt"))}</td>
                </tr>`;
                  })
                  .join("")
              : `<tr><td colspan="3" class="empty" style="padding:2rem;text-align:center">No scenes yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div id="row-detail"></div>`;
  wireGenericRowDetail(p, items, (row) => field(row, "body", "Body") || field(row, "abstract", "Abstract"));
}

function renderTasksPanel(p, items) {
  p.innerHTML = `
    ${pageHeader("Tasks", "Async worker runs.")}
    <div class="card data-table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Job</th><th>Status</th><th>Session</th><th>Progress</th><th>Created</th></tr>
          </thead>
          <tbody>
            ${items
              .map((row, i) => {
                const kind = field(row, "kind", "Kind");
                const status = field(row, "status", "Status");
                const err = field(row, "error", "Error");
                const sid = field(row, "session_id", "SessionID");
                const sessionShort = sid ? String(sid).slice(0, 8) + "…" : "—";
                return `
              <tr data-idx="${i}">
                <td>
                  <div class="cell-primary">${esc(kind)}</div>
                  ${err ? `<div class="cell-secondary cell-clamp-2">${esc(err)}</div>` : ""}
                </td>
                <td>${statusBadge(status)}</td>
                <td class="cell-mono">${esc(sessionShort)}</td>
                <td class="cell-meta">${esc(field(row, "progress", "Progress") ?? 0)}%</td>
                <td class="cell-meta">${fmtTimeShort(field(row, "created_at", "CreatedAt"))}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div id="row-detail"></div>`;
  wireGenericRowDetail(p, items, (row) => field(row, "error", "Error"));
}

function renderPipelinePanel(p, items) {
  p.innerHTML = `
    ${pageHeader("Pipeline", "Per-session worker state. Click a row to open the session.")}
    <div class="card data-table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Session</th><th>T1</th><th>T2</th><th>T3</th><th>Warmup</th></tr>
          </thead>
          <tbody>
            ${items
              .map((row, i) => {
                const sessionKey = field(row, "session_key", "SessionKey");
                const label = sessionKey ? sessionKey.slice(0, 8) + "…" : "—";
                return `
              <tr data-idx="${i}" data-key="${esc(sessionKey || "")}">
                <td class="cell-mono">${esc(label)}</td>
                <td>${statusBadge(field(row, "t1_status", "T1Status"))}</td>
                <td>${statusBadge(field(row, "t2_status", "T2Status"))}</td>
                <td>${statusBadge(field(row, "t3_status", "T3Status"))}</td>
                <td class="cell-meta">${esc(field(row, "warmup_threshold", "WarmupThreshold") ?? "—")}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  p.querySelectorAll("tbody tr[data-key]").forEach((tr) => {
    const key = tr.dataset.key;
    if (!key) return;
    tr.addEventListener("click", () => goToSession(key));
  });
}

function wireGenericRowDetail(root, items, textFn) {
  root.querySelectorAll("tbody tr[data-idx]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const idx = Number(tr.dataset.idx);
      const text = textFn(items[idx]);
      root.querySelectorAll("tbody tr.selected").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      const el = root.querySelector("#row-detail");
      if (!text || !el) {
        if (el) el.innerHTML = "";
        return;
      }
      el.innerHTML = `
        <div class="card row-detail">
          <div class="card-content">
            <p class="detail-body">${esc(text)}</p>
          </div>
        </div>`;
    });
  });
}

async function renderPanel() {
  const p = panel();
  const tab = tabs.find((t) => t.id === state.tab);

  if (state.tab === "guide") {
    p.innerHTML = renderGuideHTML();
    wireGuideNav(p);
    return;
  }

  if (state.tab === "overview") {
    if (!state.overview) await loadOverviewCounts();
    const c = state.overview.counts;
    p.innerHTML = `
      ${pageHeader("Overview", "Row counts across the pipeline.")}
      <div class="stats-grid">
        ${Object.entries(c)
          .map(
            ([k, v]) => `
          <div class="stat-card">
            <div class="label">${esc(k.replace(/_/g, " "))}</div>
            <div class="value">${v}</div>
          </div>`
          )
          .join("")}
      </div>
      <p class="empty">
        <button type="button" class="link-btn" data-goto-guide>Read the Guide</button>
        or open <strong>Atoms</strong> to browse extracted facts.
      </p>`;
    p.querySelector("[data-goto-guide]")?.addEventListener("click", () => switchTab("guide"));
    return;
  }

  if (state.tab === "atoms") {
    await renderAtomsPanel(p);
    return;
  }

  if (state.tab === "sessions") {
    const { items } = await api("/sessions");
    p.innerHTML = `
      ${pageHeader("Sessions", "Agent conversations and captured turns.")}
      <div class="card data-table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Session</th><th>Turns</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (s) => `
                <tr data-key="${esc(s.session_key)}" class="${state.selectedKey === s.session_key ? "selected" : ""}">
                  <td>
                    <div class="cell-primary">${esc(s.title || "Untitled session")}</div>
                    <div class="cell-secondary cell-mono">${esc(s.session_key.slice(0, 8))}…</div>
                  </td>
                  <td class="cell-meta">${s.turn_count}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td class="cell-meta">${fmtTimeShort(s.updated_at)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div id="session-detail"></div>`;
    p.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => openSession(tr.dataset.key));
    });
    if (state.selectedKey) await openSession(state.selectedKey, false);
    return;
  }

  if (!tab?.path) return;

  const { items } = await api(tab.path);

  if (state.tab === "memories") {
    renderMemoriesPanel(p, items);
    return;
  }
  if (state.tab === "scenes") {
    renderScenesPanel(p, items);
    return;
  }
  if (state.tab === "tasks") {
    renderTasksPanel(p, items);
    return;
  }
  if (state.tab === "pipeline") {
    renderPipelinePanel(p, items);
    return;
  }
}

async function openSession(sessionKey, scrollPanel = true) {
  state.selectedKey = sessionKey;
  showStatus("");
  const data = await api("/sessions/" + encodeURIComponent(sessionKey));
  const s = data.session;
  const p = panel();

  p.querySelectorAll("tbody tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.key === sessionKey);
  });

  const sessionDetail = p.querySelector("#session-detail");
  if (!sessionDetail) return;

  const ps = data.pipeline_state;
  const pipelineHTML = ps
    ? `<div class="pipeline-grid">
        <div><span>T1</span>${statusBadge(ps.t1_status)}</div>
        <div><span>T2</span>${statusBadge(ps.t2_status)}</div>
        <div><span>T3</span>${statusBadge(ps.t3_status)}</div>
      </div>
      <p class="cell-meta" style="margin-top:0.5rem">warmup_threshold: ${esc(ps.warmup_threshold)}</p>`
    : '<p class="empty">No pipeline state</p>';

  const atomsTable =
    data.atoms.length > 0
      ? `<div class="table-wrap" style="margin-top:0.75rem">
          <table class="data-table">
            <thead><tr><th>Fact</th><th>Category</th><th>Topic</th></tr></thead>
            <tbody>${data.atoms
              .map((a) => {
                const topic = [field(a, "scene_name", "SceneName"), field(a, "slug", "Slug")]
                  .filter(Boolean)
                  .join(" · ");
                return `<tr>
                  <td><div class="cell-primary cell-clamp-2">${esc(field(a, "content", "Content"))}</div></td>
                  <td>${categoryBadge(field(a, "category", "Category"))}</td>
                  <td class="cell-secondary">${esc(topic || "—")}</td>
                </tr>`;
              })
              .join("")}</tbody>
          </table>
        </div>`
      : '<p class="empty">No atoms yet</p>';

  const scenesTable =
    data.scenes.length > 0
      ? `<div class="table-wrap" style="margin-top:0.75rem">
          <table class="data-table">
            <thead><tr><th>Scene</th><th>Summary</th></tr></thead>
            <tbody>${data.scenes
              .map((sc) => {
                const name = field(sc, "display_name", "DisplayName") || "Scene";
                const abstract = field(sc, "abstract", "Abstract");
                const body = field(sc, "body", "Body");
                return `<tr>
                  <td>
                    <div class="cell-primary">${esc(name)}</div>
                    <div class="cell-secondary cell-mono">${esc(truncate(field(sc, "uri", "URI"), 48))}</div>
                  </td>
                  <td><div class="cell-primary cell-clamp-2">${esc(abstract || truncate(body, 160) || "—")}</div></td>
                </tr>`;
              })
              .join("")}</tbody>
          </table>
        </div>`
      : '<p class="empty">No scenes yet</p>';

  sessionDetail.innerHTML = `
    <div class="card row-detail" style="margin-top:1rem">
      <div class="card-header">
        <h3 class="card-title">${esc(s.title || s.session_key)}</h3>
        <p class="card-description cell-mono">${esc(s.uri)}</p>
      </div>
      <div class="card-content">
        <h3 style="font-size:0.875rem;font-weight:600;margin:0 0 0.5rem">Pipeline</h3>
        ${pipelineHTML}
        <h3 style="font-size:0.875rem;font-weight:600;margin:1.25rem 0 0.5rem">Turns (${data.turns.length})</h3>
        ${data.turns
          .map(
            (t) => `
          <details class="turn">
            <summary>#${t.turn_index} · ${esc(t.turn_status)} · ${fmtTime(t.created_at)}</summary>
            <div class="messages">${renderMessages(t.messages_jsonl)}</div>
          </details>`
          )
          .join("")}
        <h3 style="font-size:0.875rem;font-weight:600;margin:1.25rem 0 0.5rem">Atoms (${data.atoms.length})</h3>
        ${atomsTable}
        <h3 style="font-size:0.875rem;font-weight:600;margin:1.25rem 0 0.5rem">Scenes (${data.scenes.length})</h3>
        ${scenesTable}
      </div>
    </div>`;

  if (scrollPanel) {
    sessionDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function refresh() {
  showStatus("");
  try {
    await loadOverviewCounts();
    await renderPanel();
  } catch (err) {
    showStatus(err.message);
  }
}

$("#refresh-btn").addEventListener("click", refresh);

if (!sessionStorage.getItem("mypast-ui-seen")) {
  state.tab = "guide";
  sessionStorage.setItem("mypast-ui-seen", "1");
}

refresh();
