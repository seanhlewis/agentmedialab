"""Build data/people.js from the research files.

Inputs
  research/people/<id>.json         one file per person, researched from their own class site
  research/raine-course-snapshot.json   Raine Sha's source-reviewed build catalog (Our Cognitive Gardens, MIT License)

Output
  data/people.js   window.PEOPLE, window.LOOKS, window.STUDIO (class-wide facts used by the Why and Stats tabs)

Run:  python -I tools/build_data.py
"""
import json, pathlib, sys, collections, re

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parents[1]
ORDER = ("meiri jad yuxiang stacey mateo juan matti yanning sandra leticia hyung roma maya "
         "david egemen raine sean brooke manasi ruipeng olivia lilith ray yue eitan om yufeng lichun").split()
SNAP_ID = {"juan": "juan-ruben", "lichun": "li-chun"}  # our id -> Raine's snapshot id
PROPS = set("laptop headphones sketchbook robot mug plant books tablet synth map camera solder clay phone "
            "sticky_notes globe newspaper yarn".split())
HAIR = set("short long bob bun curly ponytail buzz spiky beanie cap".split())


def short(s, n=110):
    s = re.sub(r"\s+", " ", s or "").strip().replace("—", ", ")
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


snap = json.loads((ROOT / "research" / "raine-course-snapshot.json").read_text(encoding="utf-8"))
builds_by = collections.defaultdict(list)
for b in snap["builds"]:
    builds_by[b["studentId"]].append(b)
build_by_id = {b["id"]: b for b in snap["builds"]}

people, looks, missing = [], {}, []
for pid in ORDER:
    f = ROOT / "research" / "people" / f"{pid}.json"
    if not f.exists():
        missing.append(pid); continue
    p = json.loads(f.read_text(encoding="utf-8"))
    assert p["id"] == pid, (pid, p["id"])
    p.pop("role", None)
    p["props"] = [x for x in p.get("props", []) if x in PROPS] or ["laptop"]
    look = p.pop("look", None)
    if look:
        if look.get("hair") not in HAIR: look.pop("hair", None)
        looks[pid] = look

    # merge Raine's source-reviewed builds into the week list
    sid = SNAP_ID.get(pid, pid)
    weeks = {w["week"]: dict(w) for w in p.get("weeks", [])}
    themes = collections.Counter()
    for b in sorted(builds_by.get(sid, []), key=lambda b: b["week"]):
        w = weeks.get(b["week"])
        if w is None:
            w = weeks[b["week"]] = {"week": b["week"], "title": b["title"], "gist": short(b["objective"], 90)}
        w.setdefault("url", b["sourceUrl"])
        w["themes"] = sorted(set(w.get("themes", [])) | set(b["themes"]))
        w["methods"] = sorted(set(w.get("methods", [])) | set(b.get("methods", [])))
        w["garden"] = True  # also indexed in Our Cognitive Gardens
        themes.update(b["themes"])
    p["weeks"] = [weeks[k] for k in sorted(weeks)]
    p["themes"] = [t for t, _ in themes.most_common()]
    p["snapId"] = sid
    people.append(p)

# pairs recorded by Raine's Garden Agent (Claude run, saved with sources)
by_snap = {p["snapId"]: p for p in people}
for pr in snap.get("pairs", []):
    a, b = build_by_id.get(pr["fromBuild"]), build_by_id.get(pr["toBuild"])
    if not a or not b: continue
    for me, other in ((a, b), (b, a)):
        P, O = by_snap.get(me["studentId"]), by_snap.get(other["studentId"])
        if not P or not O: continue
        P.setdefault("pairs", []).append({
            "with": O["id"], "mine": me["title"], "theirs": other["title"],
            "reason": short(pr["reason"], 260), "by": "Garden Agent (Our Cognitive Gardens)"})

# related classmates outside your own table, by shared themes (Raine's "pairs & inspiration", widened to everyone)
# Jaccard overlap on themes, with a gentle penalty so the same few prolific people are not everyone's match.
picked = collections.Counter()
for P in sorted(people, key=lambda p: (len(p["themes"]), p["id"])):
    A = set(P["themes"])
    scored = []
    for O in people:
        if O is P or not O["themes"] or (P.get("group") and O.get("group") == P.get("group")): continue
        if any(x["with"] == O["id"] for x in P.get("pairs", [])): continue  # already shown as a pair
        B = set(O["themes"])
        shared = [t for t in P["themes"] if t in B]
        if shared:
            scored.append((len(A & B) / len(A | B) - 0.06 * picked[O["id"]], O["id"], shared))
    scored.sort(key=lambda x: (-x[0], x[1]))
    P["related"] = [{"id": i, "shared": s[:3]} for _, i, s in scored[:3]]
    picked.update(r["id"] for r in P["related"])

for P in people:
    P.pop("snapId", None)

total_builds = sum(len(p["weeks"]) for p in people)
studio = {
    "people": len(people),
    "builds": total_builds,
    "withBuilds": sum(1 for p in people if p["weeks"]),
    "gardenBuilds": sum(1 for p in people for w in p["weeks"] if w.get("garden")),
    "themes": collections.Counter(t for p in people for w in p["weeks"] for t in w.get("themes", [])).most_common(),
    "groups": sorted({p["group"] for p in people if p.get("group")}),
    "snapshot": {"source": snap["source"], "author": snap["author"], "builds": len(snap["builds"])},
}

out = ROOT / "data" / "people.js"
out.write_text(
    "// Generated by tools/build_data.py from research/ (do not edit by hand).\n"
    "window.PEOPLE = " + json.dumps(people, ensure_ascii=False, indent=1) + ";\n"
    "window.LOOKS = Object.assign(window.LOOKS || {}, " + json.dumps(looks, ensure_ascii=False) + ");\n"
    "window.STUDIO = " + json.dumps(studio, ensure_ascii=False) + ";\n",
    encoding="utf-8")
print(f"wrote {len(people)} people, {total_builds} builds ({studio['gardenBuilds']} also in Raine's garden), "
      f"{len(looks)} looks; missing: {missing or 'none'}")
