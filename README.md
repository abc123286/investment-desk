# Investment Desk — US & Bursa Malaysia

A personal research dashboard for US and Bursa Malaysia stocks: https://abc123286.github.io/investment-desk/

- **Live market**: TradingView charts and a whole-market screener for US stocks; a Bursa price board from Yahoo Finance (about 15 minutes delayed).
- **Scored stocks**: about 70 stocks (20 researched plus large caps from both markets) get a 0–100 score, a data-confidence score, a label and a trade plan.
- **Locked signals**: when a stock's Balanced label reaches Accumulate or better, its entry, stop and target are locked and tracked to the end (Signal record page).
- **My stocks**: watchlist and portfolio, saved only in your browser.
- **Automatic data**: Bursa every 5 minutes and US every 15 minutes during trading hours (Bursa 9am–5pm MYT; US 9:30pm–5am MYT, an hour later outside US daylight saving), with exchange holidays and US half-days built in.

Not financial advice. Labels, entries and stops are formula outputs, not recommendations.

## How the 15-minute update is started

GitHub's built-in schedule does not start this workflow reliably, so an outside timer (cron-job.org, free) calls GitHub (Bursa job every 5 minutes with market=MY, 9am–5:15pm MYT Mon–Fri; US job every 15 minutes with market=US, 9:30pm–5:15am MYT):

- URL: `https://api.github.com/repos/abc123286/investment-desk/actions/workflows/update.yml/dispatches`
- Method: `POST`, body `{"ref":"main","inputs":{"market":"AUTO"}}`
- Headers: `Accept: application/vnd.github+json`, `Authorization: Bearer <fine-grained token with Actions: read and write on this repo>`

`AUTO` picks Bursa during Malaysian hours and the US at night. If fewer than half of a market's stocks update, the run is marked **failed** (red in the Actions tab), older prices are kept and labelled, and the site shows a banner.

## Files

| Path | What it is |
|---|---|
| `docs/index.html` | Page layout and styles. |
| `docs/app.js` | Draws the page. |
| `docs/engine.js` | All calculations (scores, confidence, labels, moods, plans, signals). The page and the update job both run this file. |
| `docs/research.js` | Researched data: news events, open event risks, catalyst/risk notes, calendar, holidays. Edited by people and by the scheduled Claude news sweeps. |
| `docs/data/desk.json` | Prices, ranges, P/E, targets, 30-day closes, per-stock fetch time. Written by the job. |
| `docs/data/signals.json` | Open and closed signals. Written by the job. |
| `scripts/update.py` | Price updater (yfinance, pinned in `requirements.txt`). Edit the `US` and `MY` lists to add stocks. |
| `scripts/signals.mjs` | Locks and closes signals after each price update. |

## Adding a stock

- **US**: add `("TICKER", "Sector", "word in the company name")` to the `US` list.
- **Bursa**: add `("PAGECODE", "4-digit Bursa code", "Sector", "word in the company name")` to the `MY` list.

If Yahoo's company name doesn't contain that word, the updater skips the stock rather than show the wrong company. New stocks are "not researched" (capped at Hold) until catalysts and risks are added to `S` in `docs/research.js`.

## Closing an event risk

Event risks in `FLAGS` (in `docs/research.js`) never expire on their own. To close one, add `resolved:'YYYY-MM-DD'` and a short `how` note.
