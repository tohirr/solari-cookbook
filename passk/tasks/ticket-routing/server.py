#!/usr/bin/env python3
"""A plain internal tool with two pages: the support queue and the team's
routing table. Standard library only. State lives in tickets.json next to
this file; passk's checks read that file, never the UI. "Today" is fixed so
every fork sees the same dates.
"""
import json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "tickets.json")
TEAM = os.path.join(HERE, "team.json")
TODAY = "2026-09-10"

def load():
    with open(DB) as f: return json.load(f)
def save(t):
    with open(DB, "w") as f: json.dump(t, f, indent=2)
def team():
    with open(TEAM) as f: return json.load(f)

CSS = """
body{font:14px/1.4 Arial,sans-serif;margin:0;background:#f3f4f6;color:#111}
header{background:#1f3a5f;color:#fff;padding:12px 20px;font-size:16px;display:flex;align-items:center;gap:18px}
header small{opacity:.7}
header nav a{color:#fff;margin-right:14px;text-decoration:none;opacity:.85}
header nav a.on{text-decoration:underline;opacity:1}
header .today{margin-left:auto;font-size:13px;opacity:.9}
main{padding:20px}
table{border-collapse:collapse;background:#fff;width:100%;box-shadow:0 1px 2px rgba(0,0,0,.1)}
th,td{border:1px solid #d1d5db;padding:7px 10px;text-align:left;vertical-align:middle}
th{background:#e5e7eb;font-weight:bold}
select{font:inherit;padding:3px}
button{font:inherit;padding:4px 10px}
.closed td{color:#6b7280;background:#fafafa}
.saved{color:#15803d;font-weight:bold;margin-left:8px}
"""
HEAD = lambda on: f"""<!doctype html><html><head><meta charset="utf-8"><title>Support Queue — Internal</title><style>{CSS}</style></head><body>
<header>Support Queue <small>internal · v2.4</small><nav><a href="/" class="{'on' if on=='queue' else ''}">Queue</a><a href="/team" class="{'on' if on=='team' else ''}">Team</a></nav><span class="today">Today: {TODAY}</span></header><main>"""

QUEUE = HEAD("queue") + """
<p>Showing all tickets. Change a row and click <b>Save</b> on that row.</p>
<table id="t"><thead><tr><th>#</th><th>Title</th><th>Customer</th><th>Opened</th><th>Status</th><th>Priority</th><th>Assignee</th><th></th></tr></thead><tbody></tbody></table>
</main>
<script>
const PRI=["low","normal","high","urgent"], PEOPLE=["unassigned","Sam","Dana","Priya","Lee"];
async function render(){
  const rows=await (await fetch("/api/tickets")).json();
  const tb=document.querySelector("#t tbody"); tb.innerHTML="";
  for(const r of rows){
    const tr=document.createElement("tr"); tr.className=r.status;
    tr.innerHTML=`<td>${r.id}</td><td>${r.title}</td><td>${r.customer}</td><td>${r.opened}</td><td>${r.status}</td>
      <td><select data-f="priority">${PRI.map(p=>`<option ${p===r.priority?"selected":""}>${p}</option>`).join("")}</select></td>
      <td><select data-f="assignee">${PEOPLE.map(p=>`<option ${p===r.assignee?"selected":""}>${p}</option>`).join("")}</select></td>
      <td><button>Save</button><span class="saved"></span></td>`;
    tr.querySelector("button").onclick=async()=>{
      const body={}; tr.querySelectorAll("select").forEach(s=>body[s.dataset.f]=s.value);
      const res=await fetch("/api/tickets/"+r.id,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      tr.querySelector(".saved").textContent=res.ok?"Saved":"Error";
      setTimeout(()=>tr.querySelector(".saved").textContent="",2500);
    };
    tb.appendChild(tr);
  }
}
render();
</script></body></html>"""

def team_page():
    rows = "".join(f"<tr><td>{r['customer']}</td><td>{r['owner']}</td><td>{r['plan']}</td></tr>" for r in team())
    return HEAD("team") + f"""
<p>Account owners. Tickets are routed to the customer's owner.</p>
<table><thead><tr><th>Customer</th><th>Account owner</th><th>Plan</th></tr></thead><tbody>{rows}</tbody></table>
</main></body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("content-type", ctype); self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path == "/": return self._send(200, QUEUE.encode(), "text/html; charset=utf-8")
        if self.path == "/team": return self._send(200, team_page().encode(), "text/html; charset=utf-8")
        if self.path == "/api/tickets": return self._send(200, load())
        if self.path == "/api/team": return self._send(200, team())
        self._send(404, {"error": "not found"})
    def do_POST(self):
        if not self.path.startswith("/api/tickets/"): return self._send(404, {"error": "not found"})
        tid = int(self.path.rsplit("/", 1)[1])
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)) or 0) or b"{}")
        tickets = load()
        for t in tickets:
            if t["id"] == tid:
                for k in ("priority", "assignee", "status"):
                    if k in body: t[k] = body[k]
                save(tickets); return self._send(200, t)
        self._send(404, {"error": "no such ticket"})

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8080), H).serve_forever()
