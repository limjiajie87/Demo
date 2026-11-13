# Snip

Snip is a tiny URL shortener: one Bun API serves both an Angular web client and
a zero-dependency Node CLI. The API stores links in memory, so a server restart
clears them.

## Repository layout

Each component has its own orphan branch and is mounted into `main` as a
submodule. The submodule entry pins an exact commit; use a recursive clone to
materialize all components.

| Branch | Path | Stack |
| --- | --- | --- |
| `backend` | `backend/` | Bun, zero dependencies |
| `frontend` | `frontend/` | Angular 19 |
| `cli` | `cli/` | Node.js CommonJS, zero dependencies |
| `bundle` | `bundle/` | Generated release: API, web UI, and CLI |
| `main` | repository root | Submodules, build script, and CI |

## API contract

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` → `201 { code, url, shortUrl, hits, createdAt }`; invalid JSON or a non-HTTP(S) URL → `400` |
| `GET` | `/api/links` | `200` with an array of link objects |
| `GET` | `/:code` | `302` to the original URL and increments `hits`; unknown code → `404` |

## Clone and run

```sh
git clone --branch main --recurse-submodules https://github.com/limjiajie87/Demo.git
cd Demo
```

Run each component from its own directory:

```sh
cd backend && bun start
cd frontend && npm install && npx ng serve
cd cli && node cli.js ls
```

The backend listens on port `3000`; Angular serves the UI on port `4200`.
Set `SNIP_API` to change the CLI's backend URL.

## Updating and releasing

Edit a component on its branch, then commit and push that branch. In the
superproject, advance and commit its pointer:

```sh
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat for `frontend` or `cli`. `bundle/` is generated output: do not edit it by
hand. Build and publish the release with:

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
```

The bundle workflow runs hourly or manually (not on component pushes). The
Docker workflow runs when `main` changes the bundle gitlink or its own workflow
file, manually, or after a successful bundle workflow. The last trigger is
necessary because pushes made by `GITHUB_TOKEN` do not start push workflows.
Image publication is gated by CLI tests, a high/critical dependency audit,
image vulnerability scanning, and a container smoke test.
