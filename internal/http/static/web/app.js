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
};

const $ = (sel) => document.querySelector(sel);
const panel = () => $("#panel");
const detail = () => $("#detail");
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
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function parseJSONL(raw) {
  if (!raw) return [];
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
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
  $("#nav").innerHTML = tabs
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
    .join("");

  $("#nav").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

async function switchTab(id) {
  state.tab = id;
  state.selectedKey = null;
  detail().innerHTML = '<p class="detail-placeholder">Select a row to inspect</p>';
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
    <h2>Data model</h2>
    <p class="guide-lead">
      Raw chats are captured into <strong>sessions</strong>, then distilled upward through
      <strong>turns → atoms → scenes → memories</strong>. Workers are tracked in
      <strong>pipeline_state</strong> and <strong>tasks</strong>.
    </p>

    <div class="guide-flow" aria-label="Distillation pyramid">
      <div class="guide-step guide-op">
        <span class="guide-tier">ops</span>
        <strong>pipeline_state</strong>
        <span class="guide-sub">per session · t1 / t2 / t3 status</span>
      </div>
      <div class="guide-arrow">↕ workers</div>
      <div class="guide-step guide-t3">
        <span class="guide-tier">T3</span>
        <strong>memories</strong>
        <span class="guide-sub">cross-session · profile · preferences · entities · events</span>
      </div>
      <div class="guide-arrow">rollup · many sessions</div>
      <div class="guide-step guide-t2">
        <span class="guide-tier">T2</span>
        <strong>scenes</strong>
        <span class="guide-sub">“what we were doing” in one chat</span>
      </div>
      <div class="guide-arrow">aggregate · one session</div>
      <div class="guide-step guide-t1">
        <span class="guide-tier">T1</span>
        <strong>atoms</strong>
        <span class="guide-sub">typed facts extracted from turns</span>
      </div>
      <div class="guide-arrow">extract · one session</div>
      <div class="guide-step guide-t0">
        <span class="guide-tier">T0</span>
        <strong>session_turns</strong>
        <span class="guide-sub">one user + assistant pair per row</span>
      </div>
      <div class="guide-arrow">hook upload</div>
      <div class="guide-step guide-session">
        <span class="guide-tier">session</span>
        <strong>sessions</strong>
        <span class="guide-sub">one agent conversation · <code>session_key</code> = agent UUID</span>
      </div>
    </div>

    <div class="section">
      <h3>Entity relationships</h3>
      <div class="table-wrap">
        <table class="guide-table">
          <thead>
            <tr>
              <th>Entity</th><th>Table</th><th>Belongs to</th><th>Points at</th><th>Browse</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Session</strong></td>
              <td><code>sessions</code></td>
              <td>—</td>
              <td>many turns; optional <code>abstract</code></td>
              <td><button type="button" class="link-btn" data-goto="sessions">Sessions</button></td>
            </tr>
            <tr>
              <td><strong>Turn</strong> (T0)</td>
              <td><code>session_turns</code></td>
              <td>one <code>session_id</code></td>
              <td><code>messages_jsonl</code> (raw u/a)</td>
              <td><button type="button" class="link-btn" data-goto="sessions">open session</button></td>
            </tr>
            <tr>
              <td><strong>Atom</strong> (T1)</td>
              <td><code>atoms</code></td>
              <td>one <code>session_id</code></td>
              <td><code>source_turn_ids[]</code></td>
              <td><button type="button" class="link-btn" data-goto="atoms">Atoms</button></td>
            </tr>
            <tr>
              <td><strong>Scene</strong> (T2)</td>
              <td><code>scenes</code></td>
              <td>one <code>session_id</code></td>
              <td><code>source_atom_uris[]</code></td>
              <td><button type="button" class="link-btn" data-goto="scenes">Scenes</button></td>
            </tr>
            <tr>
              <td><strong>Memory</strong> (T3)</td>
              <td><code>memories</code></td>
              <td>global (by <code>category</code>)</td>
              <td><code>source_scene_uris[]</code></td>
              <td><button type="button" class="link-btn" data-goto="memories">Memories</button></td>
            </tr>
            <tr>
              <td><strong>Pipeline</strong></td>
              <td><code>pipeline_state</code></td>
              <td>one row per session</td>
              <td>t1/t2/t3 worker flags</td>
              <td><button type="button" class="link-btn" data-goto="pipeline">Pipeline</button></td>
            </tr>
            <tr>
              <td><strong>Task</strong></td>
              <td><code>tasks</code></td>
              <td>optional <code>session_id</code></td>
              <td>async job (t1/t2/t3/backfill)</td>
              <td><button type="button" class="link-btn" data-goto="tasks">Tasks</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h3>Memory categories (T1 atoms → T3 memories)</h3>
      <ul class="guide-list">
        <li><code>profile</code> — singleton “who I am”</li>
        <li><code>preferences</code> — habits, style, AI behavior rules</li>
        <li><code>entities</code> — people, companies, projects, places</li>
        <li><code>events</code> — dated decisions / milestones (append-only)</li>
      </ul>
    </div>

    <div class="section">
      <h3>What works today</h3>
      <ul class="guide-list">
        <li>Capture: hooks → <code>session_turns</code> (T0)</li>
        <li>Distillation workers (T1–T3): schema ready, workers not shipped yet</li>
        <li>URI examples:
          <code>mypast://sessions/&lt;uuid&gt;/turns/0</code>,
          <code>mypast://preferences/coffee</code>
        </li>
      </ul>
    </div>`;
}

function renderGuideSidebar() {
  return `
    <h2 style="margin-top:0;font-size:0.95rem">Quick map</h2>
    <p class="guide-side">
      <strong>Inside one chat:</strong><br />
      session → turns → atoms → scenes<br /><br />
      <strong>Across chats:</strong><br />
      scenes → memories<br /><br />
      <strong>Orchestration:</strong><br />
      pipeline_state schedules work;<br />
      tasks record each run.
    </p>
    <p class="uri" style="margin-top:1rem">Full design: docs/design-l0-l4.md</p>`;
}

function wireGuideNav(root) {
  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
}

async function renderPanel() {
  const p = panel();
  const tab = tabs.find((t) => t.id === state.tab);

  if (state.tab === "guide") {
    p.innerHTML = renderGuideHTML();
    detail().innerHTML = renderGuideSidebar();
    wireGuideNav(p);
    return;
  }

  if (state.tab === "overview") {
    if (!state.overview) await loadOverviewCounts();
    const c = state.overview.counts;
    p.innerHTML = `
      <h2>Overview</h2>
      <div class="cards">
        ${Object.entries(c)
          .map(
            ([k, v]) => `
          <div class="card"><div class="label">${esc(k)}</div><div class="value">${v}</div></div>`
          )
          .join("")}
      </div>
      <p class="empty">
        <button type="button" class="link-btn" data-goto-guide>Read the Guide</button>
        for how sessions, turns, atoms, scenes, and memories relate — or use the sidebar to browse tables.
      </p>`;
    p.querySelector("[data-goto-guide]")?.addEventListener("click", () => switchTab("guide"));
    return;
  }

  if (state.tab === "sessions") {
    const { items } = await api("/sessions");
    p.innerHTML = `
      <h2>Sessions (${items.length})</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Key</th><th>Title</th><th>Turns</th><th>Status</th><th>Updated</th>
          </tr></thead>
          <tbody>
            ${items
              .map(
                (s) => `
              <tr data-key="${esc(s.session_key)}" class="${state.selectedKey === s.session_key ? "selected" : ""}">
                <td class="uri">${esc(s.session_key.slice(0, 8))}…</td>
                <td>${esc(s.title || "—")}</td>
                <td>${s.turn_count}</td>
                <td>${esc(s.status)}</td>
                <td>${fmtTime(s.updated_at)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
    p.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => openSession(tr.dataset.key));
    });
    if (state.selectedKey) await openSession(state.selectedKey, false);
    return;
  }

  if (!tab.path) {
    return;
  }

  const { items } = await api(tab.path);
  const cols = items.length ? Object.keys(items[0]) : [];
  const skip = new Set(["messages_jsonl", "body", "content", "source_turn_ids", "source_atom_uris", "source_scene_uris"]);

  p.innerHTML = `
    <h2>${esc(tab.label)} (${items.length})</h2>
    <div class="table-wrap">
      <table>
        <thead><tr>${cols
          .filter((c) => !skip.has(c))
          .map((c) => `<th>${esc(c)}</th>`)
          .join("")}</tr></thead>
        <tbody>
          ${items
            .map(
              (row, i) => `
            <tr data-idx="${i}">
              ${cols
                .filter((c) => !skip.has(c))
                .map((c) => {
                  let v = row[c];
                  if (v && typeof v === "object") v = JSON.stringify(v);
                  if (c === "uri") return `<td class="uri">${esc(v)}</td>`;
                  return `<td>${esc(v ?? "—")}</td>`;
                })
                .join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  p.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      p.querySelectorAll("tr.selected").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      detail().innerHTML = `<pre class="json">${esc(JSON.stringify(items[Number(tr.dataset.idx)], null, 2))}</pre>`;
    });
  });
}

async function openSession(sessionKey, scrollPanel = true) {
  state.selectedKey = sessionKey;
  showStatus("");
  const data = await api("/sessions/" + encodeURIComponent(sessionKey));
  const s = data.session;

  panel().querySelectorAll("tbody tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.key === sessionKey);
  });

  const ps = data.pipeline_state;
  const pipelineHTML = ps
    ? `<div class="pipeline-grid">
        <div><span>T1</span>${esc(ps.t1_status)}</div>
        <div><span>T2</span>${esc(ps.t2_status)}</div>
        <div><span>T3</span>${esc(ps.t3_status)}</div>
      </div>
      <p style="font-family:var(--mono);font-size:0.72rem;color:var(--muted)">warmup_threshold: ${ps.warmup_threshold}</p>`
    : '<p class="empty">No pipeline_state row</p>';

  detail().innerHTML = `
    <h2 style="margin-top:0;font-size:0.95rem">${esc(s.title || s.session_key)}</h2>
    <p class="uri">${esc(s.uri)}</p>
    <div class="section">
      <h3>Session</h3>
      <pre class="json">${esc(JSON.stringify(s, null, 2))}</pre>
    </div>
    <div class="section">
      <h3>Pipeline state</h3>
      ${pipelineHTML}
      ${ps ? `<pre class="json">${esc(JSON.stringify(ps, null, 2))}</pre>` : ""}
    </div>
    <div class="section">
      <h3>Turns (${data.turns.length})</h3>
      ${data.turns
        .map(
          (t) => `
        <details class="turn">
          <summary>#${t.turn_index} · ${esc(t.turn_status)} · ${fmtTime(t.created_at)}</summary>
          <div class="messages">${renderMessages(t.messages_jsonl)}</div>
        </details>`
        )
        .join("")}
    </div>
    <div class="section">
      <h3>Session atoms (${data.atoms.length})</h3>
      ${
        data.atoms.length
          ? `<pre class="json">${esc(JSON.stringify(data.atoms, null, 2))}</pre>`
          : '<p class="empty">None yet</p>'
      }
    </div>`;

  if (scrollPanel) {
    detail().scrollIntoView({ behavior: "smooth", block: "nearest" });
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

// Default to Guide on first visit
if (!sessionStorage.getItem("mypast-ui-seen")) {
  state.tab = "guide";
  sessionStorage.setItem("mypast-ui-seen", "1");
}

refresh();
