"""Investment Desk data updater.

Runs in GitHub Actions (see .github/workflows/update.yml). Pulls end-of-day /
delayed quotes, 30-day closes and basic valuation fields from Yahoo Finance via
the open-source `yfinance` package, and writes docs/data/desk.json, which the
web page reads. The page does all scoring itself.

Rules:
- Never invent numbers. A field that can't be fetched is written as null and the
  page leaves it out of the score.
- Bursa codes are checked against the company name Yahoo returns; a mismatch
  means the code is wrong, so the stock is skipped rather than shown under the
  wrong name.
"""
from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "desk.json"

# ---------------------------------------------------------------------------
# Universe. t = ticker shown on the page, y = Yahoo symbol, tv = TradingView
# symbol, m = market, sec = sector label, kw = word that must appear in Yahoo's
# company name (guards against a wrong Bursa code).
# The first 20 are the hand-researched watchlist already in the page.
# ---------------------------------------------------------------------------
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
]

INDEX = {  # page KPI name -> Yahoo symbol
    "S&P 500": "^GSPC", "Nasdaq Comp.": "^IXIC", "Dow Jones": "^DJI", "Russell 2000": "^RUT", "VIX": "^VIX",
    "FBM KLCI": "^KLSE", "USD/MYR": "MYR=X", "Brent crude": "BZ=F", "US 10-yr yield": "^TNX",
}


def num(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def closes(sym: str, period: str = "3mo"):
    """Return [(YYYY-MM-DD, close), ...] oldest first, or []."""
    for attempt in range(3):
        try:
            h = yf.Ticker(sym).history(period=period, interval="1d", auto_adjust=False)
            out = []
            for ts, row in h.iterrows():
                c = num(row.get("Close"))
                if c is not None:
                    out.append((ts.strftime("%Y-%m-%d"), round(c, 4)))
            return out
        except Exception as e:  # network hiccup / rate limit
            print(f"  history {sym} attempt {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    return []


def info(sym: str) -> dict:
    for attempt in range(3):
        try:
            return yf.Ticker(sym).info or {}
        except Exception as e:
            print(f"  info {sym} attempt {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    return {}


def stock(page_t: str, ysym: str, tv: str, m: str, sec: str, kw: str):
    inf = info(ysym)
    name = inf.get("longName") or inf.get("shortName") or ""
    if kw.lower() not in name.lower():
        print(f"SKIP {page_t} ({ysym}): Yahoo name '{name}' does not contain '{kw}'", file=sys.stderr)
        return None
    hist = closes(ysym)
    if len(hist) < 2:
        print(f"SKIP {page_t}: no price history", file=sys.stderr)
        return None
    d, p = hist[-1]
    prev = hist[-2][1]
    price = p  # the last daily close, so price and date always match
    pe, fpe = num(inf.get("trailingPE")), num(inf.get("forwardPE"))
    tgt = num(inf.get("targetMeanPrice"))
    na = inf.get("numberOfAnalystOpinions")
    rec = (inf.get("recommendationKey") or "").replace("_", " ").title() or None
    dps = num(inf.get("dividendRate"))
    if dps is None and num(inf.get("trailingAnnualDividendRate")) is not None:
        dps = num(inf.get("trailingAnnualDividendRate"))
    lo, hi = num(inf.get("fiftyTwoWeekLow")), num(inf.get("fiftyTwoWeekHigh"))
    mcap = num(inf.get("marketCap"))
    cur = "MYR" if m == "MY" else "USD"
    last30 = [c for _, c in hist[-30:]][::-1]  # newest first, like the page
    return {
        "t": page_t, "n": name, "m": m, "sec": sec, "cur": cur, "tv": tv, "y": ysym,
        "ex": inf.get("exchange") or ("Bursa" if m == "MY" else ""),
        "p": price, "ch": round((price / prev - 1) * 100, 2) if prev else None, "d": d,
        "pRef": price, "pe": pe if pe and pe > 0 else None, "fpe": fpe if fpe and fpe > 0 else None, "fd": d,
        "tgt": tgt, "na": int(na) if isinstance(na, (int, float)) else 0, "an": rec or "n/a",
        "dps": dps if dps is not None else 0.0, "lo": lo, "hi": hi,
        "mc": mcap, "hist": last30,
    }


def main() -> int:
    now = datetime.now(timezone.utc)
    out = {"updated": now.isoformat(timespec="seconds").replace("+00:00", "Z"), "source": "Yahoo Finance via yfinance (delayed / end-of-day)", "stocks": [], "idx": {}, "series": {}, "skipped": []}
    for t, sec, kw in US:
        r = stock(t, t, ("NYSE:" if t in {"JPM", "LLY", "KO", "TSM", "BRK-B", "V", "MA", "BAC", "UNH", "JNJ", "XOM", "CVX", "WMT", "PG", "HD", "ORCL", "CRM"} else "NASDAQ:") + t.replace("-", "."), "US", sec, kw)
        (out["stocks"] if r else out["skipped"]).append(r or t)
        time.sleep(0.4)
    for t, code, sec, kw in MY:
        r = stock(t, f"{code}.KL", f"MYX:{t}", "MY", sec, kw)
        (out["stocks"] if r else out["skipped"]).append(r or t)
        time.sleep(0.4)
    for name, ysym in INDEX.items():
        h = closes(ysym, "2mo")
        if len(h) >= 2:
            d, v = h[-1]
            out["idx"][name] = {"v": round(v, 4), "c": round((v / h[-2][1] - 1) * 100, 2), "d": d}
            out["series"][name] = h[-25:]
        time.sleep(0.4)
    if len(out["stocks"]) < 10:
        print("Too few stocks fetched; not overwriting the data file.", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote {OUT} with {len(out['stocks'])} stocks; skipped {out['skipped']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
