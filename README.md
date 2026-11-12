# Snip Frontend

Snip is a small Angular 19 client for the URL shortener API. It validates URLs
before submission, shows the returned short link, and lists links with hit counts.

## Run locally

Start the backend on port 3000, then in this directory run:

```sh
npm install
npx ng serve
```

Open `http://localhost:4200`. The app uses the API at
`http://localhost:3000/api/links`; the backend must allow browser CORS requests.

## Build

```sh
npx ng build
```

The browser bundle is written to `dist/snip-frontend/browser`.
