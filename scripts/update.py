"""Investment Desk price updater.

Runs in GitHub Actions (.github/workflows/update.yml), started every 15 minutes
by an outside timer during market hours. Pulls delayed / end-of-day quotes,
30-day closes and basic valuation fields from Yahoo Finance via `yfinance` and
writes docs/data/desk.json. The web page and scripts/signals.mjs do the scoring.

Honesty rules:
- Never invent numbers. A field that can't be fetched is null, never 0.
- Every stock record carries `asOf` (when it was fetched) and `intraday`
  (fetched before that market's close on its price date).
- Records that could not be refreshed keep their old values, old `asOf` and get
  `stale: true`. `mkUpdated` only moves forward for a market when at least half
  of its stocks were freshly fetched. Otherwise the script exits with an error,
  so the GitHub run shows as failed.
- Indices that fail keep their previous values and dates; they are never dropped.
- Bursa codes are checked against the company name Yahoo returns.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("DESK_OUT") or ROOT / "docs" / "data" / "desk.json")
NY, KL = ZoneInfo("America/New_York"), ZoneInfo("Asia/Kuala_Lumpur")

# (page ticker, sector, word that must appear in Yahoo's company name)
US = [
    ("NVDA", "Semiconductors", "NVIDIA"), ("MSFT", "Software", "Microsoft"), ("AAPL", "Consumer tech", "Apple"),
    ("GOOGL", "Internet", "Alphabet"), ("AMZN", "Internet retail / cloud", "Amazon"), ("META", "Internet", "Meta"),
    ("AVGO", "Semiconductors", "Broadcom"), ("JPM", "Banking", "JPMorgan"), ("LLY", "Pharmaceuticals", "Lilly"),
    ("KO", "Consumer staples", "Coca"),
    ("AMD", "Semiconductors", "Advanced Micro"), ("TSM", "Semiconductors", "Taiwan"), ("MU", "Semiconductors", "Micron"),
    ("QCOM", "Semiconductors", "QUALCOMM"), ("INTC", "Semiconductors", "Intel"), ("TSLA", "Autos", "Tesla"),
    ("NFLX", "Internet", "Netflix"), ("ORCL", "Software", "Oracle"), ("CRM", "Software", "Salesforce"),
    ("ADBE", "Software", "Adobe"), ("PLTR", "Software", "Palantir"), ("CSCO", "Networking", "Cisco"),
    ("BRK-B", "Financials", "Berkshire"), ("V", "Payments", "Visa"), ("MA", "Payments", "Mastercard"),
    ("BAC", "Banking", "Bank of America"), ("UNH", "Healthcare", "UnitedHealth"), ("JNJ", "Pharmaceuticals", "Johnson"),
    ("XOM", "Energy", "Exxon"), ("CVX", "Energy", "Chevron"), ("WMT", "Consumer staples", "Walmart"),
    ("COST", "Consumer staples", "Costco"), ("PG", "Consumer staples", "Procter"), ("PEP", "Consumer staples", "Pepsi"),
    ("HD", "Retail", "Home Depot"),
]
NYSE_LISTED = {"JPM", "LLY", "KO", "TSM", "BRK-B", "V", "MA", "BAC", "UNH", "JNJ", "XOM", "CVX", "WMT", "PG", "HD", "ORCL", "CRM"}
# (page ticker, Bursa code, sector, name keyword)
MY = [
    ("MAYBANK", "1155", "Banking", "Malayan"), ("PBBANK", "1295", "Banking", "Public Bank"), ("CIMB", "1023", "Banking", "CIMB"),
    ("TENAGA", "5347", "Utilities", "Tenaga"), ("GAMUDA", "5398", "Construction", "Gamuda"), ("IHH", "5225", "Healthcare", "IHH"),
    ("INARI", "0166", "Semiconductors", "Inari"), ("YTLPOWR", "6742", "Utilities / data centres", "YTL Power"),
    ("PMETAL", "8869", "Industrial products", "Press Metal"), ("SDG", "5285", "Plantation", "Guthrie"),
    ("HLBANK", "5819", "Banking", "Hong Leong Bank"), ("RHBBANK", "1066", "Banking", "RHB"), ("AMBANK", "1015", "Banking", "AMMB"),
    ("HLFG", "1082", "Banking", "Hong Leong Financial"), ("PCHEM", "5183", "Chemicals", "Petronas Chemicals"),
    ("PETGAS", "6033", "Utilities", "Petronas Gas"), ("PETDAG", "5681", "Energy", "Petronas Dagangan"), ("MISC", "3816", "Shipping", "MISC"),
    ("AXIATA", "6888", "Telecommunications", "Axiata"), ("CDB", "6947", "Telecommunications", "CelcomDigi"),
    ("MAXIS", "6012", "Telecommunications", "Maxis"), ("TM", "4863", "Telecommunications", "Telekom"),
    ("IOICORP", "1961", "Plantation", "IOI Corp"), ("KLK", "2445", "Plantation", "Kuala Lumpur Kepong"), ("NESTLE", "4707", "Consumer", "Nestl"),
    ("PPB", "4065", "Consumer", "PPB"), ("QL", "7084", "Consumer", "QL"), ("99SMART", "5326", "Consumer", "99 Speed"),
    ("MRDIY", "5296", "Consumer", "MR D.I.Y"), ("SUNWAY", "5211", "Property / healthcare", "Sunway"), ("YTL", "4677", "Utilities", "YTL Corp"),
    ("GENTING", "3182", "Leisure", "Genting"), ("SIME", "4197", "Industrial", "Sime"),
    ("NATGATE", "0270", "Electronics (EMS)", "Nation"), ("FRONTKN", "0128", "Semiconductors", "Frontken"), ("VITROX", "0097", "Semiconductors", "ViTrox"),
    ("INFOTEC", "0253", "IT services", "Infoline"),
]
INDEX = {  # page KPI name -> (Yahoo symbol, market)
    "S&P 500": ("^GSPC", "US"), "Nasdaq Comp.": ("^IXIC", "US"), "Dow Jones": ("^DJI", "US"), "Russell 2000": ("^RUT", "US"),
    "VIX": ("^VIX", "US"), "Brent crude": ("BZ=F", "US"), "US 10-yr yield": ("^TNX", "US"),
    "FBM KLCI": ("^KLSE", "MY"), "USD/MYR": ("MYR=X", "MY"),
}
SLEEP = float(os.environ.get("DESK_SLEEP", "0.4"))


def num(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def close_utc(day: str, m: str) -> datetime:
    """When that market's regular session ends on `day` (YYYY-MM-DD), in UTC."""
    d = datetime.strptime(day, "%Y-%m-%d")
    if m == "MY":
        return datetime(d.year, d.month, d.day, 17, 0, tzinfo=KL).astimezone(timezone.utc)
    early = {"2026-11-27", "2026-12-24", "2027-11-26"}  # NYSE 1pm closes
    h = 13 if day in early else 16
    return datetime(d.year, d.month, d.day, h, 0, tzinfo=NY).astimezone(timezone.utc)


def closes(sym: str, period: str = "3mo"):
    """[(YYYY-MM-DD, close), ...] oldest first, or [] after 3 failed tries."""
    for attempt in range(3):
        try:
            h = yf.Ticker(sym).history(period=period, interval="1d", auto_adjust=False)
            out = [(ts.strftime("%Y-%m-%d"), round(c, 4)) for ts, c in ((ts, num(r.get("Close"))) for ts, r in h.iterrows()) if c is not None]
            if out:
                return out
        except Exception as e:
            print(f"  history {sym} attempt {attempt + 1} failed: {e}", file=sys.stderr)
        time.sleep(1 + attempt * 3)
    return []


def info(sym: str) -> dict:
    for attempt in range(3):
        try:
            d = yf.Ticker(sym).info
            if d:
                return d
        except Exception as e:
            print(f"  info {sym} attempt {attempt + 1} failed: {e}", file=sys.stderr)
        time.sleep(1 + attempt * 3)
    return {}


def stock(page_t, ysym, tv, m, sec, kw, now):
    inf = info(ysym)
    name = inf.get("longName") or inf.get("shortName") or ""
    if not name or kw.lower() not in name.lower():
        print(f"SKIP {page_t} ({ysym}): Yahoo name '{name}' does not contain '{kw}'", file=sys.stderr)
        return None
    hist = closes(ysym)
    if len(hist) < 2:
        print(f"SKIP {page_t}: no price history", file=sys.stderr)
        return None
    d, p = hist[-1]
    prev = hist[-2][1]
    pe, fpe = num(inf.get("trailingPE")), num(inf.get("forwardPE"))
    na = inf.get("numberOfAnalystOpinions")
    rec = (inf.get("recommendationKey") or "").strip().lower()
    dps = num(inf.get("dividendRate"))
    if dps is None:
        dps = num(inf.get("trailingAnnualDividendRate"))
    return {
        "t": page_t, "n": name, "m": m, "sec": sec, "cur": "MYR" if m == "MY" else "USD", "tv": tv, "y": ysym,
        "ex": "Bursa" if m == "MY" else ("NYSE" if page_t in NYSE_LISTED else "NASDAQ"),
        "p": p, "ch": round((p / prev - 1) * 100, 2) if prev else None, "d": d,
        "asOf": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "intraday": now < close_utc(d, m),
        "pe": pe if pe and pe > 0 else None, "fpe": fpe if fpe and fpe > 0 else None,
        "tgt": num(inf.get("targetMeanPrice")),
        "na": int(na) if isinstance(na, (int, float)) and na > 0 else None,
        "an": None if rec in ("", "none", "n/a") else rec.replace("_", " ").title(),
        "dps": dps,  # None = unknown (never assumed to be 0)
        "lo": num(inf.get("fiftyTwoWeekLow")), "hi": num(inf.get("fiftyTwoWeekHigh")),
        "mc": num(inf.get("marketCap")), "hist": [c for _, c in hist[-30:]][::-1],
        "histDates": [x for x, _ in hist[-30:]][::-1],
    }


# ---------- Whole-market coverage (Yahoo's screener, part of yfinance) ----------
# Every Bursa stock, and US companies worth $2B+ on the main exchanges. One request returns up to 250 stocks,
# so the whole market takes a few dozen requests. These stocks get price, day change, P/E, forward P/E,
# dividend, 52-week range, market cap and the analyst rating — but no price history or analyst target.
SECTORS = ["Basic Materials", "Industrials", "Communication Services", "Healthcare", "Real Estate", "Technology",
           "Energy", "Utilities", "Financial Services", "Consumer Defensive", "Consumer Cyclical"]
US_EXCH = {"NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ", "NYQ": "NYSE", "ASE": "AMEX"}
US_MIN_CAP = 2_000_000_000


def screen_all(m):
    from yfinance import EquityQuery as Q
    base = [Q("eq", ["region", "my" if m == "MY" else "us"])]
    if m == "US":
        base += [Q("is-in", ["exchange"] + list(US_EXCH)), Q("gte", ["intradaymarketcap", US_MIN_CAP])]
    found, ok_req, bad_req = {}, 0, 0
    for sec in SECTORS + [None]:  # a last pass without a sector catches stocks Yahoo hasn't classified
        off = 0
        while off < 3000:
            q = Q("and", base + ([Q("eq", ["sector", sec])] if sec else []))
            try:
                r = yf.screen(q, size=250, offset=off, sortField="intradaymarketcap", sortAsc=False)
                ok_req += 1
            except Exception as e:
                bad_req += 1
                print(f"  screen {m} {sec} offset {off} failed: {e}", file=sys.stderr)
                break
            qs = r.get("quotes") or []
            for x in qs:
                sym = x.get("symbol") or ""
                if sym and (sym not in found or (sec and found[sym][0] is None)):
                    found[sym] = (sec, x)
            off += len(qs)
            if not qs or off >= (r.get("total") or 0):
                break
            time.sleep(SLEEP)
    return found, ok_req, bad_req


def uni_record(sym, sec, x, m, now, used):
    if m == "MY":
        if not re.fullmatch(r"\d{4}\.KL", sym):  # ordinary shares only (no warrants, ETFs or structured warrants)
            return None
        t = (x.get("shortName") or sym[:4]).strip().upper().replace(" ", "")
    else:
        if x.get("quoteType") != "EQUITY" or x.get("exchange") not in US_EXCH:
            return None
        t = sym
    if t in used:
        t = t + (".MY" if m == "MY" else ".US")
    p = num(x.get("regularMarketPrice"))
    ts = x.get("regularMarketTime")
    if not p or p <= 0 or not ts:
        return None
    tz = KL if m == "MY" else NY
    d = datetime.fromtimestamp(int(ts), tz).strftime("%Y-%m-%d")
    rating = (x.get("averageAnalystRating") or "").split(" - ")
    pe, fpe = num(x.get("trailingPE")), num(x.get("forwardPE"))
    dps = num(x.get("dividendRate"))
    if dps is None:
        dps = num(x.get("trailingAnnualDividendRate"))
    rnd = lambda v, k=4: None if v is None else round(v, k)
    rec = {"t": t, "y": sym, "n": x.get("longName") or x.get("shortName") or t, "m": m, "sec": sec or "Other",
           "p": rnd(p), "ch": rnd(num(x.get("regularMarketChangePercent")), 2), "d": d,
           "pe": rnd(pe, 2) if pe and pe > 0 else None, "fpe": rnd(fpe, 2) if fpe and fpe > 0 else None,
           "an": rating[1].strip() if len(rating) == 2 else None, "dps": rnd(dps),
           "lo": rnd(num(x.get("fiftyTwoWeekLow"))), "hi": rnd(num(x.get("fiftyTwoWeekHigh"))),
           "mc": round(x["marketCap"]) if num(x.get("marketCap")) else None}
    if m == "US":
        rec["ex"] = US_EXCH[x["exchange"]]
    return {k: v for k, v in rec.items() if v is not None}  # fetch time is stored once per market (uniAsOf)


def pick_market(now: datetime) -> str:
    v = (os.environ.get("DESK_MARKET") or (sys.argv[1] if len(sys.argv) > 1 else "")).strip().upper()
    if v in {"US", "MY", "ALL"}:
        return v
    if v not in {"", "AUTO"}:
        print(f"Unknown market '{v}'; use AUTO, ALL, US or MY.", file=sys.stderr)
        sys.exit(2)
    h = now.hour  # UTC
    if 0 <= h <= 10:
        return "MY"
    if 13 <= h <= 22:
        return "US"
    return "ALL"


def main() -> int:
    now = datetime.now(timezone.utc)
    mk = pick_market(now)
    stamp = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    print(f"Updating market: {mk}")
    prev = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text())
        except Exception:
            prev = {}
    prev_stocks = {r["t"]: r for r in prev.get("stocks", []) if r and r.get("t")}
    markets = ["US", "MY"] if mk == "ALL" else [mk]
    jobs = [(t, t, ("NYSE:" if t in NYSE_LISTED else "NASDAQ:") + t.replace("-", "."), "US", sec, kw) for t, sec, kw in US] + \
           [(t, f"{code}.KL", None, "MY", sec, kw) for t, code, sec, kw in MY]

    out_stocks, fresh_count, attempted, failed = [], {m: 0 for m in markets}, {m: 0 for m in markets}, []
    for page_t, ysym, tv, m, sec, kw in jobs:
        if m not in markets:
            if page_t in prev_stocks:
                out_stocks.append(prev_stocks[page_t])
            continue
        attempted[m] += 1
        r = stock(page_t, ysym, tv, m, sec, kw, now)
        if r:
            fresh_count[m] += 1
            out_stocks.append(r)
        else:
            failed.append(page_t)
            if page_t in prev_stocks:  # keep old data, clearly marked
                old = dict(prev_stocks[page_t])
                old["stale"] = True
                out_stocks.append(old)
        time.sleep(SLEEP)

    # whole market: everything not already covered in detail above
    core_syms = {r.get("y") for r in out_stocks}
    used = {r["t"] for r in out_stocks}
    prev_uni = {r["y"]: r for r in prev.get("uni", []) if r and r.get("y")}
    uni, uni_fresh = [], {}
    uni_asof = dict(prev.get("uniAsOf") or {})
    for m in ["US", "MY"]:
        if m not in markets:
            uni += [r for r in prev_uni.values() if r["m"] == m and r["y"] not in core_syms]
            continue
        found, ok_req, bad_req = screen_all(m)
        n = 0
        for sym, (sec, x) in found.items():
            if sym in core_syms:
                continue
            r = uni_record(sym, sec, x, m, now, used)
            if r:
                used.add(r["t"]); uni.append(r); n += 1
        if bad_req and not n:  # the screener failed: keep yesterday's list, clearly marked
            uni += [dict(r, stale=True) for r in prev_uni.values() if r["m"] == m and r["y"] not in core_syms]
        uni_fresh[m] = n
        if n:
            uni_asof[m] = stamp
        print(f"Whole market {m}: {n} stocks ({ok_req} requests ok, {bad_req} failed)")

    idx, series = dict(prev.get("idx") or {}), dict(prev.get("series") or {})
    idx_failed = []
    for name, (ysym, m) in INDEX.items():
        if m not in markets:
            continue
        h = closes(ysym, "2mo")
        if len(h) >= 2:
            d, v = h[-1]
            idx[name] = {"v": round(v, 4), "c": round((v / h[-2][1] - 1) * 100, 2), "d": d, "asOf": stamp, "intraday": now < close_utc(d, m)}
            series[name] = h[-25:]
        else:
            idx_failed.append(name)
            if name in idx:
                idx[name] = dict(idx[name], stale=True)
        time.sleep(SLEEP)

    mk_updated = dict(prev.get("mkUpdated") or {})
    ok_markets, bad_markets = [], []
    for m in markets:
        if attempted[m] and fresh_count[m] >= attempted[m] / 2:
            mk_updated[m] = stamp
            ok_markets.append(m)
        else:
            bad_markets.append(m)

    out = {
        "updated": stamp if ok_markets else prev.get("updated"),
        "lastAttempt": stamp,
        "lastAttemptMarkets": markets,
        "source": "Yahoo Finance via yfinance (delayed ~15 min / end-of-day)",
        "stocks": out_stocks, "uni": uni, "uniFresh": uni_fresh, "uniAsOf": uni_asof, "idx": idx, "series": series,
        "mkUpdated": mk_updated,
        "failed": failed, "idxFailed": idx_failed,
        "fresh": fresh_count, "attempted": attempted,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"Fresh: {fresh_count} of {attempted}. Failed stocks: {failed}. Failed indices: {idx_failed}")
    if bad_markets:
        # The file is still written (so the page can show the failed attempt), but the run fails visibly.
        print(f"ERROR: too few fresh prices for {bad_markets}; their 'updated' time was NOT moved forward.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
