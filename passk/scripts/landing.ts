/**
 * Generate the published site's document pages from the markdown that is
 * already the documentation: passk/index.html from README.md and docs/*.html
 * from docs/*.md, typeset in the report theme, with markdown links rewritten
 * to the generated pages. One source of truth: the manual on GitHub and the
 * manual on the site are the same file.
 *
 *   npx tsx scripts/landing.ts        # from passk/
 */
import fs from "node:fs";
import path from "node:path";
import { marked, Renderer } from "marked";
import { CSS, FONTS, esc } from "../src/report/theme.js";

const ROOT = path.resolve(".");
const PAGES = [
  { src: "README.md", out: "index.html", title: "passk · does your computer-use agent pass twice?", nav: "Manual" },
  { src: "docs/TASKS.md", out: "docs/tasks.html", title: "passk · writing and running tasks", nav: "Tasks" },
  { src: "docs/METHOD.md", out: "docs/method.html", title: "passk · method", nav: "Method" },
  { src: "docs/SOLARI-NOTES.md", out: "docs/solari-notes.html", title: "passk · notes from building on Solari", nav: "Solari notes" },
];
const EXTRA_NAV = [{ out: "evidence/index.html", nav: "Evidence" }];
const GITHUB = "https://github.com/tohirr/solari-cookbook/tree/main/passk";

/** GitHub's heading ids, so every `#fragment` link in the markdown keeps working on the site. */
const slug = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");

/**
 * A markdown link resolved against its source file, mapped to the generated
 * page when it points at one of the sources, then made relative to the
 * output page. Absolute URLs and fragments pass through.
 */
function map(href: string, src: string, out: string): string {
  if (/^([a-z]+:|#|\/)/i.test(href)) return href;
  const [file, frag] = href.split("#");
  const repoRel = path.posix.normalize(path.posix.join(path.posix.dirname(src), file));
  const page = PAGES.find((p) => p.src === repoRel);
  const target = page ? page.out : repoRel === "evidence/README.md" ? "evidence/index.html" : repoRel;
  const rel = path.posix.relative(path.posix.dirname(out), target) || ".";
  return `${rel}${frag ? `#${frag}` : ""}`;
}

function render(md: string, src: string, out: string): string {
  const r = new Renderer();
  r.heading = function ({ tokens, depth }) { const text = this.parser.parseInline(tokens); return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`; };
  r.link = function ({ href, title, tokens }) { return `<a href="${esc(map(href, src, out))}"${title ? ` title="${esc(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`; };
  r.image = function ({ href, title, text }) { return `<img src="${esc(map(href, src, out))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""}>`; };
  return marked.parse(md, { renderer: r, gfm: true }) as string;
}

const DOC_CSS = `
.docnav{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;font:13.5px var(--sans);color:var(--ink-3);margin-bottom:36px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.docnav a{text-decoration:none;color:var(--ink-2)}.docnav a:hover{color:var(--ink)}.docnav a.on{color:var(--ink);font-weight:600}
.docnav b{color:var(--ink);font-weight:600;margin-right:6px;font-size:14px}
.docnav .gh{margin-left:auto}
.doc h1{margin-bottom:18px}.doc h2{margin-top:44px}.doc h3{margin-top:28px}
.doc p,.doc li{max-width:var(--measure)}.doc ul,.doc ol{padding-left:22px}.doc li{margin:4px 0}
.doc pre{background:var(--surface-2);padding:12px 14px;font:13px/1.55 var(--mono);color:var(--ink);overflow:auto;border-radius:var(--radius);margin:12px 0 18px}
.doc pre code{background:transparent;padding:0;font-size:13px;color:inherit}
.doc table{font:14px var(--sans);margin:12px 0 18px;display:block;overflow-x:auto}
.doc table td,.doc table th{padding:8px 14px 8px 0;vertical-align:top}
.doc img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:var(--radius-s)}
.doc blockquote{border-left:2px solid var(--line-2);margin:0 0 18px;padding:4px 18px;color:var(--ink-2);font-style:italic}
.doc hr{border:0;border-top:1px solid var(--line);margin:36px 0}
.doc strong{font-weight:600}
`;

function page(p: (typeof PAGES)[number]): string {
  const md = fs.readFileSync(path.join(ROOT, p.src), "utf8");
  const body = render(md, p.src, p.out);
  const here = path.posix.dirname(p.out);
  const link = (out: string, label: string, on: boolean) => `<a href="${esc(path.posix.relative(here, out) || ".")}"${on ? ' class="on"' : ""}>${esc(label)}</a>`;
  const nav = [...PAGES.map((q) => link(q.out, q.nav, q.out === p.out)), ...EXTRA_NAV.map((q) => link(q.out, q.nav, false))].join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="passk: reliability regression testing for computer-use agents on Solari desktops. Fork one snapshot k times, grade every run inside the VM, report pass@k and pass^k with intervals.">
${FONTS}<style>${CSS}${DOC_CSS}</style></head><body><main>
<nav class="docnav"><b>passk</b>${nav}<a class="gh" href="${GITHUB}">GitHub</a></nav>
<article class="doc">
${body}
</article>
<div class="foot">This page is <code>${esc(p.src)}</code> in the repository, typeset. Built on <a href="https://getsolari.com">Solari</a>.</div>
</main></body></html>`;
}

for (const p of PAGES) {
  const html = page(p);
  fs.mkdirSync(path.dirname(path.join(ROOT, p.out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p.out), html);
  console.log(`${p.out} (${(html.length / 1024).toFixed(0)} KB) from ${p.src}`);
}
