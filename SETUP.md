# Setup — Google Sheet backend

The app stores its **menu and orders in one Google Sheet**, fronted by a standalone Google
Apps Script "web app" so staff need no login. This is already set up for Candy's Lodge — the
steps below are for reference or for rebuilding on another account.

## Already configured
- **Sheet:** *Candy's Pub — Orders* (owned by the Candy's Lodge Google account).
- **Script:** a standalone Apps Script project that opens the Sheet by ID and is deployed as a
  web app (**Execute as: Me**, **Who has access: Anyone**).
- **App wiring:** the web-app `/exec` URL is set in `SCRIPT_URL` near the top of the script in
  [`index.html`](index.html).

## To rebuild from scratch
1. **Create the Sheet** at <https://sheets.google.com> and note its ID (the long string in the
   URL: `/spreadsheets/d/<SHEET_ID>/edit`). The script auto-creates the `Menu`, `Tabs`, and
   `OrderLines` tabs and seeds the menu on first run.
2. **Create the script:** <https://script.google.com> → **New project**. Delete the sample code
   and paste all of [`apps-script/Code.gs`](apps-script/Code.gs).
3. **Point it at the Sheet:** set `SHEET_ID` at the top of `Code.gs` to your Sheet's ID. Save.
4. **Deploy:** **Deploy → New deployment → (gear) Web app**, **Execute as: Me**,
   **Who has access: Anyone → Deploy**. Approve the authorization prompt (your own script
   accessing your own Sheet). Copy the **Web app URL** (ends in `/exec`).
5. **Wire the app:** put that URL in `SCRIPT_URL` near the top of the script in `index.html`,
   save, and publish (push to GitHub).

## Maintaining the menu
Edit the **Menu** tab in the Sheet, or use the app's **Manager → Menu** screen — either updates
every device. Columns: `id | name | category (Food/Drink) | price | active`.

## Manager PIN
The Manager mode is gated by a 4-digit PIN stored in the **Settings** tab (`managerPin`, default
**1234**). Change it in-app under **Manager → Menu → Manager PIN**, or edit the Settings row directly.
The PIN is verified server-side, so it never appears in the public page.

## Updating the backend code later
Edit `Code.gs`, then **Deploy → Manage deployments → (edit) → Version: New version → Deploy**.
The `/exec` URL stays the same, so no app change is needed.
