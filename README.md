# taimur.sh

Static personal site served by nginx. No build step, no frameworks.

## File structure

- `index.html` — homepage
- `work.html` — project-indexed view of the career; the "work" link in nav (see below)
- `resume.html` — the same career chronologically by employer, linked as "resume"
- `projects.html` — **retired.** Its four tools are entries on `work.html` now. Still on disk, unlinked from every page, dropped from `sitemap.xml` and `llms.txt`
- `visuals.html` — WebGL canvas gallery
- `webgl.html` — full-screen swarm animation
- `404.html` — custom error page
- `blog/` — blog posts, each in its own folder with an `index.html`
- `wave-viz/` — standalone wave visualization experiments
- `img/projects/` — project screenshots, 1200×750 webp
- `style.css` — global styles, supports light/dark via `prefers-color-scheme`
- `shared.js` — shared canvas/color utilities (DPR-aware, reads CSS custom properties)
- `swarm.js` — particle swarm animation used by `webgl.html` and `404.html`
- `resume.pdf` — downloadable PDF version of resume
- `robots.txt`, `sitemap.xml`, `llms.txt` — crawler and LLM discovery files

## Nav convention

Every page has a `<header>` with the site name linking to `/` and a `<nav>` with three links: **work** (`/work`), **visuals** (`/visuals`), and **contact** (mailto). On top-level pages, the link to the current page is omitted (e.g. `work.html` omits the "work" link).

`/resume` is deliberately **not** in nav — it hangs off the "Chronological resume" link in the work page header. Because that makes it one hop further from the front door, it is called out explicitly in `sitemap.xml`, in `llms.txt` (flagged as the full CV, with the note that it is not in nav), and in a comment in `robots.txt`. If the work page header ever loses that link, `/resume` becomes orphaned.

## Work page

`work.html` takes the project, rather than the employer, as the unit. Each `<article class="proj">`
block carries its own facets as data attributes, and the filter row, option counts, sorting and FLIP
reordering are all derived from them at runtime — the markup is the only source of truth, so adding a
project means copying a block and setting five attributes:

| attribute       | meaning                                                        |
|-----------------|----------------------------------------------------------------|
| `data-org`      | one key from `LABELS.org`                                       |
| `data-theme`    | one or more keys from `LABELS.theme`, space separated           |
| `data-type`     | one or more keys from `LABELS.type`, space separated            |
| `data-year`     | numeric sort key — the most recent year of involvement          |
| `data-title`    | sort/dedupe key, independent of the displayed `<h2>`            |
| `data-featured` | present = pinned into the Highlighted section                   |

A new facet value needs a matching entry in `LABELS` or its dropdown option renders as a raw key.
Facets are three single-select dropdowns; each option shows the count it would yield, computed
against the *other* two facets, and an option that would return nothing is disabled.

Pinning only holds in the default view. As soon as a filter or a non-default sort is applied, the
highlighted set merges back into one list, so the ordering the visitor asked for is the ordering they
get. Filter state is mirrored into the query string (`?org=cerp&theme=education`), so a filtered view
is linkable.

To take a project off the page without losing it — unreleased work, say — comment the block out.
`Cities Diagnostic Tool` is currently commented out for that reason and needs no other change to come
back.

The page degrades: without JS every project is visible in source order, the Highlighted section stays
hidden rather than rendering an empty heading, and all project text is in the HTML rather than behind
a `fetch`, which is also what makes it readable to crawlers and LLMs.

## Local development

```sh
./serve.py          # http://localhost:8899
./serve.py 8000     # or pick a port
```

`serve.py` exists because `python3 -m http.server` won't resolve the extensionless
links the site uses — nav points at `/projects`, and the file is `projects.html`. It
mirrors the production nginx rule:

```nginx
try_files $uri $uri.html $uri/ =404;
```

It also serves `404.html` on a miss and sends `Cache-Control: no-store`, so edits show
on a normal reload. One fidelity gap: production blocks `/README.md`, the dev server
doesn't.

## Discovery files

- `robots.txt` allows everything and points at the sitemap.
- `sitemap.xml` lists the canonical pages; update `lastmod` when a page changes materially.
- `llms.txt` follows the [llmstxt.org](https://llmstxt.org/) proposal — a markdown map of the site for LLM retrieval. It is a content-curation convention, not a crawler-control standard, and adoption is not broad; it costs nothing to keep current but does nothing for search ranking on its own.
- `index.html` carries a JSON-LD `Person` block and a `rel=canonical`. That structured data does more for indexing than `llms.txt`.

## Styling

Colors are defined as CSS custom properties (`--fg`, `--muted`, `--border`, `--accent`) and switch automatically with `prefers-color-scheme`. Canvas code reads these via `shared.js` so visuals respect dark mode.

## Deployment

Static files served by nginx. Add to the server block to prevent serving this file:

```nginx
location = /README.md { return 404; }
```
