# International Optimizely Templates

Source for Melaleuca's international Optimizely Web **extension (widget) templates**.

Optimizely stores each template as a single **consolidated JSON** blob whose
`options` fields hold HTML, CSS, and JavaScript as escaped strings. That format
is painful to read, diff, and edit. This repo keeps each template **decomposed**
into normal `.html` / `.css` / `.js` / `.json` files you can edit with proper
syntax highlighting, then recompiles them back into the consolidated JSON that
Optimizely imports.

Two Node scripts move a template between the two representations:

```
 Optimizely JSON  ──  decompose.js  ──►  component files  (edit these)
 component files  ──   build.js     ──►  Optimizely JSON  (import this)
```

Both scripts are plain Node with no dependencies.

---

## Repo layout

```
InternationalOptimizelyTemplates/
├── build.js                     # component files  → consolidated JSON
├── decompose.js                 # consolidated JSON → component files
├── package.json                 # npm script shortcuts
├── README.md
│
├── tmpl-productrecs-v3/          # one folder per template
│   ├── template-meta.json            # plugin_type, name, edit_page_url, description
│   ├── form-schema.json              # the editor form fields (form_schema array)
│   ├── tmpl-productrecs-v3-html.html # options.html
│   ├── tmpl-productrecs-v3-css.css   # options.css
│   ├── tmpl-productrecs-v3-applyJS.js# options.apply_js  (runs when variation applies)
│   ├── tmpl-productrecs-v3-resetJS.js# options.undo_js   (runs when variation is undone)
│   ├── tmpl-productrecs-v3-baseline.json          # original consolidated JSON (archival — never import)
│   └── tmpl-productrecs-v3-optimizely-import.json # consolidated JSON produced by build.js — import THIS
│
├── tmpl-productrecs-shelf-v3/    # same structure
├── tmpl-productrecs-v1/
├── tmpl-stripbanner-v1/
├── tmpl-stripbanner-v2/
├── tmpl-herocarousel-v1/
├── tmpl-herocarousel-v2/
├── tmpl-catpromo-v1/
│
├── tmpl-productrecs-v1-initial.json   # early exports kept for reference (not templates)
└── tmpl-stripbanner-v1-initial.json
```

### Templates

| Folder | What it does |
|--------|--------------|
| `tmpl-productrecs-v1` | Enhanced product carousel with product recommendations (original) |
| `tmpl-productrecs-v3` | Product carousel with recommendations, singleton-manager architecture |
| `tmpl-productrecs-shelf-v3` | Shelf version of the v3 carousel; multi-market context detection, localized pricing and aria-labels |
| `tmpl-stripbanner-v1` | Full-width strip banner (New Welcome Program on the PSLP); anchors to the top-navigation carousel |
| `tmpl-stripbanner-v2` | Strip banner targeting `#mainContent`, for hybrid mobile-app webview compatibility |
| `tmpl-herocarousel-v1` | Replaces all hero-carousel slides from a JSON config (static and video slides) |
| `tmpl-herocarousel-v2` | v1 plus optional single-slide targeting (Target Slide Index) for concurrent A/B tests |
| `tmpl-catpromo-v1` | Category page product cards: 2-column waterfall grid at ≤576px, plus `data-cat-promo*` analytics attributes (see below) |

### tmpl-catpromo-v1

Injects no markup (its `html` part is intentionally empty). It has two jobs:

- **CSS** — switches the category grid (`.p-catListing__grid`) to a 2-column
  `column-count` waterfall layout at screen widths of 576px and below.
- **Analytics attributes** — stamps `data-cat-promo` on each product card
  (`card`) and its interactive zones (`stamp`, `image`, `title`,
  `shop-options`, `details`, `save`, `select`). Each card also gets
  `data-cat-promo-sku`, `-name` and `-price` (member price as a plain number).
  - SKU comes from the `id` in the `dataLayer` `impressions` event, matched to
    the card by product name; name and price come from the card DOM.
  - A `MutationObserver` re-stamps cards added by Load More, filter, or sort.
  - Editor fields: **Product Grid Selector** (default `.p-catListing__grid`),
    **Analytics Attribute Name** (default `data-cat-promo`), and
    **Only Stamp At Or Below Width (px)** (default `576`; blank = all widths).
    Crossing the breakpoint adds or removes the attributes without a reload.
  - Reset removes the observer and every attribute the template added.

### The seven files a template folder contains

| File | Maps to JSON | Notes |
|------|--------------|-------|
| `template-meta.json` | `plugin_type`, `name`, `edit_page_url`, `description` | Fixed filename (not prefixed) |
| `form-schema.json` | `form_schema` | Fixed filename. Array of editor fields |
| `<name>-html.html` | `options.html` | May be empty if the template injects no markup (e.g. `tmpl-catpromo-v1`) |
| `<name>-css.css` | `options.css` | May be empty if the template has no CSS |
| `<name>-applyJS.js` | `options.apply_js` | |
| `<name>-resetJS.js` | `options.undo_js` | |
| `<name>-optimizely-import.json` | *(whole template)* | **Generated** by `build.js` — this is the file you import into Optimizely |

`<name>` is the template's `name` field (e.g. `tmpl-productrecs-v3`), taken from
`template-meta.json`. The `template-meta.json` and `form-schema.json` filenames
are **fixed**; the four `options.*` files are **prefixed** with `<name>`.

> A `<name>-baseline.json` file is often also present. That is the *original*
> consolidated JSON that was decomposed — kept only for reference, never edited
> or imported. Templates authored directly as component files (e.g.
> `tmpl-catpromo-v1`) have no baseline, and a few older folders have a baseline
> but no `-optimizely-import.json` yet — run `build.js` to generate one.
> `build.js` never touches the baseline; it writes `<name>-optimizely-import.json`
> instead, so you can diff the two to see exactly what your edits changed.
>
> **The two names are deliberately dissimilar.** An earlier version of this repo
> used `<name>-json.json` (baseline) vs `<name>-output.json` (import) — two
> files sitting side by side whose names differed by one word, which was
> mistaken for the other more than once and led to a stale template going live.
> If you ever see a bare `<name>-json.json` or `<name>-output.json` in a
> template folder, it predates this convention — rename it rather than trusting
> the old suffix.

---

## decompose.js — JSON → component files

Splits one consolidated template JSON into the component files, **writing them
into the same directory as the JSON file**.

```bash
node decompose.js <path-to-template-json>
# e.g.
node decompose.js tmpl-productrecs-v3/tmpl-productrecs-v3-baseline.json
```

What it writes (into the JSON's own folder):

- `template-meta.json` — `{ plugin_type, name, edit_page_url, description }`
- `form-schema.json` — the `form_schema` array
- `<name>-html.html`, `<name>-css.css`, `<name>-applyJS.js`, `<name>-resetJS.js`
  from `options.html` / `css` / `apply_js` / `undo_js`

Notes:

- `<name>` comes from the JSON's `name` field.
- A missing `options.*` value is written as an **empty file** (`options[key] || ''`),
  so every template always ends up with all four part files.
- **Overwrites** existing component files in that folder without prompting — it
  is the "explode this JSON into parts" step, so run it against a fresh export.

Typical use: you exported/pasted a template's JSON from Optimizely; drop it in a
new folder as `<name>-baseline.json` and decompose it to start editing.

---

## build.js — component files → JSON

Reassembles the component files in a template folder into a single consolidated
JSON, written as `<name>-optimizely-import.json` in that same folder — the file
you hand to Optimizely.

```bash
node build.js <template-dir>
# e.g.
node build.js tmpl-productrecs-v3
```

If you omit the directory, it auto-detects **only when exactly one** template
folder exists; otherwise it errors and asks you to name one.

It reads `template-meta.json` + `form-schema.json` (both required) and the four
`<name>-*` part files, then writes `<name>-optimizely-import.json` with this
exact shape and key order:

```jsonc
{
  "plugin_type":  "...",
  "name":         "...",
  "edit_page_url":"...",
  "form_schema":  [ ... ],
  "description":  "...",
  "options": {
    "html":     "...",
    "css":      "...",
    "apply_js": "...",
    "undo_js":  "..."
  }
}
```

Notes:

- Source files have their line endings **normalized to `\n`** (CRLF → LF) before
  embedding, so Windows editors don't introduce `\r\n` into the JSON strings.
- Errors out (non-zero exit) if `template-meta.json`, `form-schema.json`, or any
  of the four expected part files are missing.
- Only `<name>-optimizely-import.json` is written; the original
  `<name>-baseline.json` is left untouched as your reference copy.

---

## npm scripts

`package.json` provides shortcuts:

| Command | Runs |
|---------|------|
| `npm run build:recs-v1` | `node build.js tmpl-productrecs-v1` |
| `npm run build:recs-v3` | `node build.js tmpl-productrecs-v3` |
| `npm run build:shelf-v3` | `node build.js tmpl-productrecs-shelf-v3` |
| `npm run build:stripbanner-v1` | `node build.js tmpl-stripbanner-v1` |
| `npm run build:stripbanner-v2` | `node build.js tmpl-stripbanner-v2` |
| `npm run build:herocarousel-v1` | `node build.js tmpl-herocarousel-v1` |
| `npm run build:herocarousel-v2` | `node build.js tmpl-herocarousel-v2` |
| `npm run build:catpromo-v1` | `node build.js tmpl-catpromo-v1` |
| `npm run decompose` | `node decompose.js` (append the JSON path) |

Add a `build:<template>` line per template as new ones are created.

---

## Typical workflow

**Editing an existing template**

1. Edit the component files in the template's folder
   (usually just `<name>-applyJS.js`, `<name>-html.html`, etc.).
2. Recompile: `node build.js <template-dir>` (or the matching `npm run build:*`).
3. Import the regenerated `<name>-optimizely-import.json` into Optimizely.
   **Do not import `<name>-baseline.json`** — that's the old archival copy.
4. Optionally diff `<name>-optimizely-import.json` against `<name>-baseline.json`
   to review the change set.

**Onboarding a new template from Optimizely**

1. Create a folder for it and save the exported JSON as `<name>-baseline.json`.
2. `node decompose.js <folder>/<name>-baseline.json`.
3. Edit the component files.
4. `node build.js <folder>` and import `<name>-optimizely-import.json`.

**Creating a new template from scratch** (no Optimizely export; e.g. `tmpl-catpromo-v1`)

1. Copy an existing folder as a starting point, or create `<name>/` containing
   `template-meta.json`, `form-schema.json`, and the four `<name>-*` part files
   (empty files are fine).
2. Make sure `name` in `template-meta.json` matches the folder and file prefix.
3. `node build.js <folder>` and import `<name>-optimizely-import.json`.
4. Add a `build:<template>` script to `package.json` and a row to the
   Templates table above.

`decompose` and `build` are inverses: decomposing a JSON and immediately building
it should reproduce the same template (aside from the `-baseline` vs
`-optimizely-import` filename and JSON key-ordering normalization).

---

## Version control

This folder is a git repository (branch `main`).

- **Committed:** all component files, `build.js` / `decompose.js`, the generated
  `*-optimizely-import.json` files (so the imported version is recorded and can
  be diffed against its baseline), and the archival `*-baseline.json` /
  `*-initial.json` files.
- **Ignored** (`.gitignore`): `node_modules/`, logs, OS and editor files, temp
  and backup files, and `.claude/settings.local.json`.
- **Line endings** (`.gitattributes`): text files are stored as LF.
  `build.js` also normalizes CRLF to LF when embedding, so the generated JSON is
  the same regardless of editor.
- After editing a template, rebuild (`node build.js <template-dir>`) **before
  committing**, so the committed `-optimizely-import.json` matches the sources.
