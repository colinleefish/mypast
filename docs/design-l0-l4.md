# mypast — L0 → L3 Knowledge Distillation Design

> Status: draft. Synthesizes lessons from TencentDB Agent Memory (TDAI) and OpenViking against mypast's tool-agnostic, hook-driven capture model.
>
> See also: [`design-l0-l4.zh.md`](./design-l0-l4.zh.md) for the Mandarin version.
>
> History: an earlier revision proposed five tiers T0 → T4 with a separate `identity` artifact. After collapsing the 3-vs-8 category split into one unified 4-category taxonomy and parking the scope concept, T4 had no responsibilities that T3 `profile` did not already cover, so the pyramid was reduced to T0 → T3. The doc name is kept for continuity.

## 1. Goals

1. Turn raw agent conversations into progressively distilled, retrievable knowledge — from a single Q/A turn up to a self-describing profile of the user.
2. Stay **tool-agnostic at capture** — anything that can fire a hook and POST JSON is a supported agent. No SDK lives inside the agent.
3. Stay **inspectable** — every artifact is addressable by URI and dumpable via CLI; nothing hides in opaque format.
4. Stay **simple operationally** — single Go binary, single Postgres, no filesystem trees to babysit.

## 2. Non-goals (for this design)

- In-task short-term memory / Mermaid-style symbolic compression (TDAI has it; it's a different problem).
- Scope-keyed multi-context (work / personal / project-X). Single namespace for now; revisit when a real need shows up.
- A separate T4 "identity" tier. After taxonomy + scope simplifications, T3 `profile` already serves as the singleton self-description; an extra tier on top would carry no distinct responsibility.
- Production multi-tenant isolation with separate accounts/keys (OpenViking has it; out of scope until needed).
- At-rest encryption.
- Audit-log / rollback infrastructure (`memory_diff.json`). Not yet justified; can be added later as an append-only table.
- Filesystem-backed artifacts (`~/.mypast/`). DB columns are the source of truth.
- Anything that requires editing an agent's runtime.

## 3. Background: what we're taking from each

| Idea | Source | Why we take it |
|---|---|---|
| Four-tier pyramid T0 → T3 | TDAI's L0–L3 layering | Layering matches how we want to recall: top-level first, drill down on demand. |
| Atom records with `category / priority / scene_name / source_turn_ids` | TDAI L1 (renamed) | Structured atoms are retrievable. A prose blob is not. |
| In-call scene segmentation | TDAI | One LLM call does extract + segment. Cheap. |
| Per-node abstract / detail facets | OpenViking (trimmed) | Cheap vector recall via the small abstract; full body used for rerank and display. Overview facet considered and dropped — see §4.2. |
| URI scheme as the universal addressing layer | OpenViking | One namespace for sessions, atoms, scenes, memories. |
| 4-category unified taxonomy at T1 and T3 — `profile / preferences / entities / events` | Trimmed from OpenViking's 8-category model (user-side) | Self-documenting names; same names at extraction and distillation, no routing translation. |
| Two-phase commit (`task_id` + async extraction) | OpenViking | Hook returns fast; extraction observable via polling. |
| Hierarchical retrieval with score propagation | OpenViking | When search lands, don't go flat top-K. |
| Per-session idle-debounce + threshold + warmup ramp | TDAI | Hooks fire often; don't pay an LLM call per turn. |
| **Tool-agnostic hook capture** | mypast | Already differentiating. Keep. |
| **Single Go binary, Postgres-native** | mypast | Operationally simple. Keep. |

## 4. Two-axis model

Distillation lives on two orthogonal axes.

### 4.1 Vertical axis — **Tiers** (T0 → T3)

| Tier | What | Source | Cardinality |
|---|---|---|---|
| **T0 — Turn** | One raw user + assistant pair | Hook capture | Many per session |
| **T1 — Atom** | Typed structured fact (`category`, `priority`, `scene_name`, `source_turn_ids`) extracted from T0 | LLM extraction (TDAI-style, 4-category) | 0–N per session |
| **T2 — Scene** | Group of atoms forming a coherent "what we were doing" segment, rendered as Markdown | LLM aggregation of T1 within a session | Few per session |
| **T3 — Memory** | Long-term, cross-session distillation, in 4 categories | LLM rollup of T2 across sessions | Bounded (singleton `profile`; many per other category) |

**Sessions are also a facet-bearing node.** The `sessions` row itself (parent of T0 turns) carries an `abstract` column for searchability. It is not a separate tier — it is the *aggregate view of one conversation*, addressable as `mypast://sessions/<sid>`. Populated as a small post-step after T2 finishes a session's scenes. A session's "body" is its turns (queried via `mypast tree mypast://sessions/<sid>`), so no separate body column.

### 4.2 Horizontal axis — **Facets** (per row)

Each aggregate row (T2 scenes, T3 memories) carries two columns serving different retrieval budgets:

| Facet | Column | Budget | Purpose |
|---|---|---|---|
| **abstract** | `abstract text` | ~100 tokens | Vector recall, one-line filter |
| **detail** | `body text` (Markdown) | unbounded | Full content, used for rerank and display |

Sessions carry only `abstract` (their detail is the chronological `session_turns`). T0 turns and T1 atoms do not need facets — they're already short. `session_turns.messages_jsonl` and `atoms.content` are their own content.

We considered a third middle facet (an `~1 k token` overview) modelled on OpenViking. Dropped: OpenViking's overview earns its keep as a navigation guide between directory nodes, but mypast has no such tree — drill-down between layers is via foreign-key arrays (`source_*_uris`), not free text. Rerank can chew on the full body at mypast's expected scale. Two views per row instead of three keeps drift risk and generation cost down. We can revisit if rerank cost becomes a real bottleneck.

`abstract` is the column we embed (pgvector); `body` is FTS-indexed (`tsvector`).

## 5. URI scheme

The single addressing layer for everything.

```
mypast://{scope}/{path}
```

### 5.1 Public scopes and addressing styles

| Scope | Tier | Addressing | Example URIs |
|---|---|---|---|
| `sessions` | session / T0 / T1 | session UUID (from agent); turns ordinal; atoms UUID | `mypast://sessions/<sid>` (session abstract)<br>`mypast://sessions/<sid>/turns/<n>` (T0)<br>`mypast://sessions/<sid>/atoms/<uuid>` (T1) |
| `scenes` | T2 | UUID; optional `display_name` for readable rendering in `mypast cat` | `mypast://scenes/<scene-uuid>` |
| `profile` | T3 | singleton; no path | `mypast://profile` |
| `preferences` | T3 | **semantic slug** (topic name); UUID fallback if no slug | `mypast://preferences/coffee`<br>`mypast://preferences/ai-tone` |
| `entities` | T3 | **semantic slug** (entity name); UUID fallback | `mypast://entities/tesla`<br>`mypast://entities/colin-mom` |
| `events` | T3 | **date-prefixed slug**; UUID fallback | `mypast://events/2026-05-17-postgres-only-decision` |

Six public top-level scopes. No scope-keying, no T4 namespace.

Internal scopes (e.g. `tasks`, `_backfill`) are reserved for the server and not addressable from the CLI by default. URI helpers expose an `allow_internal=true` flag for the server's own code path.

### 5.2 URI rules

- **Trailing slash = container.** `mypast://sessions/<sid>` is the session entity itself (`mypast cat` prints its `abstract`). `mypast://sessions/<sid>/` is its container (`mypast tree` lists the turns and atoms beneath it). The same convention applies to every scope.
- **Short forms.** CLI commands accept `/sessions/abc/turns/0` and `sessions/abc/turns/0`, both normalized to the canonical `mypast://...` form. Lowers typing friction; programmatic callers always emit the canonical form.
- **Unicode-safe segments.** CJK / Cyrillic / Latin extended / Hiragana / Katakana / Hangul are preserved literally (no percent-encoding); `mypast://entities/李广慧` is a valid URI. Other special characters collapse to `_`. Max 50 chars per segment.
- **Reserved future syntax.** `{namespace:key}` shapes (e.g. `{date:today}`) are reserved and rejected as invalid for now, leaving room to add path-variable templates later without breaking compatibility.
- **Forbidden slug values.** A slug must not equal a scope name (no `mypast://preferences/profile`). Sanitization rejects with an error rather than silently mangling.

### 5.3 Slugs and stable IDs

Semantic vs opaque is decided per tier based on whether the row has an intrinsic stable name:

| Row | Why this style |
|---|---|
| T0 turn (ordinal) | Turns are chronological; numbering IS the name. |
| T1 atom (UUID) | Atoms get merged during dedup. Content mutates; a content-derived slug would lie. |
| T2 scene (UUID + `display_name`) | Scene rows update as atoms accumulate; URI stable via UUID, name surfaced separately for display. |
| T3 `preferences` / `entities` (slug) | Inherently named topics / entities. URI describes the *topic* or *identity*, not the current content — so the slug stays stable as the body evolves. |
| T3 `events` (date + slug) | Events are immutable by category rule; date prefix sorts naturally. |

**Source.** The LLM emits `slug` as part of the T1 extraction prompt for atoms tagged `preferences` / `entities` / `events`. T3 routes it directly into the corresponding `memories` row.

**Stability.** Slugs are stable post-creation. Renames require explicit human action (`mypast mv <old-uri> <new-uri>`) which atomically updates the URI and all `source_*_uris` references. Auto-renaming on content drift is forbidden.

**Collisions.** `memories` carries `UNIQUE (category, slug) WHERE slug IS NOT NULL`. On conflict, the T3 worker appends `-2`, `-3`, …, and logs a warning so we can detect "the LLM keeps generating colliding slugs for genuinely distinct entities."

**Empty fallback.** If the LLM produces an empty or unusable slug, the row falls back to UUID addressing (`mypast://preferences/<uuid>`). Worst case is ugly URI, never breakage.

## 6. Memory taxonomy (T1 and T3 share these)

Four categories, same names at extraction (T1) and storage (T3). T3 routing is mechanical: aggregate atoms by category, upsert memory of the same category.

| Category | Mergeable | What it captures | Example |
|---|---|---|---|
| `profile` | yes (singleton row) | Stable identity attributes — basics, demographics, health/taboos, core traits | "Colin lives in Beijing." "Allergic to peanuts." |
| `preferences` | yes (append + dedup) | Recurring "prefers X / wants X / works this way", **including AI-behavior rules** | "Prefers single-binary Go services." "Always wants short answers." |
| `entities` | yes (append + dedup) | Third parties: people, projects, companies, places | "Lisa from accounting prefers email." "Tesla HQ in Austin, ticker TSLA." |
| `events` | **no** | Dated facts, decisions, milestones — immutable historical record | "2026-05-17: chose Postgres-only storage for mypast (rejected ~/.mypast/ files)." |

**`instruction` rolls into `preferences`.** "Always give short answers" is operationally a preference about AI conduct. If you ever need to separate AI-behavior rules from lifestyle preferences for retrieval (e.g. only load behavior rules into system prompt), add a `subkind text` column on `preferences` with values `lifestyle | ai-behavior` rather than a fifth category.

Priority semantics (inherited from TDAI, applies to all four categories):
- 80–100: critical (health/taboo/core trait, important event/plan, strict rule).
- 50–79: ordinary.
- < 50: weak signal, candidate to drop or downweight.
- `-1`: sentinel meaning "never drop" (use sparingly for absolute behavior rules).

## 7. Storage layout

Everything lives in Postgres. No filesystem tree.

| Table | Tier | Columns of note |
|---|---|---|
| `sessions` | session aggregate | (exists, extended) — session metadata; **adds** `abstract text` and `embedding vector(1024)` populated by a small post-T2 step |
| `session_turns` | T0 | (exists) — `messages_jsonl text` |
| **`atoms`** | T1 | `uri`, `session_id`, `category` (4-value CHECK), `priority int`, `scene_name`, `slug text?` (carried up to T3 for slug-bearing categories), `content text`, `source_turn_ids uuid[]`, `embedding vector(1024)`, timestamps |
| **`scenes`** | T2 | `uri`, `session_id`, `display_name text?` (LLM-generated human label), `abstract text`, `body text`, `source_atom_uris text[]`, `embedding vector(1024)`, timestamps |
| **`memories`** | T3 | `uri`, `category` (4-value CHECK), `slug text?` with `UNIQUE (category, slug) WHERE slug IS NOT NULL`, `abstract text`, `body text`, `source_scene_uris text[]`, `embedding vector(1024)`, timestamps |
| **`pipeline_state`** | — | `session_id`, `t1_status`, `t1_advanced_at`, `t2_status`, `t2_advanced_at`, `t3_status`, `t3_advanced_at`, `warmup_threshold int` |
| **`tasks`** | — | `id`, `kind` (`t1`/`t2`/`t3`/`backfill`), `status`, `progress`, `result_uri`, `error`, `session_id?`, timestamps |

`uri text primary key` everywhere (T1+). `body text` columns are FTS-indexed; `embedding` columns are `vector(1024)`.

Inspection CLI:

- `mypast cat <uri>` — print the row's `body` (or `messages_jsonl` for T0).
- `mypast tree <uri-prefix>` — list child URIs.
- `mypast meta <uri>` — print row metadata.

## 8. Capture flow (two-phase)

### Phase 1 — synchronous

```
POST /api/v1/sessions/:id/upload
  → insert T0 turn row
  → mark pipeline_state.t1_status = 'pending'
  → return 202 { task_id, turn_uri }
```

### Phase 2 — asynchronous (workers)

```
T1 worker (per session)
  trigger: (turn_count_since_last_t1 >= everyN)
        OR (idle for idle_seconds)
        OR (warmup: 2 → 4 → 8 → ... → everyN)
  action: read pending T0 turns
        → one LLM call: scene-segment + extract atoms (TDAI prompt, 4-category)
        → dedup new atoms vs existing (embedding top-K + LLM merge decision)
        → insert/update atoms; set pipeline_state.t2_status='pending'

T2 worker (per session)
  trigger: downward-only timer
           fire = max(now + delay_after_t1, last_t2 + min_interval)
           hard ceiling at last_t2 + max_interval
  action: read changed atoms for session
        → LLM call: generate / update scene rows (abstract + body)
        → upsert scenes
        → post-step: re-derive sessions.{abstract, embedding}
          from the session's scene abstracts (one short LLM call,
          or template-only if scenes are few)
        → set pipeline_state.t3_status='pending'

T3 worker (global mutex)
  trigger: any session has t3_status='pending'
        OR scheduled rollup tick
  action: collect changed scenes
        → LLM call: distill into category-specific memory rows (abstract + body)
        → upsert memories
```

## 9. Triggers and discipline

| Tier | Trigger | Config knob |
|---|---|---|
| T1 | every-N turns + idle timer + warmup ramp | `extraction.every_n=8`, `extraction.idle_seconds=600`, `extraction.warmup=true` |
| T2 | downward-only timer (delay-after-T1, min, max) | `scene.delay_after_t1=90s`, `scene.min_interval=15m`, `scene.max_interval=1h` |
| T3 | session-pending or scheduled rollup | `memory.poll_interval=15m` |

Coordination is via Postgres status columns + advisory locks. No in-memory scheduler state required; restart is safe by construction (mypast already does this for the current summarizer).

## 10. Retrieval (sketch, deferred implementation)

Two operations, mirroring OpenViking:

- **`find <query>`** — single-query vector recall on `abstract` embedding → rerank → return top-K MatchedContext (uri, abstract, score).
- **`search <query>`** — LLM intent analysis → 0–N TypedQueries (memory / scene / turn) → for each, hierarchical descent (vector enters at category level, recurses with score propagation `α·child + (1-α)·parent`, converges when top-K stops moving) → rerank → consolidated result.

Both expose facets: the response carries `abstract` by default; `?facet=detail` widens it to the full body. URI is the only thing needed to drill down further.

## 11. Migration from today's state

Current state:
- `sessions` table exists.
- `session_turns` table exists, holds raw turns.
- `sessions.overview_text` is a rolling prose blob produced by a 15 s ticker.
- No atoms, no scenes, no memory rows.

Migration steps:

1. **Phase A (additive)** — add new Postgres tables (`atoms`, `scenes`, `memories`, `pipeline_state`, `tasks`) and the new columns on `sessions` (`abstract`, `embedding`). Existing tables otherwise untouched. Inspection CLI lands.
2. **Phase B** — add T1 worker; populate `atoms` from new turns. Old turns can be backfilled with `mypast t1 backfill`.
3. **Phase C** — add T2 worker, including the post-T2 step that refreshes `sessions.{abstract, embedding}` from the session's scenes. `scenes` and session facets start populating.
4. **Phase D** — add T3 worker. `memories` starts populating.
5. **Phase E** — deprecate `sessions.overview_text`; the current summarizer worker is retired. Session-level narrative now lives in `sessions.abstract` plus the per-scene `body` rows reachable via `mypast tree mypast://sessions/<sid>`.

Each phase ships independently. Existing capture surface (`POST /sessions/:id/upload`) does not change.

## 12. Open decisions

Pre-commit checklist before implementation:

1. **Embedding model and dimension.** Currently unset. Recommendation: start with the same OpenAI-compatible provider as the summarizer; default to 1024-dim. Confirm.
2. **Warmup ramp values.** TDAI's default (1 → 2 → 4 → … → N=5) is aggressive on cost. Recommendation: ramp `2 → 4 → 8 → N=8`. Confirm.

## 13. References

- TencentDB Agent Memory (`tmp/TencentDB-Agent-Memory/`):
  - `README.md` — layered memory + symbolic memory thesis
  - `src/core/prompts/l1-extraction.ts` — atom prompt
  - `src/utils/pipeline-manager.ts` — three-timer scheduler
  - `src/core/persona/persona-generator.ts` — T3-equivalent generator
- OpenViking (`tmp/OpenViking/`):
  - `docs/en/concepts/01-architecture.md` — system overview
  - `docs/en/concepts/03-context-layers.md` — per-node L0/L1/L2 facets
  - `docs/en/concepts/04-viking-uri.md` — URI scheme
  - `docs/en/concepts/08-session.md` — two-phase commit + 8-category memory
  - `docs/en/concepts/07-retrieval.md` — hierarchical retrieval with score propagation
