# UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the top bar, schedule table, and right-side statistics panel so the main screen reads as one aligned workspace instead of a few loosely coupled blocks.

**Architecture:** Keep this as a pure presentation pass in `static/index.html`. Adjust shared spacing, vertical alignment, and fixed dimensions in the existing style block so the header controls, table columns, and side panel all land on the same visual baseline. Leave scheduling logic, data flow, and DOM structure alone unless a small wrapper is needed to stabilize layout.

**Tech Stack:** Plain HTML/CSS/JS, existing Flask app, browser rendering.

## Global Constraints

- Do not change scheduling semantics.
- Do not change the data model.
- Keep the current color palette and UI language.
- Prefer CSS-only fixes over DOM restructuring.

---

### Task 1: Normalize top bar alignment

**Files:**
- Modify: `static/index.html`

**Interfaces:**
- Consumes: existing `#topbar`, `.logo`, `.ctrl-group`, `.btn`, `.ip-hint`, `#poll-indicator`
- Produces: a single-row top bar with consistent control heights and centered baseline

- [ ] **Step 1: Tighten the top bar CSS**

Update the existing style block so the header items share a stable height:

```css
#topbar{
  background:linear-gradient(135deg,#1a6fb5 0%,#2196F3 100%);
  color:#fff;
  padding:6px 12px;
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  min-height:42px;
}
#topbar .logo{
  font-size:15px;
  font-weight:bold;
  white-space:nowrap;
  display:flex;
  align-items:center;
  gap:6px;
  line-height:1;
}
.ctrl-group{
  display:flex;
  align-items:center;
  gap:6px;
  flex-wrap:wrap;
}
.ctrl-group label{
  font-size:12px;
  line-height:1;
  opacity:.9;
}
.ctrl-group select{
  padding:3px 8px;
  height:26px;
  border-radius:4px;
  border:none;
  font-size:12px;
  background:#fff;
  color:#333;
}
.btn{
  padding:4px 10px;
  min-height:26px;
  border:none;
  border-radius:4px;
  cursor:pointer;
  font-size:12px;
  font-weight:500;
  line-height:1;
  transition:.15s;
}
.ip-hint,
#poll-indicator{
  display:inline-flex;
  align-items:center;
  line-height:1;
  white-space:nowrap;
}
```

- [ ] **Step 2: Keep the controls in one visual row**

No DOM changes. Confirm the existing button order still works with the tighter spacing and that long text wraps only when the viewport is too narrow.

- [ ] **Step 3: Verify the top bar in the browser**

Open the app and confirm the logo, dropdowns, buttons, and sync text align to one baseline without clipping.

### Task 2: Stabilize schedule and side panel width rhythm

**Files:**
- Modify: `static/index.html`

**Interfaces:**
- Consumes: existing `#main-wrap`, `#schedule-area`, `#side-panel`, `#schedule-wrap`, `#schedule-table`
- Produces: a main content area with less visual drift between the table and the side statistics panel

- [ ] **Step 1: Tighten the main area spacing**

Replace the current layout rules with fixed baselines that keep the table and side panel aligned:

```css
#main-wrap{
  display:flex;
  gap:0;
  height:calc(100vh - 42px);
  overflow:hidden;
}
#schedule-area{
  flex:1;
  overflow:auto;
  min-width:0;
  background:#f5f7fa;
}
#schedule-wrap{
  padding:6px 8px 0 8px;
}
#side-panel{
  width:240px;
  min-width:240px;
  background:#fff;
  border-left:1px solid #d9e2ec;
  overflow-y:auto;
  flex-shrink:0;
  padding:8px 10px 10px;
}
```

- [ ] **Step 2: Make the table columns and headers feel intentional**

Stabilize the fixed column sizes so the highlighted date columns and the row labels line up cleanly:

```css
#schedule-table th,#schedule-table td{
  border:1px solid #d0d0d0;
  padding:0 2px;
  height:26px;
  text-align:center;
  vertical-align:middle;
}
#schedule-table thead tr:first-child th{
  background:#1a6fb5;
  color:#fff;
  font-size:12px;
  position:sticky;
  top:0;
  z-index:10;
  height:26px;
}
#schedule-table thead tr:nth-child(2) th{
  background:#e3f2fd;
  font-size:11px;
  position:sticky;
  top:26px;
  z-index:9;
  height:24px;
}
.col-pos{
  min-width:92px;
  text-align:left;
  padding-left:8px;
}
.col-def{
  min-width:72px;
}
.col-wl{
  min-width:44px;
}
.col-day{
  min-width:44px;
  font-weight:bold;
}
```

- [ ] **Step 3: Verify the main layout in the browser**

Confirm the red highlighted day column no longer looks visually offset from neighboring columns and that the right panel starts cleanly at the top of the table band.

### Task 3: Tighten the side panel and legend

**Files:**
- Modify: `static/index.html`

**Interfaces:**
- Consumes: existing `.side-tabs`, `.side-tab`, `.stat-title`, `.stat-date-sel`, `.stat-list`, `#legend`
- Produces: a right rail and bottom legend that read as aligned utility surfaces

- [ ] **Step 1: Simplify the statistics spacing**

Use tighter margins and consistent control heights so the tab strip, date picker, and list share a single rhythm:

```css
.side-tabs{
  display:flex;
  gap:4px;
  margin-bottom:8px;
}
.side-tab{
  padding:4px 8px;
  min-height:26px;
  border:1px solid #ddd;
  border-radius:4px;
  cursor:pointer;
  font-size:11px;
  background:#f5f5f5;
  line-height:1;
}
.stat-title{
  font-size:13px;
  font-weight:bold;
  color:#333;
  margin:8px 0 6px;
}
.stat-date-sel{
  margin-bottom:8px;
}
.stat-date-sel select{
  padding:3px 8px;
  height:28px;
  border:1px solid #ccc;
  border-radius:4px;
  font-size:12px;
}
.stat-list{
  list-style:none;
}
.stat-item{
  display:flex;
  align-items:center;
  gap:6px;
  padding:3px 0;
  border-bottom:1px solid #f0f0f0;
}
```

- [ ] **Step 2: Align the legend to the table**

Make the legend sit flush with the schedule band instead of feeling like a detached strip:

```css
#legend{
  background:#fff;
  border-top:1px solid #ddd;
  padding:6px 12px;
  display:flex;
  gap:12px;
  flex-wrap:wrap;
  align-items:center;
  font-size:11px;
  margin-left:0;
}
```

- [ ] **Step 3: Recheck the visual balance**

Ensure the side panel does not crowd the table and the legend remains readable without adding vertical noise.

### Task 4: Final verification

**Files:**
- Modify: `static/index.html`

**Interfaces:**
- Consumes: the adjusted CSS
- Produces: a visually aligned schedule screen

- [ ] **Step 1: Reload the app and inspect the main page**

Use the existing running app and verify the top bar, table, side rail, and legend look aligned at the same scale.

- [ ] **Step 2: Confirm no layout regressions**

Check that the month/year controls still fit, the table still scrolls, and the sidebar still renders all tabs and lists.
