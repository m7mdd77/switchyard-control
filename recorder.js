import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const port = 3313,
  origin = `http://127.0.0.1:${port}`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync("web/record.html"));
      return;
    }
    if (req.url === "/record.js" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(readFileSync("web/record.js"));
      return;
    }
    if (
      req.url !== "/recording" ||
      req.method !== "POST" ||
      req.headers.origin !== origin ||
      req.headers["x-switchyard-recording"] !== "1"
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let size = 0;
    const parts = [];
    for await (const c of req) {
      size += c.length;
      if (size > 30000000) throw Error("Recording too large");
      parts.push(c);
    }
    const name = "walkthrough-" + Date.now() + ".webm";
    mkdirSync("outputs", { recursive: true });
    writeFileSync("outputs/" + name, Buffer.concat(parts));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ saved: true, name, bytes: size }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ saved: false }));
  }
}).listen(port, "127.0.0.1", () =>
  console.log("Switchyard recorder ready at " + origin),
);
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, () => server.close(() => process.exit(0)));
