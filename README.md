# Candy's Pub & Restaurant — Order Book

A mobile web app for taking food & drink orders at **Candy's Pub & Restaurant** (Candy's Lodge, Vaal Oewer). Built for busy, non-technical staff: everything is blocks and dropdowns.

- **No staff login.** Open the link and take orders.
- **Shared across devices** via one **Google Sheet** — what one phone adds, every phone sees.
- Two modes: **Bartender** (simple ordering) and **Manager** (menu + reports, behind a PIN).

## Bartender mode
- **Open tables** and **Closed tables** shown as **blocks**; a **＋ New table** block to start one (pick a number, optional name).
- Tap an **open** table → the bill. Add items with **dropdowns** (Type → Item → Qty); the **unit price fills in automatically**. Adjust with −/＋, remove with ✕.
- **Close & print bill** settles the table (kept for records) and prints a receipt.
- Tap a **closed** table → the whole bill **read-only**, with **Print** and **Email** (email coming soon).
- No data export — everything lives in the Sheet for the manager.

## Manager mode (PIN)
- Entering Manager asks for a **4-digit PIN** (default **1234** — change it in Manager). The PIN is checked on the server, not stored in the page.
- **Menu:** add / remove food & drink items and set **prices**. Applies to every device.
- **Reports:** KPIs (today’s sales, tables), a **sales-per-day** chart, and **most-purchased items**.

## How it works
```
 mobile web page  ──►  Google Apps Script web app  ──►  Google Sheet (database)
 (index.html)          (apps-script/Code.gs)            Menu · Tabs · OrderLines · Settings
```
The page is a static file (free on GitHub Pages). Data goes to a Google Sheet through a small Apps Script web app deployed with **Anyone** access — that's what removes the staff login.

## Setup / re-deploy
See [`SETUP.md`](SETUP.md). Backend code: [`apps-script/Code.gs`](apps-script/Code.gs). The web-app URL it talks to is `SCRIPT_URL` near the top of the script in [`index.html`](index.html).

## Notes & limits
- The web-app endpoint is **public** (Anyone access). The PIN gates the Manager *screen*, not the raw API — fine for a small pub, but ask if you want a stronger gate.
- Taking orders needs internet (menu is cached for display; saving needs the connection).
- **Email the bill** is stubbed as "coming soon" — to be built next.
