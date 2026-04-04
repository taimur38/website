# taimur.sh

Static personal site served by nginx. No build step, no frameworks.

## File structure

- `index.html` — homepage
- `resume.html` — resume/work page (linked as "work" in nav)
- `visuals.html` — WebGL canvas gallery
- `webgl.html` — full-screen swarm animation
- `404.html` — custom error page
- `blog/` — blog posts, each in its own folder with an `index.html`
- `wave-viz/` — standalone wave visualization experiments
- `style.css` — global styles, supports light/dark via `prefers-color-scheme`
- `shared.js` — shared canvas/color utilities (DPR-aware, reads CSS custom properties)
- `swarm.js` — particle swarm animation used by `webgl.html` and `404.html`
- `resume.pdf` — downloadable PDF version of resume

## Nav convention

Every page has a `<header>` with the site name linking to `/` and a `<nav>` with three links: **work** (`/resume`), **visuals** (`/visuals`), and **contact** (mailto). On top-level pages, the link to the current page is omitted (e.g. `resume.html` omits the "work" link).

## Styling

Colors are defined as CSS custom properties (`--fg`, `--muted`, `--border`, `--accent`) and switch automatically with `prefers-color-scheme`. Canvas code reads these via `shared.js` so visuals respect dark mode.

## Deployment

Static files served by nginx. Add to the server block to prevent serving this file:

```nginx
location = /README.md { return 404; }
```
