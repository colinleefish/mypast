# mypast — implementation plan

> Roadmap for the T0→T3 memory pipeline. Phases are **shipping milestones**, not calendar quarters.
> Each phase should be deployable on its own; the upload API (`POST /api/v1/sessions/:id/upload`) stays stable throughout.
>
> **Design detail:** [`design-l0-l4.md`](./design-l0-l4.md) / [`design-l0-l4.zh.md`](./design-l0-l4.zh.md)  
> **Consolidation policy:** [`memory-consolidation-review.zh.md`](./memory-consolidation-review.zh.md)  
> **Tables & URIs:** [`entity-model.md`](./entity-model.md)

## Pyramid reminder

| Tier   | Table           | What it is                                                                           |
| ------ | --------------- | ------------------------------------------------------------------------------------ |
| **T0** | `session_turns` | Raw user+assistant pair (append-only evidence)                                       |
| **T1** | `atoms`         | Structured facts extracted from turns                                                |
| **T2** | `scenes`        | Session segments built from atoms                                                    |
| **T3** | `memories`      | Long-term knowledge across sessions (`profile`, `preferences`, `entities`, `events`) |

Workers move data **up** the pyramid on a schedule (not every hook). T0 is never rewritten by workers.

---

## Status at a glance

| Milestone                                      | Status          | Notes                                         |
| ---------------------------------------------- | --------------- | --------------------------------------------- |
| **Ops** — `make ci` / `make deploy`            | ✅ Done         | Agent-driven; see [`deploy.md`](./deploy.md)  |
| **Phase A** — schema + observe                 | ✅ Done         | Migrations `00001`–`00002`, CLI, `/ui/`       |
| **Design lock** — append-first, versioning     | ✅ Done         | §6.1 in design doc; review doc updated        |
| **Phase B+** — `memories` versioning migration | ✅ Done (early) | `00003` applied on prod before T3 code exists |
| **Phase B** — T1 worker                        | ✅ Done         | `MYPAST_EXTRACTION_*`; `mypast t1 backfill`   |
| **Phase C** — T2 worker                        | ✅ Done         | `MYPAST_SCENE_*`; `mypast t2 backfill`        |
| **Phase D** — T3 worker                        | ✅ Done         | `MYPAST_MEMORY_*`; `mypast t3 backfill`       |
| **Phase D** — `mypast eval`                    | 🔲 Planned      | Drift detection after rollup                  |
| **Phase E** — retire legacy summarizer         | 🔲 Planned      | Drop `overview_text` path                     |
| **Retrieval** — `find` / `search`              | 🔲 Later        | Design §10                                    |
| **MCP wrapper**                                | 🔲 Later        | After CLI/recall stable                       |

Production: <https://mem.colinleefish.com>

---

## Phase A — schema & observation ✅

**Goal:** Add the new tables and tooling **without** changing how hooks upload turns.

**Delivered**

- Postgres: `atoms`, `scenes`, `memories`, `pipeline_state`, `tasks`; `sessions.abstract`, `sessions.embedding`
- Goose migrations `00001_baseline.sql`, `00002_phase_a.sql`
- CLI: `mypast cat`, `mypast tree`, `mypast meta`
- Web UI: `/ui/` browse all tables
- Hooks + `POST …/upload` unchanged

**Verify**

- `make ci`
- `/ui/` shows empty atoms/scenes/memories until workers run
- `mypast tree mypast://sessions/<id>` lists turns

---

## Phase B — T1 atom extraction ✅

**Goal:** Turn raw turns into searchable **atoms** inside each session, using the **append-first** policy (no default LLM merge).

**Build**

1. **Upload → pipeline** — on each upload, upsert `pipeline_state` and set `t1_status = 'pending'`.
2. **T1 worker** (background goroutine, like today’s summarizer):
   - Triggers: every-N turns, idle timeout, warmup ramp (`2→4→8→8` suggested).
   - One LLM call per batch: scene segmentation + 4-category atom extract.
   - **Default:** `INSERT` new `atoms` rows.
   - Near-duplicates: tag / downweight only (e.g. `near_duplicate_uri` metadata)—**no** worker merge.
   - `events` category: always insert; never dedup-merge.
   - Optional later: `mypast atom merge <a> <b>` for explicit human/agent merge.
3. **Config** — `extraction.every_n`, `extraction.idle_seconds`, `extraction.warmup`, LLM + embedding client (1024-dim).
4. **Tasks API** (minimal) — upload returns `202 { task_id, turn_uri }` when ready; poll task status (design §8).
5. **CLI** — `mypast t1 backfill [--session=…]` for historical turns.
6. **Production hygiene** — set `MYPAST_SUMMARIZER_ENABLED=false` so legacy `overview_text` does not compete with the new pipeline.

**Do not**

- In-place merge atoms in the worker (see [`memory-consolidation-review.zh.md`](./memory-consolidation-review.zh.md)).

**Verify**

- Hook a real Cursor/CC session → `/ui/` shows new `atoms` with `source_turn_ids`.
- `mypast cat mypast://sessions/<sid>/atoms/<uuid>`
- `pipeline_state.t1_status` advances; `t2_status` becomes `pending` after T1.

**Suggested slice for first PR**

> Upload sets `t1_status=pending` + minimal T1 worker (fixed batch, no warmup/dedup) → iterate triggers and dedup policy.

---

## Phase B+ — `memories` versioning ✅ (done early)

**Goal:** Schema supports **versioned** T3 rows before any T3 worker writes data.

**Delivered**

- Migration `00003_memories_versioning.sql` — `id` PK, `version`, `superseded_at`; active-row unique indexes on `uri` and `(category, slug)`.
- Already applied on production (2026-05).

**Rule for Phase D**

- T3 worker only `INSERT`s new rows and sets `superseded_at` on the previous active row—never `UPDATE body`.

---

## Phase C — T2 scenes & session abstract

**Goal:** Group atoms into **scenes** and refresh per-session `sessions.abstract` (+ embedding).

**Build**

1. **T2 worker** — downward-only timer after T1 (`delay_after_t1`, `min_interval`, `max_interval`).
2. LLM: build/update scene `abstract` + `body` from changed atoms.
3. Prefer **append scene version** (or throttle in-place updates if eval is clean).
4. Post-step: derive `sessions.abstract` and `sessions.embedding` from active scene abstracts.
5. Set `pipeline_state.t3_status = 'pending'`.

**Verify**

- `/ui/` shows `scenes` linked via `source_atom_uris`.
- `mypast cat mypast://scenes/<uuid>`
- `mypast cat mypast://sessions/<sid>` prints session `abstract`.

---

## Phase D — T3 long-term memory + eval

**Goal:** Roll scenes into cross-session **`memories`** and detect consolidation drift.

**Build**

1. **T3 worker** — global mutex; trigger on `t3_status=pending` or periodic rollup.
2. Route by category → logical URI (`mypast://profile`, `mypast://preferences/<slug>`, …).
3. **INSERT** new `memories` row + supersede previous active row (§7.1).
4. `events`: insert-only at T3 as well.
5. **`mypast eval`** — implement design §12.3; default queries in [`scripts/eval_queries.txt`](../scripts/eval_queries.txt):
   - Baseline: T0 + FTS only
   - Full stack: T0–T3 vectors + FTS
   - Non-zero exit if full stack regresses vs baseline after rollup
6. CLI: `mypast cat <uri> --version=N` / `--all-versions` for audit (optional in same phase).

**Verify**

- `mypast://profile` and slug URIs populate in `/ui/`.
- `mypast eval` runs clean on prod after a rollup.
- Provenance chain: memory → scenes → atoms → turns.

---

## Phase E — retire legacy summarizer

**Goal:** One session narrative path—no competing `overview_text` blob.

**Build**

1. Stop `summarize.Worker` in all environments.
2. Remove or ignore `sessions.overview_text` in UI/API (optional column drop migration later).
3. Update README / `.cursor/rules` to point at `sessions.abstract` + scenes.
4. Recall and docs assume T2/T3 only.

**Verify**

- No writes to `overview_text`; new sessions rely on `abstract` + scenes.
- `/ui/` and browse API do not surface stale overview as primary summary.

---

## After the pyramid (not phased yet)

| Item                                | Purpose                                           | Depends on                   |
| ----------------------------------- | ------------------------------------------------- | ---------------------------- |
| **Embed worker**                    | Fill `embedding IS NULL` on atoms/scenes/memories | Phase B–D producing rows     |
| **`mypast find` / `mypast search`** | Hybrid recall (vector + FTS, score propagation)   | Design §10; stable T3 data   |
| **`mypast eval` in deploy**         | Auto-run after T3 rollup; alert on regression     | Phase D                      |
| **MCP wrapper**                     | Expose recall to agents                           | Stable find/search           |
| **OpenViking URI migration**        | One-off import script                             | Optional; see root `TODO.md` |

---

## Ops workflow (every phase)

```bash
make ci
ssproxy && git push origin main    # from China
make deploy
curl -fsS https://mem.colinleefish.com/healthz
```

Proxy notes: [`deploy.md`](./deploy.md) and README § CI / Deploy.

---

## Open decisions (before / during Phase B)

| Topic                 | Recommendation                                                                        | Confirm? |
| --------------------- | ------------------------------------------------------------------------------------- | -------- |
| Embedding model + dim | Same provider as extraction; **1024**                                                 |          |
| Warmup ramp           | `2 → 4 → 8 → N=8`                                                                     |          |
| Eval queries          | Extend [`scripts/eval_queries.txt`](../scripts/eval_queries.txt) with your real facts |          |

Locked policy (do not re-litigate without updating design §6.1): T0 append-only; T1 append-by-default; T3 versioned rows; sparse explicit merge only.

---

## Document map

| Doc                                                                        | Use when                                   |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| **This file**                                                              | “What phase are we in? What’s next?”       |
| [`design-l0-l4.md`](./design-l0-l4.md)                                     | Full architecture, URIs, worker pseudocode |
| [`memory-consolidation-review.zh.md`](./memory-consolidation-review.zh.md) | Why append-first / versioning              |
| [`entity-model.md`](./entity-model.md)                                     | Table relationships                        |
| [`deploy.md`](./deploy.md)                                                 | Ship to production                         |
