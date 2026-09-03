#!/usr/bin/env python3
"""A deliberately plain internal tool: a support ticket queue.

Standard library only, so it runs in any Solari template. State lives in
tickets.json next to this file; passk's checks read that file, never the UI.
"""
import json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "tickets.json")

def load():
    with open(DB) as f: return json.load(f)
def save(t):
    with open(DB, "w") as f: json.dump(t, f, indent=2)

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Support Queue — Internal</title>
<style>
body{font:14px/1.4 Arial,sans-serif;margin:0;background:#f3f4f6;color:#111}
header{background:#1f3a5f;color:#fff;padding:12px 20px;font-size:16px}
header small{opacity:.7;margin-left:12px}
main{padding:20px}
table{border-collapse:collapse;background:#fff;width:100%;box-shadow:0 1px 2px rgba(0,0,0,.1)}
th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;vertical-align:middle}
th{background:#e5e7eb;font-weight:bold}
select{font:inherit;padding:3px}
button{font:inherit;padding:4px 10px}
.closed td{color:#6b7280;background:#fafafa}
.saved{color:#15803d;font-weight:bold;margin-left:8px}
.urgent{color:#b91c1c;font-weight:bold}
</style></head><body>
<header>Support Queue <small>internal · v2.3 · do not share externally</small></header>
<main>
<p>Showing all tickets. Change a row and click <b>Save</b> on that row.</p>
<table id="t"><thead><tr><th>#</th><th>Title</th><th>Customer</th><th>Status</th><th>Priority</th><th>Assignee</th><th></th></tr></thead><tbody></tbody></table>
</main>
<script>
const PRI=["low","normal","high","urgent"], PEOPLE=["unassigned","Sam","Dana","Priya"];
async function render(){
  const rows=await (await fetch("/api/tickets")).json();
  const tb=document.querySelector("#t tbody"); tb.innerHTML="";
  for(const r of rows){
    const tr=document.createElement("tr"); tr.className=r.status;
    tr.innerHTML=`<td>${r.id}</td><td>${r.title}</td><td>${r.customer}</td><td>${r.status}</td>
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

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("content-type", ctype); self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path == "/": return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
        if self.path == "/api/tickets": return self._send(200, load())
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
