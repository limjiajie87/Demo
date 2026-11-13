import { randomBytes } from "node:crypto";
import { extname, resolve, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const baseUrl = (
  process.env.BASE_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`)
).replace(/\/+$/, "");
const publicDir = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function corsHeaders(contentType) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
  });
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders("application/json; charset=utf-8") });
}

function createCode() {
  let code = "";
  while (code.length < 6) {
    for (const byte of randomBytes(16)) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function makeUniqueCode() {
  let code;
  do {
    code = createCode();
  } while (links.has(code));
  return code;
}

async function serveStatic(pathname) {
  if (!publicDir) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return new Response("Bad Request", { status: 400, headers: corsHeaders("text/plain; charset=utf-8") });
  }

  if (relativePath === "") relativePath = "index.html";
  const filePath = resolve(publicDir, relativePath);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) {
    return null;
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return new Response(file, { headers: corsHeaders(contentType) });
}

function makeLink(url) {
  const code = makeUniqueCode();
  const link = {
    code,
    url,
    shortUrl: `${baseUrl}/${code}`,
    hits: 0,
    createdAt: new Date().toISOString(),
  };
  links.set(code, link);
  return link;
}

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      if (typeof body?.url !== "string") {
        return jsonResponse({ error: "URL must be a string" }, 400);
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(body.url);
      } catch {
        return jsonResponse({ error: "Invalid URL" }, 400);
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ error: "URL must use http or https" }, 400);
      }

      return jsonResponse(makeLink(body.url), 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return jsonResponse(Array.from(links.values()));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: staticResponse.status,
            headers: staticResponse.headers,
          });
        }
        return staticResponse;
      }
    }

    if (request.method === "GET") {
      const code = pathname.slice(1);
      if (code.length === 6 && !code.includes("/")) {
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return new Response(null, {
            status: 302,
            headers: { ...Object.fromEntries(corsHeaders()), Location: link.url },
          });
        }
      }
      return jsonResponse({ error: "Not found" }, 404);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },
});

console.log(`Snip backend listening on ${port}`);
