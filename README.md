# Order Book

A dead-simple app for recording what clients ordered — **food and drinks** — for a small restaurant in Vaal Oewer.

- **No login, no server, no setup.** It's a single `index.html` file.
- **Works offline.** Everything runs in the browser.
- **Saves locally.** Orders are stored in the browser's own storage (`localStorage`) on that device — nothing leaves the phone/tablet/PC.

## Use it

Open `index.html` in any browser. For each order:

1. Enter the **table or client** name (optional).
2. Pick **Food** or **Drink**.
3. Type the **item**, set the **quantity**, and optionally a **price each** (in Rand).
4. Tap **Add to order book**.

The list below shows every order with a running item count and total. You can:

- **Filter** by a specific table/client to see (and total) just their tab.
- **Export CSV** to save the day's orders as a spreadsheet file.
- **Clear all** to wipe the list and start fresh.

> ⚠️ Because data is saved *on the device*, clearing the browser's site data — or opening the app on a different device — starts with an empty list. It's meant as a quick per-device tally, not a shared database.

## Host it for free (optional)

This is a static page, so [GitHub Pages](https://pages.github.com/) can serve it at a public URL:

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build from branch → `main` / root**.
3. Open the URL GitHub gives you on any phone or tablet.
