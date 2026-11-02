# CR7 Goal Tracker — The Road to 1,000

Responsive website tracking Cristiano Ronaldo's official senior career goals, recent scoring moments, match events, and his progress toward 1,000. Built with HTML, CSS, JavaScript, and a zero-dependency Node.js server.

## Start the site

1. Install **Node.js 18 or newer**.
2. Open a terminal inside `cr7-goal-tracker`.
3. Run `npm start` or `node server.js`.
4. Open **http://localhost:3000**.

The website works immediately in **demo/snapshot mode** (no API key), using selected sourced goals from October 2026. No live score or match data is fabricated in this mode.

## Enable live goals

1. Register for an API key at https://dashboard.api-football.com/register .
2. Copy `.env.example` to a new file named `.env`.
3. In `.env`, replace `YOUR_API_FOOTBALL_KEY_HERE` with the actual key.
4. Restart `npm start`.
5. Keep the server running and the page open for live browser alerts.

**Never commit `.env` or place the key in frontend JavaScript**. The backend passes it in the `x-apisports-key` header. Works with HTTPS hosting that supports persistent Node.js processes and a writable `data/` directory. A static GitHub Pages website *alone* cannot run this Node backend or safely hold a private API key. For deployment, choose a Node-compatible host and configure `API_FOOTBALL_KEY` as an environment variable.

## How the goal counter works

- **985** official senior career goals (baseline through **October 30, 2026**), supported by https://www.ronaldostats.app/ . 9 club goals in the 2026/27 season, and 28 calendar-year goals in 2026, at the same source cutoff.
- The backend discovers the API-Football team IDs for **Al Nassr** and **Portugal** on first connection.
- It loads team fixtures starting October 31, 2026, then checks individual match events after kickoff.
- Every new Ronaldo goal event (`Goal`/`Normal Goal` or `Penalty`, not own goals or missed penalties) increments the 985 baseline. The app counts only events dated after the baseline to prevent double counting.
- All detected goal events are stored server-side in `data/tracker.json`; repeated fixture fetches recheck events, so corrected goals can be removed from the tally.
- The frontend displays source status and alerts when a **new event is first observed**. Alerts are for an **open webpage**, not background push notifications to a closed browser.

**Data limitation:** The count is provisional when the API data is incomplete, delayed, corrected, or missing a competition. Only official senior club and Portugal match goals should be counted, and API-Football's coverage may differ by league. Review the latest verified baseline periodically, especially after major provider corrections or if the server was offline. The historical goal log contains *selected examples*, not Ronaldo's complete 985-goal archive.

### Refreshing and API budgets

The browser requests the local backend every minute while visible. The backend caches upstream data and normally polls roughly every **two minutes during a match**, otherwise at most roughly every 30 minutes; team schedules resync every six hours. When a scheduled kickoff approaches, polling accelerates. The backend caps upstream usage at **90 calls per UTC day** by default (editable in `.env`). API-Football's free tier currently allows 100 calls/day; detailed live data may still be delayed or not covered. A paid plan may be helpful if you want faster updates and several games per day.

### Historical note

October 29, 2026: Ronaldo scored a hat-trick vs Al Kholood for career goals **983–985** (66', 72', 81') according to the ESPN goal-tracking report; the October 23 attribution for **goal 982** has been disputed by sources, so the demo labels it as such. Report: https://www.espn.com/soccer/story/_/id/46751020/cristiano-ronaldo-goal-tracker-road-1000-career-goals

## File structure

```text
cr7-goal-tracker/
├─ server.js             # API proxy, team discovery, caching, goal-event matching
├─ public/
│  ├─ index.html         # Website structure
│  ├─ styles.css         # Responsive visual design
│  └─ app.js             # Filters, match cards, alerts, fetch loop
├─ .env.example          # Configuration example (copy to .env)
├─ .gitignore
├─ tests/
└─ package.json
```

## Customize

Edit `public/styles.css` to change the dark/lime theme. Update `public/index.html` for headlines and sections. If the starting total is updated after an external audit, also adjust `SNAPSHOT.start` / `SNAPSHOT.cutoff` in `server.js`, reset the stored `data/tracker.json` if necessary, and avoid overlapping old/new goal events. A newer baseline without a new cutoff date will double-count goals.

Not affiliated with Cristiano Ronaldo, Al Nassr, Portugal, or API-Football. The player headshot is served by API-Football's media CDN; check provider terms before commercial redistribution.
