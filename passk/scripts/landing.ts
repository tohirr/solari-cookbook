/**
 * Generate passk/index.html: the published front page, which is the
 * leaderboard in static mode. Every row is read from evidence/; models with
 * no evidence get a "not yet run" row with the command. `passk studio`
 * serves the same board locally with your runs and a working Run button.
 *
 *   npx tsx scripts/landing.ts        # from passk/
 */
import fs from "node:fs";
import path from "node:path";
import { buildShapes, loadBenches, renderBoard, totalsOf } from "../src/report/board.js";

const benches = loadBenches(path.resolve("evidence"), "evidence", "evidence/");
const shapes = buildShapes(benches);
const html = renderBoard({ mode: "static", shapes, totals: totalsOf(benches) });
fs.writeFileSync(path.resolve("index.html"), html);
console.log(`landing: index.html (${(html.length / 1024).toFixed(0)} KB), ${shapes.length} shapes, ${shapes.reduce((a, s) => a + s.rows.length, 0)} rows`);
