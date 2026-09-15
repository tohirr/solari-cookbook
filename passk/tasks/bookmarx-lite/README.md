# bookmarx-in-a-box

[bookmarx](https://bookmarx.space) is a search over saved posts. The three
`bookmarx-*.yaml` tasks that run against the live demo can only ever read
it: ten forks each deleting from one Postgres is the unsupported case in
[the manual](../../docs/TASKS.md#what-passk-can-and-cannot-do-today), since
a snapshot resets the VM and not the database. The task worth benching —
sweeping a library for what should not be shown in public — mutates. So
the product runs inside the snapshot.

The desktop has Python 3, Chrome, and half a gigabyte of disk, so it does not
get Node or Postgres. It gets:

| File | What |
| --- | --- |
| `bookmarx-box.tar.gz` | The export from `pnpm demo:export` in the bookmarx repo: the real `/box` and `/box/triage` pages prerendered to HTML with their static chunks, one small JPEG per picture and avatar, `seed.json` (269 posts as the API returns them, plus the lexemes Postgres indexed for each and its embedding, plus precomputed embeddings for the task queries), and `expected.json`, the review queue's answer key. Built locally; not committed, because the queue's removal targets are real posts. |
| `server.py` | Serves the pages and answers `/api/...` in the standard library. Retrieval follows `src/server/search/` in bookmarx: IDF-weighted term coverage with the 0.25 floor and the filler list, cosine with the 0.62 floor, reciprocal rank fusion with the length-dependent weights, the boosts, the reasons on each card and the trace behind the inspector. The Porter2 stemmer in it agrees with Postgres's `english_stem` on every word in the seed (5,255 checked). State the agent changes goes to `state.json`. |
| `check.py` | One fact per invocation, from `state.json` and `expected.json`: a target is removed, a guard is present, nothing beyond the targets is removed, every queued post is decided, a result was clicked. Never the screen. |
| `golden.py` | The correct outcome of the review task through the same API the page uses, so `validate` can prove the checks. |

Two departures from the live ranker, both in `server.py`'s header: the
vector half answers only queries whose embeddings the export precomputed
(anything else runs keyword-only, as the live site does without its key),
and `ts_rank_cd`, which only breaks ties between documents of equal
coverage, is approximated by a weighted count of matched occurrences.

## The tasks

| Task | What it exercises |
| --- | --- |
| `bookmarx-box-lookup` | A four-word memory; the post ranks first. Graded by the click the app records. |
| `bookmarx-box-paraphrase` | A fifteen-word paraphrase sharing no word with the post; ranks first in the box. |
| `bookmarx-box-deep` | A memory that ranks the post twenty-fourth: the agent has to page or narrow. |
| `bookmarx-triage` | Seventeen queued posts, nine to remove across the rubric's categories and eight clean guards that look risky. Nineteen checks, one fact each, named by category and never by post. |
| `bookmarx-triage-keep` | The same, with "when unsure, keep it" added to the prompt, for `passk compare`. |

## Rebuilding

```
cd ../bookmarx && pnpm demo:export -- --passk ../solari-cookbook/passk/tasks/bookmarx-lite
cd ../solari-cookbook/passk && npx tsx src/cli.ts validate tasks/bookmarx-triage.yaml --prepare
```

Re-prepare the snapshot whenever the export changes; forks start from the
snapshot, not from the tarball.
