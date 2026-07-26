---
name: web2print-presentation
description: Update the Web2Print product presentation video in my-video/. Use when the Web2Print app evolves (new modules in the dashboard sidebar, new editor features like additional import/export formats, new data merge capabilities, new workflow nodes, new AI integrations) and the demo video needs to reflect those changes. Also use when the user wants to refresh narration, add or remove beats, or extend coverage of specific features (IDML, SVG, PPTX, PDF, data merge, print parameters, etc.).
---

# Web2Print Presentation — Maintenance & Evolution

Update the 14-beat HyperFrames demo video at `my-video/` that walks through the Web2Print platform : dashboard modules + editor capabilities + print/export pipeline.

## When to use

Trigger this skill when **any** of the following happens to the Web2Print app:

- A new module appears in the dashboard sidebar (`src/pages/DashboardPage.tsx` → `menuItems`).
- A new file format is added to import (`src/features/{idml,svg,pptx}/...`) or export (`src/features/export/ExportModal.tsx`).
- A new node category or block appears in the workflow editor (`src/features/workflows/registry/`).
- A new data merge feature appears (`src/features/merge/`).
- A new AI integration is wired in (`src/features/ai/llmRouter.ts`, `src/features/nanobana/`).
- The print pipeline gains new parameters (`src/features/print/` or `src/components/panels/PrintPanel.tsx`).
- The user explicitly says "update the presentation", "the video is outdated", "refresh the demo", "add a beat about X".

## Project layout

```
my-video/
├── DESIGN.md                                 Brand cheat sheet (palette, fonts, mood)
├── SCRIPT.md                                 Narration script (French)
├── STORYBOARD.md                             Beat-by-beat creative direction
├── narration.txt                             TTS source text
├── narration.wav                             Generated audio (macOS `say` Thomas voice)
├── index.html                                Root composition with the master timeline
└── compositions/
    ├── beat-hook.html                        0:00–0:05 — Library + sidebar + logo
    ├── beat-import.html                      0:05–0:11 — Import drop zone + file types
    ├── beat-pim-scraping.html                0:11–0:22 — PIM full UI (sources, taxo, fields)
    ├── beat-taxonomies.html                  0:22–0:29 — Taxonomies tree + node detail
    ├── beat-scraping-templates.html          0:29–0:36 — Per-site mapping editor
    ├── beat-scraping-hub.html                0:36–0:42 — Knowledge base grid
    ├── beat-ai.html                          0:42–0:52 — DAM + Nano Banana panel
    ├── beat-workflows.html                   0:52–1:02 — No-code workflow canvas
    ├── beat-chat.html                        1:02–1:09 — Chat IA with prompts
    ├── beat-editor.html                      1:09–1:19 — Editor overview (canvas, tools, layers)
    ├── beat-editor-idml.html                 1:19–1:31 — IDML round-trip Adobe
    ├── beat-editor-merge.html                1:31–1:44 — Data merge batch export
    ├── beat-editor-imports.html              1:44–1:52 — SVG / PPTX / PDF imports
    ├── beat-editor-export.html               1:52–2:10 — Print params + 6 formats export
    └── beat-outro.html                       2:10–2:14 — Final logo + claim
```

## Edit playbook

Run in this order. Each step is required for full correctness.

### 1 — Map what changed in the app

Read the relevant Web2Print source to understand what's new. The single source of truth for the dashboard modules is :

```
src/pages/DashboardPage.tsx → const menuItems: { id, icon, label, accent }[]
```

For editor features, the source-of-truth files are :

| Feature              | File                                                      |
| -------------------- | --------------------------------------------------------- |
| Editor page          | `src/pages/EditorPage.tsx`                                |
| Canvas / Fabric.js   | `src/features/editor/CanvasContainer.tsx` + hooks         |
| Toolbar              | `src/components/panels/ToolBar.tsx`                       |
| Right panel stack    | `src/components/panels/RightPanelStack.tsx`               |
| Layers panel         | `src/components/panels/LayersPanel.tsx`                   |
| Palette              | `src/components/panels/PalettePanel.tsx`                  |
| Print params         | `src/components/panels/PrintPanel.tsx`                    |
| Export modal         | `src/features/export/ExportModal.tsx`                     |
| Data merge           | `src/features/merge/DataMergePanel.tsx` + `mergeEngine.ts`|
| IDML import/export   | `src/features/idml/*`                                     |
| SVG import           | `src/features/svg/*`                                      |
| PPTX import          | `src/features/pptx/*`                                     |
| Workflow registry    | `src/features/workflows/registry/builtin.ts`              |

Look at the actual code, not the README. Read the imports, the `label:` fields, the `ALL_FORMATS`, the menuItems arrays — those drive the UI labels you must mirror.

### 2 — Decide where the change lands

Three patterns :

**Pattern A — Update an existing beat in place** (label change, new field added to existing panel) :
- Find the right `compositions/beat-*.html` and add/rename the visual element.
- No timing change needed.

**Pattern B — Replace a beat entirely** (a module was renamed or its UI overhauled) :
- Rewrite the beat composition file.
- Keep the same `data-composition-id` and the same duration in index.html.

**Pattern C — Add a new beat** (a new module or a new feature category appeared) :
- Create `compositions/beat-<name>.html` following the existing structure (template wrapper, scoped CSS via `[data-composition-id="…"]`, GSAP timeline registered on `window.__timelines`).
- Reserve a time slot in `index.html` and shift later beats.
- Extend `narration.txt` with a sentence covering the new beat.
- Regenerate `narration.wav` and re-allocate timings.

### 3 — Beat composition skeleton

Every composition file follows this exact skeleton. Copy it when adding a new beat.

```html
<template id="beat-<id>-template">
  <div data-composition-id="beat-<id>" data-width="1920" data-height="1080">
    <div class="<prefix>-blackout"></div>

    <!-- Real authenticated-UI mockup goes here: sidebar + main panels -->
    <!-- The HTML should mirror the Web2Print app's actual layout -->

    <style>
      [data-composition-id="beat-<id>"] {
        position: absolute; inset: 0; width: 100%; height: 100%;
        background: #0F0F0F; overflow: hidden; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      [data-composition-id="beat-<id>"] .<prefix>-blackout {
        position: absolute; inset: 0; background: #000; z-index: 50;
      }
      /* scoped styles use the [data-composition-id=...] prefix on every selector */
    </style>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      (function () {
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
        const root = '[data-composition-id="beat-<id>"]';

        // 1. Fade out blackout
        tl.to(root + " .<prefix>-blackout", { opacity: 0, duration: 0.4, ease: "power2.out" }, 0);

        // 2. Entrance animations for every visible element (gsap.from)
        //    Use varied easing: power3.out, back.out(1.4), expo.out, power2.out

        // 3. Hold the final frame for the host's data-duration
        tl.to({}, { duration: <SAME_AS_DATA_DURATION_IN_INDEX_HTML> });

        // 4. Register the timeline
        window.__timelines["beat-<id>"] = tl;
      })();
    </script>
  </div>
</template>
```

**Why the `tl.to({}, { duration: X })` hold matters** : hyperframes v0.5.7 uses the *natural duration of the internal GSAP timeline* to determine clip visibility window — not the `data-duration` declared on the host element. Without the hold, the clip is hidden as soon as the entrance animations finish (often after 2–4 s). The empty `.to({})` extends the timeline to match `data-duration` so the clip stays visible the full time. **This is required**.

### 4 — Visual fidelity rules

- Always include the **Web2Print sidebar** on the left of every beat showing one module — full menu with the 10 items, with the current module highlighted in its accent color :
  - Nouveau document → violet `#A78BFA`
  - Importer → ambre `#FBBF24`
  - Bibliothèque → sky `#38BDF8`
  - DAM → rose `#F472B6`
  - PIM → émeraude `#34D399`
  - Taxonomies → teal `#2DD4BF`
  - Templates scraping → indigo `#818CF8`
  - Scraping Hub → sky `#38BDF8`
  - Workflows → indigo `#818CF8`
  - Chat IA → violet `#A78BFA`
- Background : `#0F0F0F`; surfaces : `#141414` / `#1A1A1A`; bordures : `rgba(255,255,255,0.06)`.
- Tagline / eyebrow : 11–14 px, 700, letter-spacing 0.16em, accent color.
- Heading : 44–48 px, 700, `letter-spacing: -0.02em`, `#F2F2F2`.
- Use **real product names** from the project (Milwaukee M18 FPD3, Bosch GSB 18V-110, Test6 banner, Gilles/Nathalie, etc.) — never lorem ipsum placeholders in mockups.
- **Avoid large white areas** : if a beat must show a printed document (white canvas), surround it with dark UI (toolbar, layers panel, properties panel, bottom bar) so the viewport stays dense.

### 5 — Narration

The narration is one continuous French paragraph in `narration.txt`. Each beat gets one or two sentences. Tone : *technical, calm, B2B product*. No superlatives.

Regenerate the audio :

```bash
say -v "Thomas" -r 200 -f narration.txt --data-format=LEF32@24000 -o narration.wav
afinfo narration.wav | grep duration
```

`-r 200` is 200 wpm. Read the duration line, then redistribute beat timings in `index.html` to add up to the audio length. Match the `data-duration` of the audio clip and the root `[data-composition-id="main"]` to the new total. Update the hold value in every beat composition to match the new `data-duration`.

If macOS `say` is not available (rare), fall back to `npx hyperframes tts` (Kokoro, requires `pip install kokoro-onnx soundfile`).

### 6 — Update index.html

`index.html` is the master composition. Update :

- Root `data-duration` on `[data-composition-id="main"]` and on `<audio id="narration">` to the new total.
- Each beat's `data-start` and `data-duration` to the new allocation. Beats are on `data-track-index="1"` so they must not overlap.

### 7 — Validate

Always run all three from `my-video/` :

```bash
npx hyperframes lint                      # syntax + structure (warnings about CSS selectors are OK)
npx hyperframes validate --no-contrast    # headless render, console errors
npx hyperframes inspect                   # 9-sample layout audit
```

All three must report **0 errors**. The `composition_self_attribute_selector` warnings on `[data-composition-id="…"]` selectors are expected and non-blocking — the framework recommends `#beat-id` instead but the attribute-selector pattern works correctly for single-instance embeds.

### 8 — Preview

Start the Studio :

```bash
npx hyperframes preview
```

Open `http://localhost:3002/#project/my-video`. **Important caveat** : the Studio's timeline scrubber sometimes fails to advance the player when you click the slider. To force a seek programmatically from DevTools console :

```js
document.querySelector('hyperframes-player').seek(<seconds>);
```

The clip at that second should become visible.

### 9 — Update STORYBOARD.md and SCRIPT.md

After landing the changes, update :
- `SCRIPT.md` — full narration paragraph (mirrors `narration.txt`).
- `STORYBOARD.md` — beat-by-beat table with the new timings, eyebrows, and headlines.

Do not invent new files (DESIGN_V2.md, SCRIPT_OLD.md, etc.) — overwrite the canonical ones.

## Adding a brand new beat — full checklist

When the user asks "add a beat for the new <feature>" :

- [ ] Read the source code for that feature (`src/features/<feature>/`).
- [ ] Note the labels, fields, colors, and key panels used by the real UI.
- [ ] Pick a slot in the timeline (typically right after a related beat).
- [ ] Create `compositions/beat-<feature>.html` using the skeleton above. Mirror the real UI structure.
- [ ] Extend `narration.txt` with one or two sentences about the new feature, in French, technical tone.
- [ ] Regenerate `narration.wav` via macOS `say`.
- [ ] Re-allocate beat durations in `index.html` so they sum to the new audio length.
- [ ] Update the `tl.to({}, { duration: X })` hold in every modified beat to match its new `data-duration`.
- [ ] Run `npx hyperframes lint`, `validate --no-contrast`, `inspect`. Fix any errors.
- [ ] Preview in Studio, seek to the new beat range, verify it renders.
- [ ] Update `SCRIPT.md` and `STORYBOARD.md`.

## Known constraints

- **No real screenshots from the authenticated app** — Google OAuth blocks puppeteer's stealth mode, `screencapture` macOS requires Accessibility permission which is denied to the agent shell, and the `claude-in-chrome` MCP doesn't expose saved PNG paths. The beats are pixel-faithful HTML/CSS mockups of the real UI, validated against live navigation done via Chrome MCP. Two fallback puppeteer scripts exist (`scripts/capture-app.mjs` for full launch, `scripts/capture-via-cdp.mjs` for `--remote-debugging-port=9222` mode) in case the user opens up that path.
- **Hyperframes v0.5.7 timeline-duration quirk** — clips become hidden when the internal GSAP tl ends, regardless of `data-duration`. The `tl.to({}, { duration: X })` hold at the end of every composition is the mandatory workaround.
- **Studio scrubber bug** — clicking the timeline slider sometimes doesn't trigger a seek. Use `document.querySelector('hyperframes-player').seek(t)` from DevTools to force-seek when needed.

## Quick reference — adding a new sidebar module

If the user adds e.g. a new module "Analytics" to the dashboard sidebar :

1. Update **every** existing beat's sidebar `<nav>` to include the new menu item (one line per beat composition).
2. Decide if Analytics deserves its own beat (likely yes if it has rich UI).
3. If yes : create `beat-analytics.html` with mockup of the Analytics page, insert it in `index.html`, extend narration.
4. The accent color for the new module must match its color in `menuItems` (`src/pages/DashboardPage.tsx`).
