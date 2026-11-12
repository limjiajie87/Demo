# Snip backend

A zero-dependency Bun URL shortener. Links are held in memory and are cleared
when the server restarts.

## Run

Install Bun 1.x, then start the server:

```sh
bun start
```

The server listens on port `3000` by default. Configure `PORT` to change it,
`BASE_URL` to set the origin used in generated short links, or
`RAILWAY_PUBLIC_DOMAIN` to use `https://<domain>` when `BASE_URL` is unset.
Set `PUBLIC_DIR` to serve static files from a directory; `/` serves
`index.html`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` returns `201` and a
  link object containing `code`, `url`, `shortUrl`, `hits`, and `createdAt`.
  Invalid JSON or non-HTTP(S) URLs return `400` with an `error` field.
- `GET /api/links` returns all link objects.
- `GET /:code` increments the link's hit count and redirects with `302`, or
  returns `404` for an unknown code.

The API enables cross-origin requests and handles preflight `OPTIONS` requests.
