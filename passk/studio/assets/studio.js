(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function e(e,t,n=1.96){if(t===0)return{lower:0,upper:1};let r=e/t,i=n*n,a=1+i/t,o=r+i/(2*t),s=n*Math.sqrt(r*(1-r)/t+i/(4*t*t));return{lower:Math.max(0,(o-s)/a),upper:Math.min(1,(o+s)/a)}}function t(t,n=1.96){for(let r=1;r<=1e4;r++)if(e(r,r,n).lower>=t)return r;return 1/0}var n=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),r=e=>`${Math.round(e*100)}%`,i=e=>`${Math.round(e/1e3)}s`,a=(e,t=3)=>e==null?`—`:`$${e.toFixed(t)}`,o=`
:root{
  --bg:#0e0f12;--surface:#15171c;--surface-2:#1b1e25;--line:#262a33;--line-2:#333845;
  --ink:#eceef2;--ink-2:#a3a9b7;--ink-3:#6b7180;
  --good:#22c55e;--good-dim:rgba(34,197,94,.22);--crit:#e5484d;--crit-dim:rgba(229,72,77,.22);--warn:#f5a524;
  --a:#3987e5;--a-dim:rgba(57,135,229,.22);--b:#eb6834;--b-dim:rgba(235,104,52,.22);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --radius:14px;--radius-s:8px;
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
main{max-width:1120px;margin:0 auto;padding:48px 28px 80px}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0 0 6px;font-weight:650}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin:40px 0 14px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:22px}
.brand b{color:var(--ink);font-weight:700;letter-spacing:0;text-transform:none;font-size:13px}
.meta{color:var(--ink-3);font-size:13px;margin-bottom:22px}.meta code{font-family:var(--mono);font-size:12px;color:var(--ink-2)}
.prompt{border-left:3px solid var(--line-2);padding:6px 14px;color:var(--ink-2);margin:0 0 26px;font-size:15px;max-width:820px}
.verdict{font-size:20px;line-height:1.35;letter-spacing:-.01em;margin:0 0 26px;max-width:820px}
.verdict b{font-weight:650}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.kpi b{display:block;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-bottom:6px;font-variant-numeric:tabular-nums}
.kpi span{color:var(--ink-3);font-size:12px;display:block}
.kpi .sub{color:var(--ink-2)}
.dots{display:grid;gap:6px}
.dotrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dotrow em{width:26px;flex:none;font:10px var(--mono);font-style:normal;color:var(--ink-3);text-align:right;padding-right:2px}
.dot{width:22px;height:22px;border-radius:50%;border:2px solid transparent;display:inline-grid;place-items:center;font-size:11px;font-weight:700;color:var(--bg);font-family:var(--mono);text-decoration:none;line-height:1}
a.dot{cursor:pointer}a.dot:hover{outline:2px solid var(--ink-2);outline-offset:1px}
.dot.passed{background:var(--good)}.dot.failed{background:var(--crit)}.dot.errored{background:transparent;border-color:var(--ink-3);color:var(--ink-3)}
.dot.skipped{background:transparent;border-color:var(--line-2);color:var(--ink-3)}
.headline{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.headline b{font-size:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.headline span{color:var(--ink-2);font-size:13px}
.runrow{margin:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
.runrow>summary{list-style:none;display:flex;gap:14px;align-items:center;padding:10px 20px;font-size:13px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.runrow>summary::-webkit-details-marker{display:none}
.runrow>summary b{color:var(--ink);font-weight:600;min-width:64px}
.runrow>summary .more{margin-left:auto;color:var(--ink-3);font-size:12px}
.runrow[open]>summary{border-bottom:1px solid var(--line)}
.runrow>.card{border:0;border-radius:0 0 var(--radius) var(--radius)}
.runrow.attention>summary{cursor:default}
.diff{border-left:3px solid var(--line-2);padding:6px 14px;color:var(--ink-2);margin:0 0 22px;font-size:15px;max-width:820px;line-height:1.6}
.diff del{background:var(--crit-dim);color:var(--crit);text-decoration:line-through;border-radius:3px;padding:0 2px}
.diff ins{background:var(--good-dim);color:var(--good);text-decoration:none;border-radius:3px;padding:0 2px}
.checks .raw{color:var(--ink-3);font-size:11px;margin-left:6px;cursor:help}
.legend{display:flex;gap:16px;color:var(--ink-3);font-size:12px;margin-top:10px;flex-wrap:wrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.range{position:relative;height:10px;background:var(--surface-2);border-radius:5px;margin:14px 0 6px}
.range i{position:absolute;top:0;bottom:0;border-radius:5px;background:var(--good-dim)}
.range b{position:absolute;top:-4px;width:18px;height:18px;border-radius:50%;background:var(--good);border:3px solid var(--surface);transform:translateX(-50%)}
.range-labels{display:flex;justify-content:space-between;color:var(--ink-3);font-size:11px;font-family:var(--mono)}
.strip{position:relative;height:44px;margin:6px 0 2px}
.strip .axis{position:absolute;left:0;right:0;top:22px;height:1px;background:var(--line-2)}
.strip .tick{position:absolute;top:28px;transform:translateX(-50%);color:var(--ink-3);font-size:11px;font-family:var(--mono)}
.strip .pt{position:absolute;top:14px;width:16px;height:16px;border-radius:50%;transform:translateX(-50%);border:2px solid var(--surface);cursor:default}
.strip .pt.passed{background:var(--good)}.strip .pt.failed{background:var(--crit)}
.strip .pt.a{background:var(--a)}.strip .pt.b{background:var(--b)}
.strip .pt.hollow{background:transparent!important;border:2.5px solid;box-shadow:inset 0 0 0 2px var(--surface)}.strip .pt.a.hollow{border-color:var(--a)}.strip .pt.b.hollow{border-color:var(--b)}
.strip .med{position:absolute;top:8px;width:2px;height:28px;background:var(--ink);opacity:.7;transform:translateX(-50%)}
.strip .med.a{background:var(--a);opacity:1}.strip .med.b{background:var(--b);opacity:1}.strip .med.b:after{top:auto;bottom:-16px}
.strip .med:after{content:attr(data-label);position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--ink-2);font-family:var(--mono);white-space:nowrap}
.runs{display:grid;gap:12px}
.run{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:start}.run>div{min-width:0}
.run .id{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.run .id b{display:block;font-size:15px;color:var(--ink);font-family:var(--sans);font-weight:600;margin-bottom:2px}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.02em}
.pill.passed{background:var(--good-dim);color:var(--good)}.pill.failed{background:var(--crit-dim);color:var(--crit)}.pill.errored{background:var(--surface-2);color:var(--ink-2)}
.pill.a{background:var(--a-dim);color:var(--a)}.pill.b{background:var(--b-dim);color:var(--b)}
.pill.neutral{background:var(--surface-2);color:var(--ink-2)}
.checks{display:flex;flex-direction:column;gap:3px;font-size:12px;font-family:var(--mono);color:var(--ink-2)}
.checks .ok{color:var(--good)}.checks .bad{color:var(--crit)}
.checks .detail{color:var(--ink-3);white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}
.film{display:flex;gap:6px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:thin}
.film a{flex:none;position:relative}
.film img{height:84px;border-radius:6px;border:1px solid var(--line);display:block;background:#000}
.film a.final img{border-color:var(--good)}.film a.diverge img{border-color:var(--warn);box-shadow:0 0 0 2px var(--warn)}
.film em{position:absolute;left:4px;bottom:4px;font:10px var(--mono);font-style:normal;background:rgba(0,0,0,.65);color:#fff;padding:1px 5px;border-radius:4px}
.hyp{overflow-wrap:anywhere;margin-top:10px;padding:10px 12px;background:var(--surface-2);border-radius:var(--radius-s);font-size:13px;color:var(--ink-2)}
.hyp b{color:var(--ink);font-weight:600}
details{margin-top:8px}summary{cursor:pointer;color:var(--ink-3);font-size:12px}
pre{white-space:pre-wrap;font:12px/1.5 var(--mono);color:var(--ink-2);margin:8px 0 0}
.foot{color:var(--ink-3);font-size:12px;margin-top:40px;border-top:1px solid var(--line);padding-top:16px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.two{grid-template-columns:1fr}.run{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:9px 10px;text-align:left;border-top:1px solid var(--line);vertical-align:top;font-size:13px}th{color:var(--ink-3);font-weight:500;border-top:0;font-size:12px}
td.num,th.num{text-align:right;font-family:var(--mono);font-size:12.5px}
.delta.up{color:var(--good)}.delta.down{color:var(--crit)}.delta.flat{color:var(--ink-3)}
.note{color:var(--ink-3);font-size:12.5px;margin-top:8px}
.tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);font:12px var(--mono);padding:5px 8px;border-radius:6px;transform:translate(-50%,-130%);opacity:0;transition:opacity .08s;white-space:nowrap;z-index:9}
`,s=`
<div class="tip" id="tip"></div>
<script>
(function(){var t=document.getElementById('tip');document.addEventListener('mousemove',function(e){var el=e.target.closest&&e.target.closest('[data-tip]');if(!el){t.style.opacity=0;return;}t.textContent=el.getAttribute('data-tip');t.style.left=e.clientX+'px';t.style.top=e.clientY+'px';t.style.opacity=1;});})();
<\/script>`;function c(e,t=0,r=``,i){let a={passed:`✓`,failed:`×`,solari:`!`,provider:`M`,verifier:`?`,agent:`×`},o=e.map(e=>{let t=e.status===`errored`?e.errorKind??(e.steps===0?`solari`:`agent`):null,o=t?`run ${e.runIndex}: lost to ${t===`solari`?`desktop infrastructure`:t===`provider`?`the model provider`:t===`verifier`?`a checker crash`:`an agent error`}`:`run ${e.runIndex}: ${e.status} in ${e.steps} steps${e.stoppedBy===`safety_check`?` (stopped on a safety check)`:``}`,s=t?a[t]??`!`:a[e.status]??``,c=`class="dot ${e.status} ${r}" data-tip="${n(o)}" aria-label="${n(o)}"`;return i?`<a ${c} href="${n(i(e.runIndex))}">${s}</a>`:`<span ${c}>${s}</span>`});for(let e=0;e<t;e++)o.push(`<span class="dot skipped" data-tip="skipped: budget reached" aria-label="skipped: budget reached"></span>`);if(o.length<=10)return`<div class="dots"><div class="dotrow">${o.join(``)}</div></div>`;let s=[];for(let e=0;e<o.length;e+=10)s.push(`<div class="dotrow"><em>${e}</em>${o.slice(e,e+10).join(``)}</div>`);return`<div class="dots">${s.join(``)}</div>`}var l=`../evidence`,u=.7,d=`
.bar{position:sticky;top:0;z-index:5;background:rgba(14,15,18,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar .in{max-width:1120px;margin:0 auto;padding:0 28px;height:56px;display:flex;align-items:center;gap:26px}
.bar .logo{font-weight:700;font-size:15px;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:8px}
.bar .logo i{width:12px;height:12px;border-radius:50%;background:var(--good);display:inline-block}
.bar nav{display:flex;gap:4px}
.bar nav a{color:var(--ink-2);text-decoration:none;font-size:13.5px;padding:6px 10px;border-radius:8px}
.bar nav a.on{color:var(--ink);background:var(--surface-2)}
.bar .right{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ink-3)}
.bar nav a{white-space:nowrap}
@media(max-width:960px){.bar .right span{display:none}.bar .in{gap:14px}}
main.studio{padding-top:34px}
.btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);background:transparent;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:var(--sans)}
.btn:hover{background:var(--surface-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#141306}
.btn.primary:hover{filter:brightness(1.06)}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.btn.sm{font-size:12px;padding:5px 10px}
.hero{margin:0 0 26px}.hero h1{font-size:34px;line-height:1.1;margin:0 0 8px}.hero p{color:var(--ink-2);font-size:15px;max-width:760px;margin:0}
.strip{display:flex;gap:26px;flex-wrap:wrap;padding:14px 0 22px;border-bottom:1px solid var(--line);margin-bottom:22px}
.strip div{font-size:13px;color:var(--ink-3)}.strip b{display:block;font-size:22px;color:var(--ink);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:14px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.tcard h3{margin:0;font-size:17px;font-weight:650;letter-spacing:-.01em}
.tcard .meta{margin:4px 0 14px}
.tcard .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:14px 0 4px}
.tcard .head b{font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tcard .head span{color:var(--ink-2);font-size:13px}
.tcard .actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
.pill.good{background:var(--good-dim);color:var(--good)}.pill.warn{background:rgba(245,165,36,.18);color:var(--warn)}.pill.crit{background:var(--crit-dim);color:var(--crit)}
.section{margin:34px 0 0}
.two>div{min-width:0}
.plan{display:grid;grid-template-columns:380px 1fr;gap:16px;align-items:start}
@media(max-width:860px){.plan{grid-template-columns:1fr}}
.field{display:grid;gap:5px;margin-bottom:14px}.field label{font-size:12px;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase}
.field select,.field input{width:100%;min-width:0;background:var(--surface-2);border:1px solid var(--line-2);color:var(--ink);border-radius:8px;padding:8px 10px;font:14px var(--sans)}
.field .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.proof{display:grid;gap:12px}
.proof .card b.big{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-bottom:4px}
.proof .card span{color:var(--ink-2);font-size:13px}
.cmd{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;font:12.5px/1.6 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px}
.frame{width:100%;height:calc(100vh - 96px);border:0;display:block;background:var(--bg)}
.framebar{max-width:1120px;margin:0 auto;padding:10px 28px;display:flex;gap:14px;align-items:center;font-size:13px;color:var(--ink-3)}
.framebar a{color:var(--ink-2)}
table a{color:var(--ink-2)}
.yaml{font:12.5px/1.55 var(--mono);color:var(--ink-2);background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-s);padding:14px 16px;white-space:pre;overflow-x:auto;margin:0}
.checklist{display:grid;gap:6px;font-size:13.5px}.checklist code{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.empty{color:var(--ink-3);font-size:13.5px;padding:24px;border:1px dashed var(--line-2);border-radius:var(--radius);text-align:center}
`,f,p=(e,t)=>t.startedAt.localeCompare(e.startedAt),m=e=>f.benches.filter(t=>t.taskId===e).sort(p),h=e=>m(e)[0],g=e=>e.slice(0,10),_=e=>e.runs.filter(e=>e.status!==`errored`||e.steps!==0),v=(e,t=``)=>c(e.runs,e.metrics.skipped,t,t=>`#/report/${e.dir}?run=${t}`);function y(e){if(e.name)return e.name;let t=`path`in e?e.path:`cmd`in e?`${e.cmd} ${(e.args??[]).join(` `)}`.trim():``;return`${e.type} ${t}`.trim()}function b(e){let t=e.metrics;return e.status===`complete`?t.n===0?{text:`nothing scorable`,cls:`crit`}:t.passAt1Lower>=u?{text:`clears the ${r(u)} floor`,cls:`good`}:t.passed===t.n?{text:`all passed · sample too small to prove ${r(u)}`,cls:`warn`}:t.passAt1>=u?{text:`${r(t.passAt1)} observed · floor not proven`,cls:`warn`}:{text:`below the ${r(u)} floor`,cls:`crit`}:{text:e.status,cls:`neutral`}}var x=e=>`<span class="pill ${e.cls}">${n(e.text)}</span>`,S=e=>e.passPowK[String(Math.min(5,e.n))]??0;function C(){let e=[...f.tasks].sort((e,t)=>(h(t.id)?.startedAt??``).localeCompare(h(e.id)?.startedAt??``)),t=f.benches.reduce((e,t)=>e+t.runs.length,0),i=f.benches.reduce((e,t)=>e+t.metrics.totalCostUsd,0),o=e.map(e=>{let t=h(e.id);if(!t)return`<div class="card tcard"><h3>${n(e.name)}</h3><div class="meta">not yet run</div><div class="actions"><a class="btn sm" href="#/tasks/${n(e.id)}">Task</a><a class="btn sm primary" href="#/new?task=${n(e.id)}">Plan a run</a></div></div>`;let i=t.metrics;return`<div class="card tcard">
      <h3><a href="#/tasks/${n(e.id)}" style="text-decoration:none">${n(e.name)}</a></h3>
      <div class="meta"><code>${n(t.model)}</code> · k=${t.k} · ${g(t.startedAt)}${m(e.id).length>1?` · ${m(e.id).length} experiments`:``}</div>
      ${v(t)}
      <div class="head"><b>${i.passed}/${i.n} passed</b><span>${r(i.passAt1Lower)}–${r(i.passAt1Upper)} plausible · pass^${Math.min(5,i.n)||1} ${r(S(i))} · ${a(i.totalCostUsd,2)}</span></div>
      ${x(b(t))}
      <div class="actions"><a class="btn sm" href="#/report/${n(t.dir)}">Report</a><a class="btn sm" href="#/tasks/${n(e.id)}">History</a>${f.compares.some(e=>e.a.dir===t.dir||e.b.dir===t.dir)?`<a class="btn sm" href="#/comparisons">Comparisons</a>`:``}<a class="btn sm primary" href="#/new?task=${n(e.id)}">Run again</a></div>
    </div>`}).join(``);return`<div class="hero"><h1>Reliability tests</h1><p>Each task is run repeatedly from one Solari snapshot, graded inside the VM, and reported with its uncertainty. Every number here is read from the published evidence.</p></div>
  <div class="strip"><div><b>${f.tasks.length}</b>tasks</div><div><b>${f.benches.length}</b>experiments</div><div><b>${t}</b>verified runs</div><div><b>${f.compares.length}</b>controlled comparisons</div><div><b>${a(i,2)}</b>model spend, all of it</div></div>
  <div class="grid">${o}</div>`}function w(e){let t=f.tasks.find(t=>t.id===e);if(!t)return`<div class="empty">No task “${n(e)}”.</div>`;let i=m(e),o=f.compares.filter(e=>i.some(t=>t.dir===e.a.dir||t.dir===e.b.dir)),s=i.map(e=>`<tr><td>${g(e.startedAt)}</td><td><code>${n(e.model)}</code></td><td class="num">${e.k}</td><td class="num">${e.metrics.passed}/${e.metrics.n}</td><td class="num">${r(e.metrics.passAt1Lower)}–${r(e.metrics.passAt1Upper)}</td><td class="num">${e.metrics.medianSteps}</td><td class="num">${a(e.metrics.totalCostUsd,2)}</td><td>${x(b(e))}</td><td><a href="#/report/${n(e.dir)}">report</a></td></tr>`).join(``);return`<div class="hero"><div class="meta"><a href="#/">Tasks</a> / ${n(t.id)}</div><h1>${n(t.name)}</h1>
    <p><span class="pill neutral">${n(t.template)} template</span> <span class="pill neutral">${t.maxSteps?`${t.maxSteps} step cap`:`no step cap`}</span> <span class="pill ${t.hasGolden?`good`:`warn`}">${t.hasGolden?`golden steps: verifier can be validated`:`no golden steps`}</span></p></div>
  <div class="two">
    <div><h2>Prompt</h2><blockquote class="prompt">${n(t.prompt)}</blockquote>
      <h2>Checks · graded inside the VM</h2><div class="checklist">${t.checks.length?t.checks.map(e=>`<div>✓ ${n(y(e))}${e.invariant?` <span class="pill neutral">invariant</span>`:``}${e.name?`<br><code>${n(JSON.stringify({...e,name:void 0}))}</code>`:``}</div>`).join(``):`<div class="empty">Task file not in this build; checks are recorded in each report's provenance.</div>`}</div></div>
    <div><h2>Task file</h2>${t.yaml?`<pre class="yaml">${n(t.yaml)}</pre>`:`<div class="empty">not included</div>`}</div>
  </div>
  <div class="section"><h2 style="margin-top:0">Experiments (${i.length})</h2>
  ${i.length?`<div class="card" style="padding:0;overflow-x:auto"><table><tr><th>date</th><th>model</th><th class="num">k</th><th class="num">passed</th><th class="num">95% interval</th><th class="num">median steps</th><th class="num">spend</th><th></th><th></th></tr>${s}</table></div>`:`<div class="empty">No experiments yet.</div>`}
  <div style="margin-top:14px;display:flex;gap:8px"><a class="btn primary" href="#/new?task=${n(t.id)}">Plan a run</a>${i.length>=2?`<span class="note" style="margin:0;align-self:center">Compare two: <code>npm run passk compare ${n(l)}/${n(i[1].dir)} ${n(l)}/${n(i[0].dir)}</code></span>`:``}</div></div>
  ${o.length?`<div class="section"><h2 style="margin-top:0">Comparisons</h2>${E(o)}</div>`:``}`}function T(){return`<div class="hero"><h1>Experiments</h1><p>One row per bench: a task, run k times from one snapshot under one configuration.</p></div>
  <div class="card" style="padding:0;overflow-x:auto"><table><tr><th>date</th><th>task</th><th>model</th><th class="num">k</th><th class="num">passed</th><th class="num">95% interval</th><th class="num">pass^5</th><th class="num">median steps</th><th class="num">spend</th><th></th><th></th></tr>${[...f.benches].sort(p).map(e=>`<tr><td>${g(e.startedAt)}</td><td><a href="#/tasks/${n(e.taskId)}">${n(e.taskName)}</a></td><td><code>${n(e.model)}</code></td><td class="num">${e.k}</td><td class="num">${e.metrics.passed}/${e.metrics.n}</td><td class="num">${r(e.metrics.passAt1Lower)}–${r(e.metrics.passAt1Upper)}</td><td class="num">${r(S(e.metrics))}</td><td class="num">${e.metrics.medianSteps}</td><td class="num">${a(e.metrics.totalCostUsd,2)}</td><td>${x(b(e))}</td><td><a href="#/report/${n(e.dir)}">report</a></td></tr>`).join(``)}</table></div>`}function E(e){return`<div class="grid">${e.map(e=>{let t=Math.round(e.delta.passAt1*100),r=e.fisherP<.05?`<span class="pill good">unlikely to be noise · p ${e.fisherP.toFixed(3)}</span>`:`<span class="pill neutral">consistent with noise · p ${e.fisherP.toFixed(2)}</span>`;return`<div class="card tcard"><h3>${n(e.changed.length?e.changed.join(` and `):`nothing`)} changed</h3>
      <div class="meta">held fixed: ${e.heldFixed.map(e=>`<code>${n(e)}</code>`).join(` `)}</div>
      <div style="font-size:13.5px;color:var(--ink-2)"><span class="pill a">A</span> ${n(e.a.taskName)}<br><span class="pill b">B</span> ${n(e.b.taskName)}</div>
      <div class="head"><b>${n(e.passes.a)} → ${n(e.passes.b)}</b><span>${t===0?`±0`:`${t>0?`+`:`−`}${Math.abs(t)}`} pts · pass^${e.powK} ${e.delta.passPowK===0?`±0`:`${e.delta.passPowK>0?`+`:`−`}${Math.abs(Math.round(e.delta.passPowK*100))}`} pts · ${e.delta.medianSteps===0?`same`:`${e.delta.medianSteps>0?`+`:`−`}${Math.abs(e.delta.medianSteps)}`} median steps</span></div>
      ${r}${e.warnings.map(e=>`<div class="note" style="color:var(--warn)">⚠ ${n(e)}</div>`).join(``)}
      <div class="actions"><a class="btn sm primary" href="#/comparison/${n(e.dir)}">Open comparison</a><a class="btn sm" href="#/report/${n(e.a.dir)}">A</a><a class="btn sm" href="#/report/${n(e.b.dir)}">B</a></div></div>`}).join(``)}</div>`}function D(){return`<div class="hero"><h1>Controlled comparisons</h1><p>Two benches from the same snapshot with one thing changed. The page says what was held fixed, what moved, and whether the difference could be noise.</p></div>
  ${f.compares.length?E(f.compares):`<div class="empty">No comparisons in this evidence set.</div>`}`}function O(o){let s=o.get(`task`)??f.tasks[0]?.id??``,c=Math.max(1,Number(o.get(`k`)??10)),l=Math.max(1,Number(o.get(`c`)??2)),d=Number(o.get(`budget`)??1),g=Number(o.get(`floor`)??u),v=h(s),y=o.get(`model`)??v?.model??f.models[0]??``,b=f.tasks.find(e=>e.id===s),x=(e,t,r)=>`<option value="${n(e)}"${e===r?` selected`:``}>${n(t)}</option>`,S=new Set(f.benches.map(e=>e.model)),C=`<div class="card">
    <div class="field"><label>Task</label><select name="task">${f.tasks.map(e=>x(e.id,e.name,s)).join(``)}</select></div>
    <div class="field"><label>Model</label><select name="model">${f.models.map(e=>x(e,S.has(e)?e:`${e} · untested`,y)).join(``)}</select></div>
    <div class="field"><div class="row"><div><label>Runs (k)</label><input name="k" type="number" min="1" max="200" value="${c}"></div><div><label>Concurrency</label><input name="c" type="number" min="1" max="10" value="${l}"></div></div></div>
    <div class="field"><div class="row"><div><label>Budget, USD</label><input name="budget" type="number" min="0" step="0.25" value="${d}"></div><div><label>Reliability floor</label><input name="floor" type="number" min="0.5" max="0.99" step="0.05" value="${g}"></div></div></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:6px"><button class="btn primary" disabled title="This is the static build. Start runs from the local studio or with the command on the right.">Start run</button><span class="note" style="margin:0">static build · read only</span></div>
  </div>`,w=e(c,c).lower,T=t(g),E=m(s).find(e=>e.model===y),D=v,O=f.benches.filter(e=>e.model===y).sort(p)[0],k=E??D??O,A=E?`from this task's last bench on this model`:D?`from this task's last bench, on <code>${n(D.model)}</code> · this model may differ`:O?`from <code>${n(O.taskName)}</code> on this model · a different task`:``,j=k?k.metrics.totalCostUsd/Math.max(1,_(k).length):null,M=j===null?null:j*c,N=j?Math.floor(d/j):null,P=k?(k.metrics.medianDurationMs||0)*Math.ceil(c/l):null,F=`<div class="proof">
    <div class="card"><b class="big">${r(w)}</b><span>is the most ${c} runs can prove: if all ${c} pass, the pass rate is at least ${r(w)} at 95% confidence (Wilson lower bound).</span></div>
    <div class="card"><b class="big">${T} runs</b><span>all passing are needed to establish the ${r(g)} floor${c>=T?`; k=${c} is enough`:`; k=${c} cannot, whatever the outcome`}.</span></div>
    <div class="card"><b class="big">${M===null?`—`:a(M,2)}</b><span>estimated model spend for ${c} runs${j===null?` · no prior bench to estimate from`:` at ${a(j)} per attempted run, ${A}`}.${N!==null&&N<c?` <b style="color:var(--warn)">The $${d} budget stops the bench after about ${N} runs.</b>`:``}</span></div>
    <div class="card"><b class="big">${P===null?`—`:i(P).replace(/^(\d+)s$/,(e,t)=>`${Math.round(Number(t)/60)} min`)}</b><span>rough wall time: median run ${k?i(k.metrics.medianDurationMs):`?`} × ${Math.ceil(c/l)} waves at concurrency ${l}.</span></div>
    <div class="card"><span>To run this locally, from <code>passk/</code>:</span><div class="cmd">PASSK_MODEL=${n(y)} npm run passk run tasks/${n(s)}.yaml -- --k ${c} --concurrency ${l} --budget ${d} --require-lower ${g}</div><span class="note">Validate the task first if it is new: <code>npm run passk validate tasks/${n(s)}.yaml</code>. The gate flag makes the bench exit non-zero if the floor is not proven.</span></div>
  </div>`;return`<div class="hero"><h1>Plan a run</h1><p>Decide k and the budget from what the numbers can prove, not from habit. ${b?`Task: <b>${n(b.name)}</b>.`:``}</p></div>
  <form id="plan" class="plan">${C}${F}</form>`}function k(e,t,r){let i=e===`report`?`report.html`:`compare.html`,a=r.get(`run`),o=`${l}/${t}/${i}${a===null?``:`#run-${a}`}`,s=f.benches.find(e=>e.dir===t);return`<div class="framebar"><a href="#/">Tasks</a> / ${s?`<a href="#/tasks/${n(s.taskId)}">${n(s.taskName)}</a>`:`<a href="#/comparisons">comparisons</a>`} / ${n(t)} <a href="${n(o)}" target="_blank" style="margin-left:auto">open in its own tab ↗</a></div><iframe class="frame" src="${n(o)}" title="${n(t)}"></iframe>`}function A(e,t,r=!1){return`<div class="bar"><div class="in"><a class="logo" href="#/"><i></i>passk <span style="color:var(--ink-3);font-weight:500">studio</span></a><nav>${[[`#/`,`Tasks`,`tasks`],[`#/experiments`,`Experiments`,`experiments`],[`#/comparisons`,`Comparisons`,`comparisons`],[`#/new`,`Plan a run`,`new`]].map(([e,n,r])=>`<a href="${e}" class="${r===t?`on`:``}">${n}</a>`).join(``)}</nav><div class="right"><span>static · read from <code>${n(f.evidenceDir)}</code></span><a class="btn sm" href="../evidence/index.html">showcase</a><a class="btn sm" href="https://github.com/tohirr/solari-cookbook/tree/main/passk">GitHub</a></div></div></div>
  ${r?e:`<main class="studio">${e}</main>`}`}function j(){let e=location.hash.replace(/^#\/?/,``),[t,r=``]=e.split(`?`),i=new URLSearchParams(r),a=t.split(`/`).filter(Boolean),o=document.getElementById(`app`),s;s=a.length===0?A(C(),`tasks`):a[0]===`tasks`&&a[1]?A(w(decodeURIComponent(a[1])),`tasks`):a[0]===`experiments`?A(T(),`experiments`):a[0]===`comparisons`?A(D(),`comparisons`):a[0]===`new`?A(O(i),`new`):(a[0]===`report`||a[0]===`comparison`)&&a[1]?A(k(a[0],decodeURIComponent(a[1]),i),a[0]===`report`?`experiments`:`comparisons`,!0):A(`<div class="empty">Nothing at <code>#/${n(e)}</code>.</div>`,``),o.innerHTML=s,(!a.length||a[0]!==`report`)&&window.scrollTo(0,0);let c=document.getElementById(`plan`);c&&c.addEventListener(`input`,()=>{let e=new FormData(c),t=new URLSearchParams;for(let[n,r]of e.entries())t.set(n,String(r));location.hash=`#/new?${t.toString()}`})}async function M(){let e=document.createElement(`style`);e.textContent=`${o}\n:root{--accent:#f5c518}\nmain{padding-top:0}\n${d}`,document.head.appendChild(e);let t=await fetch(`./data.json`);if(!t.ok){document.getElementById(`app`).innerHTML=`<main><div class="empty">data.json is missing. Run <code>npm run studio:data</code> and rebuild.</div></main>`;return}f=await t.json(),document.body.insertAdjacentHTML(`beforeend`,s),addEventListener(`hashchange`,j),j()}M();