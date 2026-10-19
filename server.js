import { createServer } from "node:http";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { extname, resolve } from "node:path";
import { api, SCHEMA } from "./src/control.js";
import { SqliteD1 } from "./src/sqlite-d1.js";
mkdirSync("data", { recursive: true });
if (!existsSync("data/worker-token"))
  writeFileSync("data/worker-token", randomBytes(32).toString("hex"), {
    mode: 0o600,
  });
const token = readFileSync("data/worker-token", "utf8").trim(),
  db = new SqliteD1("data/control.sqlite");
db.exec(SCHEMA);
const port = Number(process.env.PORT || 3311),
  origin = "http://127.0.0.1:" + port;
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== "127.0.0.1:" + port) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith("/api/")) {
      let bytes = 0;
      const chunks = [];
      for await (const c of req) {
        bytes += c.length;
        if (bytes > 20000) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(c);
      }
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      });
      const response = await api(request, db, {
        SWITCHYARD_WORKER_TOKEN: token,
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const routes = {
      "/": "web/index.html",
      "/style.css": "web/style.css",
      "/app.js": "web/app.js",
      "/domain.js": "src/domain.js",
      "/favicon.svg": "web/favicon.svg",
      "/walkthrough.mp4": "site/public/walkthrough.mp4",
      "/roadmap": "web/roadmap.html",
    };
    const file = routes[url.pathname];
    if (!file || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = readFileSync(resolve(file));
    res.writeHead(200, {
      "Content-Type": {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css",
        ".js": "text/javascript",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
      }[extname(file)],
      "Content-Length": bytes.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(500);
    res.end("The request could not finish.");
  }
}).listen(port, "127.0.0.1", () =>
  console.log("Switchyard ready at " + origin),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
