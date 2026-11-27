"""One-off check: can Yahoo's screener (via yfinance) list the whole market? Prints only."""
import re, yfinance as yf
from yfinance import EquityQuery as Q

def yahoo(region, extra=None):
    q = Q('eq', ['region', region]) if not extra else Q('and', [Q('eq', ['region', region])] + extra)
    r = yf.screen(q, size=250, offset=0, sortField='intradaymarketcap', sortAsc=False)
    qs = r.get('quotes', [])
    print(f"YAHOO {region}: total={r.get('total')} got={len(qs)}")
    if qs:
        print(" keys:", sorted(qs[0].keys()))
        for x in qs[:3]:
            print(" ", {k: x.get(k) for k in ('symbol','shortName','longName','displayName','regularMarketPrice','regularMarketChangePercent','trailingPE','forwardPE','dividendRate','averageAnalystRating','marketCap','regularMarketTime','fiftyTwoWeekLow')})
        print(" 4-digit .KL:", sum(1 for x in qs if re.fullmatch(r'\d{4}\.KL', x.get('symbol', ''))))
        g = [x for x in qs if x.get('symbol') == '5102.KL']
        print(" GCB 5102.KL:", g[:1])

for label, fn in [('my', lambda: yahoo('my')), ('us', lambda: yahoo('us', [Q('gte', ['intradaymarketcap', 2_000_000_000])]))]:
    try: fn()
    except Exception as e: print(label, 'FAILED', repr(e)[:300])
