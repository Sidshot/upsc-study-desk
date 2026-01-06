# UPSC Local LMS (Personal Study Desk)

## PURPOSE
A **calm, offline-first, Windows-only personal study workstation** for UPSC CSE 2026.

Primary goals:
- Structure study material (GS/CSAT/Optional → Provider → Course → Lecture)
- Track **manual completion** (trusted truth)
- Persistent **contextual notes** (durable, future-proof)

Explicitly NOT a productivity app, not an LMS clone, not AI-driven pedagogy.

---

## NON‑NEGOTIABLE DESIGN CONTRACT (READ FIRST)

- Offline-first, no cloud dependency
- Windows-only
- SPA-style (single-page, no reloads)
- Two modes only:
  - **Browse Mode** (planning)
  - **Study Mode** (isolated, focused)
- Two-panel study view:
  - Main content (video/PDF)
  - Notes (toggle drawer)
- Manual completion ONLY (never auto-complete)
- User-controlled lecture ordering (drag & drop)
- Enforced structure BEFORE ingestion
- Notes stored in DB **and mirrored as Markdown**
- App is disposable; **data must survive**

Anything violating this contract is a bug, not a feature.

---

## CORE CONCEPTUAL MODEL

Hierarchy (strict):

Paper (GS1 / GS2 / GS3 / GS4 / CSAT / Optional / Extra)
→ Provider (Vision / Forum / Self / etc.)
→ Course / Module (Polity / History / Batch / Temp)
→ Lecture (Video / PDF)

Progress is **lecture-level**, not folder-level.

---

## UX BEHAVIOUR (LOCKED)

### Navigation
- Left sidebar = Papers
- Progressive disclosure (Paper → Provider → Course → Lectures)
- Study Mode hides lists completely

### Lecture Interaction
- Inline rename, description, tags (auto-save)
- Completion is manual and reversible
- On marking complete → **light prompt**:
  - Go to next lecture
  - Return to lecture list
  - Stay here

### Session Restart
- App always opens in **Browse Mode**
- Last lecture is highlighted (never auto-resume)

---

## DATA SAFETY & LONGEVITY

### Data Priority
1. Notes, completion state, ordering (irreplaceable)
2. Structure & metadata
3. Media files (replaceable)

### Storage Rule
All important data lives in ONE portable folder:

/study_data/
- study.db (SQLite – primary runtime truth)
- notes/ (Markdown mirror)
- config.json

### Backup Philosophy
- Weekly manual copy of /study_data/
- Monthly zipped backup to cloud
- In-app export:
  - All notes → Markdown
  - Progress → CSV/JSON

No auto-cloud. No background sync.

---

# PHASE‑WISE IDE IMPLEMENTATION PLAN

## PHASE 0 — Skeleton (NO FILE SYSTEM)
Goal: Empty but fully navigable app

- Sidebar with Papers (GS1, GS2, GS3, GS4, CSAT, Optional, Extra)
- Browse Mode UI only
- Ability to add:
  - Provider (single text input)
  - Course (single text input)
- No media, no DB yet (mock data allowed)

Deliverable: App that feels real but contains nothing

---

## PHASE 1 — Database & Invariants
Goal: Lock data model before features

- SQLite database
- Tables (conceptual):
  - papers
  - providers
  - courses
  - lectures
  - notes
- Lecture fields include:
  - order_index
  - completion_flag (manual)
  - last_position (video/PDF)

Rule: App must not function if DB invariants are violated

---

## PHASE 2 — Enforced Ingestion (NO SMARTNESS)
Goal: Controlled entry of chaos

- Add content flow requires:
  1. Paper
  2. Provider
  3. Course
- Drag & drop files/folders
- Deterministic classification:
  - .mp4/.mkv → video
  - .pdf → PDF
- Filename becomes default title (editable later)
- Files are **referenced**, not moved

No AI inference. No syllabus guessing.

---

## PHASE 3 — Browse Mode (Real Data)
Goal: Planning clarity

- Course cards with progress bars
- Lecture lists with:
  - status icon
  - drag handle for ordering
- Inline editing for:
  - title
  - description
  - tags

Auto-save everything silently.

---

## PHASE 4 — Study Mode (Isolation)
Goal: Deep work surface

- Enter Study Mode on lecture open
- Hide lecture list completely
- Main panel:
  - Video player (resume by timestamp)
  - OR PDF viewer (resume by page)
- Notes drawer (toggle)

No distractions. No background media.

---

## PHASE 5 — Completion Logic
Goal: Trusted progress

- Manual completion toggle
- On completion → non-blocking action prompt
- Completion independent of progress %
- Allow unmarking anytime

---

## PHASE 6 — Notes Durability
Goal: Zero lock-in

- Notes stored in DB
- Notes mirrored as Markdown:
  /notes/Paper/Provider/Course/Lecture.md
- One-way sync: DB → Markdown
- Atomic writes only

---

## PHASE 7 — Safety & Export
Goal: Sleep-at-night reliability

- Export all notes (Markdown)
- Export progress (CSV/JSON)
- Configurable data directory
- Clear warning before destructive actions

---

## OUT OF SCOPE (DO NOT IMPLEMENT)

- AI summaries
- Analytics, streaks, timers
- Reminders or notifications
- Cloud sync or accounts
- Mobile-first UX
- Flashcards / spaced repetition

---

## GUIDING SENTENCE FOR IDE AGENT

"Build a calm, offline-first personal study desk for UPSC prep. Respect structure, trust manual completion, isolate study mode, and treat data durability as sacred. Do nothing clever unless explicitly asked."

---

## CONTINUATION & SESSION MEMORY (Updated Jan 06 2026)

### STRATEGIC DIRECTIVES
- **Single Source of Truth**: This document.
- **Resume Point**: Phase 6 (Notes) is the next major functional block.
- **Locked Decisions**: Offline-first, File System Truth, No Blue Colors, Full Screen Toggle Top-Left.

### CURRENT STATE SNAPSHOT
- **Theme**: "Electric Amber Glass" (Stone 900 Bg, Amber Accents, Reddit Red Pill Borders).
- **Layout**: 2-Column Lecture Grid, Sidebar Toggle, Full Screen Toggle (Top Left).
- **Features**: Recently Played (Last 3), Manual Sync, Browse Mode, Thick Section Separator.
- **Critical Files**:
  - `css/styles.css`: Contains all "Electric Amber" styles. Use `:root` vars.
  - `js/app.js`: Logic for Sync, Render, and Full Screen Toggle.
  - `index.html`: Base structure for Toggles.

### IMMEDIATE NEXT ACTIONS
1. **Implement Phase 6**: Notes Durability (Markdown Mirroring).
2. **Refine Study Mode**: Ensure PDF/Video players respect the new theme.
3. **Verify Data Safety**: Test deletion/renaming persistence.

