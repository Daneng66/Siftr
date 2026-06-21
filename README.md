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
  `.trash` you can restore from or empty at any time. (A perceptual "similar
  images" pass is also wired up, behind `DEDUP_SIMILAR=true`; off by default
  for now.)
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
  .trash/       # files removed via "Move to trash" (restore or empty from the UI)
```

## Install on unraid

Siftr ships as an unraid template (`unraid/siftr.xml`) backed by the prebuilt
GHCR image `ghcr.io/daneng66/siftr`. Until it lands in Community Apps, add it
manually:

1. **Docker → Add Container**, then in **Template repositories** (under Docker
   settings) add `https://github.com/Daneng66/Siftr` and **Save**.
2. Back on **Add Container**, select the **Siftr** template.
3. Set the port and path mappings, then apply. Each row below maps a value on
   your unraid host to a fixed location inside the container — only the **Host
   value** is yours to choose; leave the **Container value** as shown.

   **Port** (`Config Type: Port`)

   | Name | Container port | Host port | Notes |
   | --- | --- | --- | --- |
   | WebUI Port | `8080` | `8080` | TCP. Change the host port only if 8080 is already taken. |

   **Paths** (`Config Type: Path`)

   | Name | Container path | Host path (example) | Access mode | Notes |
   | --- | --- | --- | --- | --- |
   | App Data | `/data` | `/mnt/user/appdata/siftr` | Read/Write | Database, thumbnails, and `.trash`. Keep on a fast cache/appdata share. |
   | Photo Library | `/data/photos` | `/mnt/user/Photos` | Read/Write | Your existing photo share. Must be writable so Siftr can rename files and write EXIF. The container path is intentionally nested under `/data`, but its host path can live on a separate (e.g. array) share. |
   | Trash Folder *(advanced, optional)* | `/data/.trash` | `/mnt/user/appdata/siftr/.trash` | Read/Write | Where "Move to trash" relocates removed files. Defaults inside App Data; map to its own host share to keep trashed files off appdata or recover them elsewhere. |

4. Open the WebUI on the host port from above (default **8080**) and click **Scan**.

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
| `TRASH_DIR` | `$DATA_DIR/.trash` | Holding area for "Move to trash" deletions; point at a separate path/share to keep trashed files off the data volume |
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
