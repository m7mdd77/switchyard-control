import {
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
mkdirSync("site/public", { recursive: true });
mkdirSync("site/lib", { recursive: true });
for (const file of ["app.js", "style.css", "favicon.svg"])
  copyFileSync("web/" + file, "site/public/" + file);
for (const file of ["domain.js", "control.js"])
  copyFileSync("src/" + file, "site/lib/" + file);
copyFileSync("src/domain.js", "site/public/domain.js");
const html = readFileSync("web/index.html", "utf8"),
  body = html.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync(
  "site/app/page.tsx",
  'export default function Page(){return <div style={{display:"contents"}} dangerouslySetInnerHTML={{__html:' +
    JSON.stringify(body) +
    "}}/>;}\n",
);
writeFileSync(
  "site/app/layout.tsx",
  `import type{ReactNode}from'react';export const metadata={title:'Switchyard — keep a hand on the work',description:'The live operations desk for a fleet of independent AI agents.'};export default function Layout({children}:{children:ReactNode}){return <html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="icon" href="/favicon.svg"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/><link rel="stylesheet" href="/style.css"/><script type="module" src="/app.js"/></head><body>{children}</body></html>;}`,
);
mkdirSync("site/app/api/[...path]", { recursive: true });
writeFileSync(
  "site/app/api/[...path]/route.ts",
  `import{env}from'cloudflare:workers';import{api}from'../../../lib/control.js';export const dynamic='force-dynamic';const serve=(request:Request)=>api(request,env.DB,env);export const GET=serve;export const POST=serve;`,
);
console.log("Switchyard hosted source prepared.");
