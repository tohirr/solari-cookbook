#!/usr/bin/env python3
"""bookmarx-in-a-box: the product's API, in the standard library.

Serves the prerendered /box and /box/triage pages that `pnpm demo:export`
writes in the bookmarx repo, and answers their same-origin /api calls over
the library in seed.json. Retrieval follows src/server/search/ in bookmarx
step for step — the keyword half's IDF-weighted coverage with its 0.25 floor
and filler list, the vector half's cosine with its 0.62 floor, reciprocal
rank fusion with the length-dependent weights, the boosts, the reasons and
the trace — so what the agent sees ranked is what the live site would rank,
over the slice of the library the box carries.

Two deliberate departures, both documented where they happen:
  * the query embedding needs a model the desktop does not have, so the
    vector half answers only the queries whose embeddings the export
    precomputed (seed.json "queries"); any other query runs keyword-only,
    exactly as the live site does when its embedding key is missing;
  * `ts_rank_cd`, which the keyword half uses only to break ties between
    documents of equal coverage, is approximated by a weighted count of
    the matched terms' occurrences.

State the agent changes lives in state.json next to this file: review
decisions (which is what removes a post from the library) and result clicks.
passk's checks read that file, never the screen.

    python3 server.py 8080 /root/app/box
"""
import json, math, os, re, sys, threading, time, base64, mimetypes
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
BOX = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, "box")
SITE = os.path.join(BOX, "site")
MEDIA = os.path.join(BOX, "media")
SEED = os.path.join(BOX, "seed.json")
STATE = os.path.join(HERE, "state.json")

# ── Constants, as in bookmarx ────────────────────────────────────────────
DEFAULT_LIMIT, MAX_LIMIT = 20, 50
CANDIDATE_MULTIPLIER, MAX_CANDIDATES = 5, 200
MAX_SELECTIVE_DF_RATIO = 0.05          # full-text.ts
MIN_COVERAGE = 0.25                    # full-text.ts
MIN_SIMILARITY = 0.62                  # semantic.ts
RRF_K = 60                             # ranking.ts
AUTHOR_BOOST, CLICK_BOOST = 0.1, 0.08
RECENCY_HALF_LIFE_DAYS, RECENCY_WEIGHT = 300, 0.03
OVERLAP_RATIO, HISTORY_WINDOW_DAYS = 0.5, 180   # feedback.ts

FILLER_WORDS = set("""
something someone somewhere somebody anything anyone anybody everything everyone
thing things stuff like likes look looks looking looked seem seems seemed appears
appeared similar resembles particular certain specific basically actually really
quite pretty very maybe perhaps probably definitely kinda sorta remember recall
saw seen there theres here
""".split())

# Postgres's english stopword list (tsearch_data/english.stop): a word that
# lexizes to nothing is dropped from the query before frequencies are measured.
STOPWORDS = set("""
i me my myself we our ours ourselves you your yours yourself yourselves he him
his himself she her hers herself it its itself they them their theirs themselves
what which who whom this that these those am is are was were be been being have
has had having do does did doing a an the and but if or because as until while
of at by for with about against between into through during before after above
below to from up down in out on off over under again further then once here
there when where why how all any both each few more most other some such no nor
not only own same so than too very s t can will just don should now
""".split())

# ── The Porter2 (Snowball English) stemmer, which is what 'english' means ─
# A straight transcription of the published algorithm. Postgres's english_stem
# dictionary is Snowball's, so a query word stemmed here matches the lexemes
# Postgres wrote into the seed.
_VOWELS = set("aeiouy")
_DOUBLES = ("bb", "dd", "ff", "gg", "mm", "nn", "pp", "rr", "tt")
_LI_ENDING = set("cdeghkmnrt")
_EXCEPTIONS = {"skis": "ski", "skies": "sky", "dying": "die", "lying": "lie", "tying": "tie",
               "idly": "idl", "gently": "gentl", "ugly": "ugli", "early": "earli", "only": "onli",
               "singly": "singl", "sky": "sky", "news": "news", "howe": "howe", "atlas": "atlas",
               "cosmos": "cosmos", "bias": "bias", "andes": "andes"}
_EXCEPTIONS2 = {"inning", "outing", "canning", "herring", "earring", "proceed", "exceed", "succeed"}
_STEP2 = [("ization", "ize"), ("ational", "ate"), ("fulness", "ful"), ("ousness", "ous"), ("iveness", "ive"),
          ("tional", "tion"), ("biliti", "ble"), ("lessli", "less"), ("entli", "ent"), ("ation", "ate"),
          ("alism", "al"), ("aliti", "al"), ("ousli", "ous"), ("iviti", "ive"), ("fulli", "ful"),
          ("enci", "ence"), ("anci", "ance"), ("abli", "able"), ("izer", "ize"), ("ator", "ate"),
          ("alli", "al"), ("bli", "ble"), ("ogi", "og"), ("li", "")]
_STEP3 = [("ational", "ate"), ("tional", "tion"), ("alize", "al"), ("icate", "ic"), ("iciti", "ic"),
          ("ative", ""), ("ical", "ic"), ("ness", ""), ("ful", "")]
_STEP4 = ["ement", "ance", "ence", "able", "ible", "ment", "ant", "ent", "ism", "ate", "iti", "ous", "ive", "ize", "ion", "al", "er", "ic"]


def _is_vowel(w, i):
    return w[i] in _VOWELS


def _r1r2(w):
    if w.startswith(("gener", "commun", "arsen")):
        r1 = {"gener": 5, "commun": 6, "arsen": 5}[next(p for p in ("gener", "commun", "arsen") if w.startswith(p))]
    else:
        r1 = len(w)
        for i in range(1, len(w)):
            if not _is_vowel(w, i) and _is_vowel(w, i - 1):
                r1 = i + 1
                break
    r2 = len(w)
    for i in range(r1 + 1, len(w)):
        if not _is_vowel(w, i) and _is_vowel(w, i - 1):
            r2 = i + 1
            break
    return r1, r2


def _short_syllable_end(w):
    n = len(w)
    if n >= 3 and not _is_vowel(w, n - 1) and w[n - 1] not in "wxY" and _is_vowel(w, n - 2) and not _is_vowel(w, n - 3):
        return True
    if n == 2 and _is_vowel(w, 0) and not _is_vowel(w, 1):
        return True
    return False


def stem(word):
    w = word.lower()
    if len(w) <= 2:
        return w
    if w in _EXCEPTIONS:
        return _EXCEPTIONS[w]
    if w.startswith("'"):
        w = w[1:]
    if w.startswith("y"):
        w = "Y" + w[1:]
    w = re.sub(r"(?<=[aeiouy])y", "Y", w)
    r1, r2 = _r1r2(w)

    # Step 0
    for suf in ("'s'", "'s", "'"):
        if w.endswith(suf):
            w = w[: -len(suf)]
            break
    # Step 1a
    if w.endswith("sses"):
        w = w[:-2]
    elif w.endswith(("ied", "ies")):
        w = w[:-2] if len(w) > 4 else w[:-1]
    elif w.endswith(("us", "ss")):
        pass
    elif w.endswith("s"):
        if any(c in _VOWELS for c in w[:-2]):
            w = w[:-1]
    if w in _EXCEPTIONS2:
        return w
    # Step 1b
    done = False
    for suf in ("eedly", "eed"):
        if w.endswith(suf):
            if len(w) - len(suf) >= r1:
                w = w[: -len(suf)] + "ee"
            done = True
            break
    if not done:
        for suf in ("ingly", "edly", "ing", "ed"):
            if w.endswith(suf):
                base = w[: -len(suf)]
                if any(c in _VOWELS for c in base):
                    w = base
                    if w.endswith(("at", "bl", "iz")):
                        w += "e"
                    elif w.endswith(_DOUBLES):
                        w = w[:-1]
                    elif _short_syllable_end(w) and len(w) <= r1:
                        w += "e"
                break
    # Step 1c
    if len(w) > 2 and w[-1] in "yY" and not _is_vowel(w, len(w) - 2):
        w = w[:-1] + "i"
    # Step 2
    for suf, rep in _STEP2:
        if w.endswith(suf):
            if len(w) - len(suf) >= r1:
                if suf == "ogi":
                    if w[-4] == "l":
                        w = w[:-1]
                elif suf == "li":
                    if w[-3] in _LI_ENDING:
                        w = w[:-2]
                else:
                    w = w[: -len(suf)] + rep
            break
    # Step 3
    for suf, rep in _STEP3:
        if w.endswith(suf):
            if len(w) - len(suf) >= r1:
                if suf == "ative":
                    if len(w) - len(suf) >= r2:
                        w = w[: -len(suf)]
                else:
                    w = w[: -len(suf)] + rep
            break
    # Step 4
    for suf in _STEP4:
        if w.endswith(suf):
            if len(w) - len(suf) >= r2:
                if suf == "ion":
                    if w[-4] in "st":
                        w = w[:-3]
                else:
                    w = w[: -len(suf)]
            break
    # Step 5
    if w.endswith("e"):
        if len(w) - 1 >= r2 or (len(w) - 1 >= r1 and not _short_syllable_end(w[:-1])):
            w = w[:-1]
    elif w.endswith("l") and len(w) - 1 >= r2 and len(w) >= 2 and w[-2] == "l":
        w = w[:-1]
    return w.replace("Y", "y")


def lexize(word):
    """ts_lexize('english_stem', w): nothing for a stopword, else the stem."""
    if word in STOPWORDS:
        return None
    return stem(word)


def tsquery(word):
    """plainto_tsquery('english', w) for one query word: the parser splits it
    into alphanumeric tokens, each stemmed, ANDed. Empty when only stopwords."""
    stems = []
    for token in re.split(r"[^a-z0-9]+", word):
        if not token or token in STOPWORDS:
            continue
        stems.append(stem(token))
    return stems


# ── Seed and state ───────────────────────────────────────────────────────
with open(SEED) as f:
    SEED_DATA = json.load(f)
POSTS = SEED_DATA["posts"]
BY_ID = {p["id"]: p for p in POSTS}
QUERIES = SEED_DATA.get("queries", {})
LOCK = threading.Lock()


def load_state():
    if not os.path.exists(STATE):
        return {"decisions": {}, "clicks": []}
    with open(STATE) as f:
        return json.load(f)


def save_state(state):
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE)


def removed_ids(state):
    return {pid for pid, d in state["decisions"].items() if d == "remove"}


def present_posts(state):
    gone = removed_ids(state)
    return [p for p in POSTS if p["id"] not in gone]


PUBLIC_FIELDS = ("id", "url", "text", "quotedText", "author", "postedAt", "savedAt", "contentType",
                 "hasMedia", "media", "links", "metrics", "indexed")


def dto(post):
    return {k: post.get(k) for k in PUBLIC_FIELDS}


def normalise_query(q):
    return " ".join(q.lower().split())


# ── Query intent (query-intent.ts, author-scope.ts) ──────────────────────
ATTRIBUTION = r"(?:from|by)"
ATTRIBUTION_SEP = r"(?::|\s)\s*"
SAVED_THING = r"(?:bookmarks?|posts?|tweets?|threads?|things?|stuff|anything|something)"
FIGURE_OF_SPEECH = r"(?:scratch|memory|hand|heart|home|now|then|here|there|today|yesterday|default|first|the)\b"
AUTHOR_PATTERNS = [
    re.compile(r"(^|\s)@[a-z0-9_]{2,}", re.I),
    re.compile(r"\b" + SAVED_THING + r"\s+" + ATTRIBUTION + ATTRIBUTION_SEP + r"\S", re.I),
    re.compile(r"^\s*" + ATTRIBUTION + r":\s*\S", re.I),
    re.compile(r"^\s*" + ATTRIBUTION + r"\s+(?!" + FIGURE_OF_SPEECH + r")\S", re.I),
    re.compile(r"\b(?:posted|written|shared|tweeted)\s+by" + ATTRIBUTION_SEP + r"\S", re.I),
]


def has_author_intent(query):
    return any(p.search(query) for p in AUTHOR_PATTERNS)


def query_length(query):
    return len([w for w in re.split(r"[^a-z0-9@_]+", query.lower()) if len(w) > 1])


def fusion_weights_for(query):
    n = query_length(query)
    if n <= 3:
        return {"fullText": 1, "semantic": 0.7}
    if n <= 6:
        return {"fullText": 1, "semantic": 1}
    return {"fullText": 0.6, "semantic": 1}


HANDLE_CHARS = r"[a-z0-9_]{1,15}"
HANDLE_PREFIX = r"(^|[\s([{\"'])"
OPERATOR = re.compile(r"\b(?:from|by):@?(" + HANDLE_CHARS + r")\b", re.I)
HANDLE = re.compile(HANDLE_PREFIX + r"@(" + HANDLE_CHARS + r")\b", re.I)
EXCLUSIVE = re.compile(r"\b(?:only|just|everything|all)\b", re.I)
NON_CONTENT = set("""
bookmark bookmarks post posts tweet tweets thread threads thing things stuff anything everything
from by posted written shared tweeted author show find get give me my all only just every
a an the of in and
""".split())


def parse_author_scope(query):
    empty = {"handles": [], "exclusive": False, "residual": "", "contentful": False}
    if "@" not in query and ":" not in query:
        return empty
    handles = []
    had_operator = False

    def op(m):
        nonlocal had_operator
        had_operator = True
        handles.append(m.group(1).lower())
        return " "

    residual = OPERATOR.sub(op, query)

    def hd(m):
        handles.append(m.group(2).lower())
        return m.group(1)

    residual = HANDLE.sub(hd, residual)
    if not handles:
        return empty
    residual = " ".join(residual.split())
    contentful = any(w and w not in NON_CONTENT for w in re.split(r"[^a-z0-9#]+", residual.lower()))
    seen, uniq = set(), []
    for h in handles:
        if h not in seen:
            seen.add(h)
            uniq.append(h)
    return {"handles": uniq, "exclusive": had_operator or not contentful or bool(EXCLUSIVE.search(query)),
            "residual": residual, "contentful": contentful}


def resolve_author_handles(posts, handles):
    known = {(p["author"].get("username") or "").lower() for p in posts}
    return [h for h in handles if h in known]


# ── The keyword half (full-text.ts) ──────────────────────────────────────
def matches(lexemes, stems):
    return bool(stems) and all(s in lexemes for s in stems)


def full_text_search(posts, query, limit, author_usernames=None):
    raw = re.split(r"[^a-z0-9@_]+", query.lower())
    words, seen = [], set()
    for w in raw:
        if len(w) <= 1 or w in seen or w in FILLER_WORDS or lexize(w) is None:
            continue
        seen.add(w)
        words.append(w)
    if not words:
        return []

    # Frequencies over the whole library, never over the filtered set.
    n = max(len(posts), 1)
    weighted = []
    for w in words:
        stems = tsquery(w)
        if not stems:
            continue
        df = sum(1 for p in posts if matches(p["lex"]["all"], stems))
        if df == 0:
            continue
        weighted.append({"w": w, "stems": stems, "ratio": df / n,
                         "idf": math.log(1 + (n - df + 0.5) / (df + 0.5))})
    if not weighted:
        return []
    weighted.sort(key=lambda t: -t["idf"])
    retrieval = [t for t in weighted if t["ratio"] <= MAX_SELECTIVE_DF_RATIO] or weighted
    total_idf = sum(t["idf"] for t in weighted)

    scoped = set(author_usernames or [])
    scored = []
    for p in posts:
        if scoped and (p["author"].get("username") or "").lower() not in scoped:
            continue
        lex = p["lex"]
        if not any(matches(lex["all"], t["stems"]) for t in retrieval):
            continue
        hit = [t for t in weighted if matches(lex["all"], t["stems"])]
        score = sum(t["idf"] for t in hit) / total_idf if total_idf else 0
        if score < MIN_COVERAGE:
            continue
        # The tiebreaker: a stand-in for ts_rank_cd(search_vector, query, 32).
        # Each occurrence of a retrieval term counts its position's weight
        # (author fields are A, the body is B), squashed through x/(x+1).
        raw_density = 0.0
        for t in retrieval:
            for s in t["stems"]:
                a, b = lex["all"].get(s, [0, 0])
                raw_density += a * 1.0 + b * 0.4
        density = raw_density / (raw_density + 1)
        text_l, quoted_l, media_l, link_l, author_l = (set(lex["text"]), set(lex["quoted"]), set(lex["media"]),
                                                       set(lex["link"]), set(lex["author"]))
        scored.append({
            "bookmarkId": p["id"],
            "score": score,
            "density": density,
            "matchedTerms": [t["w"] for t in weighted if matches(text_l, t["stems"])],
            "quotedTerms": [t["w"] for t in weighted if matches(quoted_l, t["stems"])],
            "mediaTerms": [t["w"] for t in weighted if matches(media_l, t["stems"])],
            "linkTerms": [t["w"] for t in weighted if matches(link_l, t["stems"])],
            "authorMatched": any(matches(author_l, t["stems"]) for t in weighted),
        })
    scored.sort(key=lambda h: (-h["score"], -h["density"], h["bookmarkId"]))
    out = []
    for i, h in enumerate(scored[:limit]):
        h = dict(h)
        h["rank"] = i + 1
        del h["density"]
        out.append(h)
    return out


# ── The vector half (semantic.ts) ────────────────────────────────────────
def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def semantic_search(posts, query, limit, author_usernames=None):
    embedding = QUERIES.get(normalise_query(query))
    if not embedding or not query.strip():
        return []
    scoped = set(author_usernames or [])
    hits = []
    for p in posts:
        if scoped and (p["author"].get("username") or "").lower() not in scoped:
            continue
        if not p.get("embedding"):
            continue
        sim = cosine(embedding, p["embedding"])
        if sim > MIN_SIMILARITY:
            hits.append((sim, p["id"]))
    hits.sort(key=lambda t: (-t[0], t[1]))
    return [{"bookmarkId": pid, "rank": i + 1, "similarity": sim} for i, (sim, pid) in enumerate(hits[:limit])]


# ── Clicks (feedback.ts) ─────────────────────────────────────────────────
def previously_clicked(state, query):
    words = [w for w in re.split(r"[^a-z0-9@_]+", query.lower()) if len(w) > 1]
    if not words:
        return set()
    cutoff = time.time() - HISTORY_WINDOW_DAYS * 86400
    out = set()
    for click in state["clicks"]:
        if click.get("at", 0) < cutoff:
            continue
        past = set(re.split(r"[^a-z0-9@_]+", click["query"].lower()))
        overlap = sum(1 for w in words if w in past) / len(words)
        if overlap >= OVERLAP_RATIO:
            out.add(click["bookmarkId"])
    return out


# ── Fusion and boosts (ranking.ts) ───────────────────────────────────────
def parse_iso(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def recency_score(saved_at, now):
    age_days = max(0.0, (now - saved_at.timestamp()) / 86400)
    return math.pow(0.5, age_days / RECENCY_HALF_LIFE_DAYS)


def vote(rank, weight):
    return 0 if rank is None else weight / (RRF_K + rank)


def rank(inputs, author_intent, weights, now):
    max_fused = (weights["fullText"] + weights["semantic"]) / (RRF_K + 1)
    out = []
    for inp in inputs:
        ft, se = inp.get("fullText"), inp.get("semantic")
        votes = {"fullText": vote(ft["rank"] if ft else None, weights["fullText"]) / max_fused,
                 "semantic": vote(se["rank"] if se else None, weights["semantic"]) / max_fused}
        fused = votes["fullText"] + votes["semantic"]
        author_matched = bool(ft and ft["authorMatched"])
        clicked = bool(inp.get("clickedBefore"))
        boosts = {"recency": recency_score(inp["savedAt"], now) * RECENCY_WEIGHT,
                  "author": AUTHOR_BOOST if author_intent and author_matched else 0,
                  "history": CLICK_BOOST if clicked else 0}
        out.append({
            "bookmarkId": inp["bookmarkId"],
            "score": fused + boosts["recency"] + boosts["author"] + boosts["history"],
            "fullTextScore": ft["score"] if ft else 0,
            "semanticScore": se["similarity"] if se else 0,
            "matchedTerms": ft["matchedTerms"] if ft else [],
            "quotedTerms": ft["quotedTerms"] if ft else [],
            "mediaTerms": ft["mediaTerms"] if ft else [],
            "linkTerms": ft["linkTerms"] if ft else [],
            "authorMatched": author_matched,
            "clickedBefore": clicked,
            "fullTextRank": ft["rank"] if ft else None,
            "semanticRank": se["rank"] if se else None,
            "weights": weights,
            "votes": votes,
            "fused": fused,
            "boosts": boosts,
        })
    out.sort(key=lambda h: (-h["score"], h["bookmarkId"]))
    return out


# ── Reasons and trace (service.ts) ───────────────────────────────────────
def quote_terms(terms):
    return " and ".join("“%s”" % t for t in terms[:2])


def explain(hit, post, author_intent, scoped):
    reasons = []
    username = post["author"].get("username")
    if scoped and username:
        reasons.append({"type": "author", "label": "Posted by @%s" % username})
    if not scoped and author_intent and hit["authorMatched"] and username:
        reasons.append({"type": "author", "label": "Posted by @%s" % username})
    if hit["matchedTerms"]:
        reasons.append({"type": "text", "label": "Post text mentions %s" % quote_terms(hit["matchedTerms"])})
    if hit["quotedTerms"]:
        reasons.append({"type": "quoted", "label": "The quoted post mentions %s" % quote_terms(hit["quotedTerms"])})
    if hit["mediaTerms"]:
        kind = "Video" if any(m["type"] != "image" for m in post["media"]) else "Image"
        reasons.append({"type": "media", "label": "%s description mentions %s" % (kind, quote_terms(hit["mediaTerms"]))})
    if hit["linkTerms"]:
        reasons.append({"type": "link", "label": "The linked page mentions %s" % quote_terms(hit["linkTerms"])})
    content_matched = bool(hit["matchedTerms"] or hit["quotedTerms"] or hit["mediaTerms"] or hit["linkTerms"])
    if hit["semanticScore"] > 0.6 and not content_matched:
        reasons.append({"type": "semantic", "label": "Close in meaning to what you searched for"})
    if not reasons and hit["authorMatched"] and username:
        reasons.append({"type": "author", "label": "Posted by @%s" % username})
    if not reasons and hit["semanticScore"] > 0:
        reasons.append({"type": "semantic", "label": "Close in meaning to what you searched for"})
    if hit["clickedBefore"] and len(reasons) < 2:
        reasons.append({"type": "history", "label": "You opened this after a similar search"})
    return reasons[:3]


def r4(x):
    return round(x, 4)


def trace(hit, candidates):
    return {
        "fullText": None if hit["fullTextRank"] is None else {
            "rank": hit["fullTextRank"], "of": candidates["fullText"], "coverage": r4(hit["fullTextScore"]),
            "terms": {"text": hit["matchedTerms"], "quoted": hit["quotedTerms"], "media": hit["mediaTerms"], "link": hit["linkTerms"]},
            "authorMatched": hit["authorMatched"]},
        "semantic": None if hit["semanticRank"] is None else {
            "rank": hit["semanticRank"], "of": candidates["semantic"], "similarity": r4(hit["semanticScore"])},
        "weights": hit["weights"],
        "votes": {"fullText": r4(hit["votes"]["fullText"]), "semantic": r4(hit["votes"]["semantic"])},
        "fused": r4(hit["fused"]),
        "boosts": {k: r4(v) for k, v in hit["boosts"].items()},
        "score": r4(hit["score"]),
    }


def strip_none(obj):
    """The TypeScript trace leaves absent halves undefined, i.e. out of the JSON."""
    if isinstance(obj, dict):
        return {k: strip_none(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_none(v) for v in obj]
    return obj


# ── Search (service.ts) ──────────────────────────────────────────────────
def encode_cursor(offset):
    return base64.urlsafe_b64encode(str(offset).encode()).decode().rstrip("=")


def decode_cursor(cursor):
    if not cursor:
        return 0
    try:
        pad = "=" * (-len(cursor) % 4)
        n = int(base64.urlsafe_b64decode(cursor + pad).decode())
        return n if n >= 0 else 0
    except Exception:
        return 0


def browse(posts, limit, offset, query="", author_usernames=None):
    scoped = bool(author_usernames)
    rows = posts
    if scoped:
        rows = [p for p in posts if (p["author"].get("username") or "").lower() in set(author_usernames)]
    # post_created_at desc nulls last, id desc — ISO strings sort as dates.
    dated = sorted((p for p in rows if p.get("postedAt")), key=lambda p: (p["postedAt"], p["id"]), reverse=True)
    undated = sorted((p for p in rows if not p.get("postedAt")), key=lambda p: p["id"], reverse=True)
    rows = dated + undated
    page = rows[offset: offset + limit]
    results = []
    for p in page:
        reasons = []
        if scoped and p["author"].get("username"):
            reasons = [{"type": "author", "label": "Posted by @%s" % p["author"]["username"]}]
        results.append({"bookmark": dto(p), "score": 0, "matchReasons": reasons})
    out = {"query": query, "results": results}
    if len(rows) > offset + limit:
        out["nextCursor"] = encode_cursor(offset + limit)
    if scoped:
        out["authorScope"] = author_usernames
    return out


def search(state, request):
    limit = min(int(request.get("limit") or DEFAULT_LIMIT), MAX_LIMIT)
    offset = decode_cursor(request.get("cursor"))
    query = (request.get("query") or "").strip()
    posts = present_posts(state)
    if not query:
        return browse(posts, limit, offset)

    scope = parse_author_scope(query)
    scoped_authors = resolve_author_handles(posts, scope["handles"]) if scope["exclusive"] and scope["handles"] else []
    author_usernames = scoped_authors or None
    search_text = scope["residual"] if author_usernames else query
    if author_usernames and not scope["contentful"]:
        return browse(posts, limit, offset, query, author_usernames)

    candidate_limit = min(limit * CANDIDATE_MULTIPLIER, MAX_CANDIDATES)
    author_intent = has_author_intent(search_text)

    full_text = full_text_search(posts, search_text, candidate_limit, author_usernames)
    semantic = semantic_search(posts, search_text, candidate_limit, author_usernames)
    clicked = previously_clicked(state, query)

    ft_by_id = {h["bookmarkId"]: h for h in full_text}
    se_by_id = {h["bookmarkId"]: h for h in semantic}
    candidate_ids = list(dict.fromkeys(list(ft_by_id) + list(se_by_id)))
    if not candidate_ids:
        out = {"query": query, "results": [], "totalEstimate": 0}
        if author_usernames:
            out["authorScope"] = author_usernames
        return out

    now = time.time()
    inputs = [{"bookmarkId": pid, "savedAt": parse_iso(BY_ID[pid]["savedAt"]),
               "fullText": ft_by_id.get(pid), "semantic": se_by_id.get(pid),
               "clickedBefore": pid in clicked} for pid in candidate_ids]
    weights = fusion_weights_for(search_text)
    candidates = {"fullText": len(full_text), "semantic": len(semantic), "total": len(candidate_ids)}
    ranked = rank(inputs, author_intent, weights, now)
    page = ranked[offset: offset + limit]
    results = []
    for hit in page:
        post = BY_ID[hit["bookmarkId"]]
        results.append({
            "bookmark": dto(post),
            "score": r4(hit["score"]),
            "matchReasons": explain(hit, post, author_intent, bool(author_usernames)),
            "retrieval": strip_none(trace(hit, candidates)),
        })
    out = {"query": query, "results": results, "totalEstimate": len(ranked),
           "retrieval": {"weights": weights, "candidates": candidates}}
    if len(ranked) > offset + limit:
        out["nextCursor"] = encode_cursor(offset + limit)
    if author_usernames:
        out["authorScope"] = author_usernames
    return out


# ── The other endpoints ──────────────────────────────────────────────────
def me(state):
    account = SEED_DATA["account"]
    posts = present_posts(state)
    acc = {"provider": "x", "username": account["username"], "displayName": account.get("displayName"),
           "avatarUrl": account.get("avatarUrl"), "status": "active",
           "connectedAt": "2026-08-06T00:00:00.000Z", "lastSyncedAt": SEED_DATA.get("generatedAt")}
    n = len(posts)
    return {"user": {"id": "box"}, "demo": False, "account": acc, "accounts": [acc],
            "library": {"total": n, "searchable": n},
            "activity": {"importing": False, "indexing": False, "describing": False,
                         "total": n, "searchable": n, "enriched": n},
            "recentSearches": SEED_DATA.get("recentSearches", [])}


def authors(state):
    counts = {}
    for p in present_posts(state):
        u = (p["author"].get("username") or "").lower()
        if not u:
            continue
        entry = counts.setdefault(u, {"username": u, "name": p["author"].get("name"),
                                      "avatarUrl": p["author"].get("avatarUrl"), "count": 0})
        entry["count"] += 1
    return {"authors": sorted(counts.values(), key=lambda a: (-a["count"], a["username"]))}


def triage(state):
    queue = [p for p in POSTS if p.get("review")]
    rows = [{"bookmark": dto(p), "decision": state["decisions"].get(p["id"])} for p in queue]
    reviewed = sum(1 for r in rows if r["decision"] in ("remove", "keep"))
    removed = sum(1 for r in rows if r["decision"] == "remove")
    return {"queue": rows, "reviewed": reviewed, "removed": removed, "total": len(rows)}


def api_state(state):
    gone = removed_ids(state)
    return {"present": [p["id"] for p in POSTS if p["id"] not in gone],
            "removed": sorted(gone),
            "decisions": state["decisions"],
            "clicks": state["clicks"]}


# ── HTTP ─────────────────────────────────────────────────────────────────
PAGES = {"/box": "box.html", "/box/": "box.html", "/box/triage": "box/triage.html", "/box/triage/": "box/triage.html"}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _file(self, path):
        path = os.path.abspath(path)
        if not (path.startswith(SITE) or path.startswith(MEDIA)) or not os.path.isfile(path):
            return self._send(404, b"not found", "text/plain")
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            data = f.read()
        cache = "public, max-age=31536000, immutable" if "/_next/static/" in path else "no-cache"
        self._send(200, data, ctype, {"cache-control": cache})

    def _body(self):
        n = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            return json.loads(raw or b"{}")
        except Exception:
            return {}

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            return self._send(302, b"", "text/plain", {"location": "/box"})
        if path in PAGES:
            return self._file(os.path.join(SITE, PAGES[path]))
        if path.startswith("/media/"):
            return self._file(os.path.join(MEDIA, path[len("/media/"):]))
        if path.startswith("/api/"):
            with LOCK:
                state = load_state()
                if path == "/api/me":
                    return self._send(200, me(state))
                if path == "/api/authors":
                    return self._send(200, authors(state))
                if path == "/api/triage":
                    return self._send(200, triage(state))
                if path == "/api/state":
                    return self._send(200, api_state(state))
                if path.startswith("/api/discover"):
                    posts = present_posts(state)[:4]
                    return self._send(200, {"bookmarks": [dto(p) for p in posts]})
            return self._send(404, {"error": "not found"})
        return self._file(os.path.join(SITE, path.lstrip("/")))

    def do_POST(self):
        path = unquote(urlsplit(self.path).path)
        body = self._body()
        with LOCK:
            state = load_state()
            if path == "/api/search":
                clicked = body.get("clicked")
                if clicked:
                    state["clicks"].append({"query": clicked.get("query", ""), "bookmarkId": clicked.get("bookmarkId", ""),
                                            "at": time.time()})
                    save_state(state)
                    return self._send(200, {"recorded": True})
                return self._send(200, search(state, body))
            if path.startswith("/api/triage/"):
                pid = path[len("/api/triage/"):]
                if pid not in BY_ID:
                    return self._send(404, {"error": "Not found."})
                decision = body.get("decision")
                if decision not in ("remove", "keep", None):
                    return self._send(400, {"error": "decision must be remove, keep or null"})
                if decision is None:
                    state["decisions"].pop(pid, None)
                else:
                    state["decisions"][pid] = decision
                save_state(state)
                return self._send(200, {"id": pid, "decision": decision})
        self._send(404, {"error": "not found"})

    def do_DELETE(self):
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/bookmarks/"):
            pid = path[len("/api/bookmarks/"):]
            with LOCK:
                state = load_state()
                if pid not in BY_ID:
                    return self._send(404, {"error": "Not found."})
                # The card's "Remove from library" is the same act as a
                # Remove in the review queue, and is recorded the same way.
                state["decisions"][pid] = "remove"
                save_state(state)
            return self._send(200, {"deleted": pid})
        self._send(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print("bookmarx-in-a-box: %d posts, %d embedded queries, serving %s on 127.0.0.1:%d" %
          (len(POSTS), len(QUERIES), SITE, port), flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
