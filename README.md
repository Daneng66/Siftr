# Siftr

Sift through your photo library with smart renaming, browsing, and deduplication.

Siftr is a self-hosted photo manager that ships as a **single all-in-one Docker
container** — React frontend, Node/Express API, SQLite index, and the
`czkawka_cli` deduplication engine all bundled and served from one port.

## Features

- **Library browser** — fast, virtualized photo grid that stays smooth at
  1,000–10,000 photos. Hover quick-actions (download / select) and
  corner badges (duplicate indicator, file size).
- **Deduplication** — `czkawka_cli` finds exact (hash-based) duplicate groups.
  Compare copies side-by-side and pick which to keep; deletions move to a
  reversible `.trash`. (A perceptual "similar images" pass is also wired up,
  behind `DEDUP_SIMILAR=true`; off by default for now.)
- **Bulk rename** — pattern tokens (`{date:…}`, `{seq:N}`, `{original}`,
  `{camera}`, `{custom}`) with a live preview and collision detection.
- **Metadata editing** — view and edit EXIF (date, GPS, camera) individually or
  across a selection; changes are written back into the files with `exiftool`.
- **Folders** — the sidebar mirrors the actual directory structure of your
  photos on disk; pick a folder to browse just the photos it contains.
- **UX** — card dashboard, left sidebar (folders / filters / stats), top nav,
  dark mode, and low-friction bulk selection (click, shift-click range,
  ctrl-click toggle, drag-select marquee).

## Quick start (Docker)

```bash
docker build -t siftr .
docker run -p 8080:8080 -v ./data:/data siftr
```

Then open <http://localhost:8080>.

Put your photos under the mounted volume at `./data/photos` (sub-folders are
scanned recursively) and click **Scan**. All persistent data lives under the one
volume:

```
data/
  photos/       # your images (the watched library — source of truth)
  thumbnails/   # generated WebP thumbnails
  db/siftr.sqlite
  .trash/       # reversible deletions + edit backups
```

## Install on unraid

Siftr ships as an unraid template (`unraid/siftr.xml`) backed by the prebuilt
GHCR image `ghcr.io/daneng66/siftr`. Until it lands in Community Apps, add it
manually:

1. **Docker → Add Container**, then in **Template repositories** (under Docker
   settings) add `https://github.com/Daneng66/Siftr` and **Save**.
2. Back on **Add Container**, select the **Siftr** template.
3. Set the paths and apply:

   | Setting | Example | Notes |
   | --- | --- | --- |
   | **WebUI Port** | `8080` | Port the web UI is served on. |
   | **App Data** | `/mnt/user/appdata/siftr` | Database, thumbnails, and `.trash`. Keep on a fast cache/appdata share. |
   | **Photo Library** | `/mnt/user/Photos` | Your photo share, mounted at `/data/photos`. Must be read/write so Siftr can rename and write EXIF. |
   | **Trash Folder** *(advanced)* | `…/appdata/siftr/.trash` | Optional — map to a separate share to keep trashed files off appdata. |

4. Open the WebUI on port **8080** and click **Scan**.

Advanced options (similar-image dedup, scan concurrency, thumbnail size, etc.)
are exposed as template variables; see [Configuration](#configuration-environment-variables).

> [!NOTE]
> The image is **`linux/amd64` only** — czkawka has no ARM build — so Siftr
> targets standard Intel/AMD unraid hardware.

## Architecture

A single Node.js process serves the API under `/api/*` and the built React SPA
for everything else.

- **Backend:** Express + TypeScript, `better-sqlite3` (in-process, no DB daemon),
  `sharp` (thumbnails/dimensions), `exifr` (EXIF read), `exiftool` (EXIF write),
  `czkawka_cli` (dedup) via child process. An in-process job queue runs scans and
  dedup with progress exposed at `/api/jobs`.
- **Frontend:** React + Vite + Tailwind, TanStack Query (server state), Zustand
  (selection/UI), `@tanstack/react-virtual` (grid virtualization).

```
server/   Express API, scanner, dedup, exif, db
client/   React app
Dockerfile  multi-stage build (client + server -> slim runtime)
```

## Local development

Requires **Node 20 or 22 LTS** (native modules `better-sqlite3`/`sharp` ship
prebuilt binaries for LTS releases). `exiftool` and `czkawka_cli` must be on
`PATH` for metadata-write and dedup features (or point `EXIFTOOL_BIN` /
`CZKAWKA_BIN` at them); everything else runs without them.

```bash
npm install
npm run dev        # Express on :8080, Vite dev server on :5173 (proxies /api)
# or, production-style:
npm run build && DATA_DIR=./data npm start
```

Run the backend unit tests (rename pattern engine + czkawka output parser):

```bash
npm test
```

## Configuration (environment variables)

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` | Root of the persisted volume |
| `SCAN_ON_STARTUP` | `true` | Scan the library on boot |
| `SCAN_CONCURRENCY` | `4` | Parallel hash/thumbnail workers |
| `THUMB_SIZE` | `256` | Thumbnail max dimension (px) |
| `DEDUP_SIMILAR` | `false` | Also run czkawka's perceptual near-duplicate pass |
| `CZKAWKA_IMAGE_PRESET` | `High` | Similarity sensitivity (`Minimal`…`VeryHigh`) for the perceptual pass |
| `CZKAWKA_BIN` | `czkawka_cli` | Path to the dedup binary |
| `EXIFTOOL_BIN` | `exiftool` | Path to exiftool |

## Notes

- `czkawka_cli` flag/output formats vary across versions; the parser is tolerant
  of both duplicate and similar-image result files. The Docker image pins a
  version via the `CZKAWKA_VERSION` build arg.
- Metadata edits are written in place with `-overwrite_original`. Keep backups of
  irreplaceable originals.
