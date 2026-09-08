# passk studio

A browser front for the evidence folder: tasks, the experiments run on them,
the controlled comparisons between experiments, and a planner that says what
a proposed run can prove and what it will cost before anyone spends a cent.

This build is **static and read-only**. Everything on screen comes from
`data.json`, generated from the bench and comparison files, and the reports it
opens are the ones passk wrote. It cannot say anything the evidence does not.
Starting runs is the job of the local studio (`passk serve`), which is not
built yet; until then the planner prints the exact command to run.

```bash
npm run studio:build      # regenerate data.json and rebuild studio/index.html + studio/assets/
python3 -m http.server 8765   # from passk/, then open http://localhost:8765/studio/
```

`studio/index.html`, `studio/assets/` and `studio/data.json` are committed on
purpose: GitHub Pages serves them at `/passk/studio/`. Source lives in
`studio/app/`; it imports the report theme and the metrics straight from the
engine's `src/`, so the numbers and the look are the report's own.
