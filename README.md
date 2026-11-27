# Investment Desk — US & Bursa Malaysia

A personal research dashboard for US and Bursa Malaysia stocks.

- **Live market**: live charts for any US or Bursa stock and a whole-market screener, through free TradingView widgets. Bursa prices are usually delayed about 15 minutes.
- **Scored watchlist**: about 70 stocks (20 hand-researched plus large caps from both markets) get a 0–100 score, a data-confidence score, a label and a trade plan. The page calculates all of these from the data file.
- **Automatic data**: a GitHub Action refreshes `docs/data/desk.json` from Yahoo Finance (via the open-source `yfinance` package) three times a day:
  - 12:45pm MYT (Bursa midday)
  - 5:20pm MYT (after Bursa closes)
  - 5:40am MYT (after the US closes)

Not financial advice. Labels, entries and stops are formula outputs, not recommendations.

## One-time setup

1. Create a new **public** repository called `investment-desk` and upload these files (or let Claude push them).
2. **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/docs`. Save. The site appears at `https://<your-username>.github.io/investment-desk/` after a minute or two.
3. **Actions** tab: enable workflows if asked, open **Update data**, and press **Run workflow** once to fill the data file straight away.

## Files

| Path | What it is |
|---|---|
| `docs/index.html` | The dashboard (one page). Works even before the first data update, using the researched snapshot built in. |
| `docs/data/desk.json` | Prices, ranges, P/E, targets and 30-day closes. Written by the Action. |
| `scripts/update.py` | The data updater. Edit the `US` and `MY` lists to add or remove stocks. |
| `.github/workflows/update.yml` | The schedule. GitHub can run scheduled jobs a few minutes late. |

## Adding a stock

- **US**: add `("TICKER", "Sector", "word in the company name")` to the `US` list.
- **Bursa**: add `("PAGECODE", "4-digit Bursa code", "Sector", "word in the company name")` to the `MY` list.

If Yahoo's company name doesn't contain that word, the updater skips the stock rather than show the wrong company.
