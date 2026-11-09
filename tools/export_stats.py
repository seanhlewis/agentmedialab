"""Export class-wide click totals from GoatCounter into data/stats.json (read by the Stats tab).

Needs two environment variables (set as GitHub Actions secrets):
  GOATCOUNTER_CODE   the site code, e.g. agentmedialab  (https://agentmedialab.goatcounter.com)
  GOATCOUNTER_TOKEN  an API key with "Read statistics" permission (GoatCounter > Settings > API)
Optional:
  STATS_SINCE        first day to count, YYYY-MM-DD (default 2026-11-01)

Run:  python -I tools/export_stats.py
"""
import datetime as dt, json, os, pathlib, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
code, token = os.environ.get("GOATCOUNTER_CODE", "").strip(), os.environ.get("GOATCOUNTER_TOKEN", "").strip()
if not code or not token:
    print("GOATCOUNTER_CODE / GOATCOUNTER_TOKEN not set; leaving data/stats.json unchanged.")
    sys.exit(0)

since = os.environ.get("STATS_SINCE", "2026-11-01")
end = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime("%Y-%m-%d")
base = f"https://{code}.goatcounter.com/api/v0"


def get(path, **params):
    url = f"{base}{path}?{urllib.parse.urlencode(params, doseq=True)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:  # rate limited
                time.sleep(4 * (attempt + 1)); continue
            raise


events, views, seen = {}, 0, []
for _ in range(50):  # page through all paths
    j = get("/stats/hits", start=since, end=end, limit=100, exclude_paths=",".join(map(str, seen)) if seen else "")
    hits = j.get("hits") or []
    new = [h for h in hits if h.get("path_id") not in seen]
    if not new: break
    for h in new:
        seen.append(h.get("path_id"))
        n = int(h.get("count", h.get("count_unique", 0)) or 0)
        if h.get("event"):
            events[h["path"].lstrip("/")] = n
        else:
            views += n
    if not j.get("more"): break

out = {
    "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    "since": since,
    "views": views,
    "events": dict(sorted(events.items(), key=lambda kv: (-kv[1], kv[0]))),
    "source": f"https://{code}.goatcounter.com",
}
(ROOT / "data" / "stats.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
print(f"views={views} events={sum(events.values())} across {len(events)} paths")
