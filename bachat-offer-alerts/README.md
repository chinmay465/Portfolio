# Bachat · बचत

Offer alerts for Zomato, Swiggy, Instamart, Blinkit, Zepto, BigBasket, Amazon, Flipkart, Myntra, Ajio, Nykaa, JioMart, PVR INOX, BookMyShow and District. Bachat watches public deal channels, works out the store and the real discount from every post, and alerts you when one beats your rules. Extraordinary deals (real 90%+ off, ₹1 deals and price errors) get their own loud alert.

It comes in two forms that share one engine:

| | Web app (PWA) | Android app |
| --- | --- | --- |
| Where | [bachat-offer-alerts.onrender.com](https://bachat-offer-alerts.onrender.com), installable from the browser | APK from CI (`bachat-debug-apk`) |
| Checks | Every 10 minutes from GitHub Actions, plus **Check now** | Every 15, 30 or 60 minutes on the phone (WorkManager), plus **Check now** |
| Alerts | Web push (Android Chrome, desktop; iPhone once added to the Home Screen) | Android notifications: an Offers channel and a high-priority Extraordinary channel |
| Settings | Kept in the browser and on the server for that push subscription | Kept on the phone |

## Alert rules

- **Minimum discount** (0–95%, default 60%).
- **Stores**: tick or untick each store, or a whole group (food, quick commerce, shopping, movies).
- **Offers available now or earlier**: "Live now" (posted within 1–24 h, default 3 h) and "Posted earlier", each on or off.
- **Extraordinary deals**: on by default at 90%+, adjustable from 70% to 99%. Price errors always count. They can come from any store, even ones you switched off, and they skip quiet hours. "Up to 90% off" sale banners don't count.
- "Up to X%" claims and coupons with no stated discount, each on or off.
- Keywords to require, words to mute, and quiet hours.
- Extra public Telegram deal channels.

At most five alerts go out per check; anything more becomes one "N more offers match" alert. A deal never alerts twice.

## How the discount is worked out

`shared/discount.ts` (and its Kotlin port, `android/app/src/main/java/com/chinmay/bachat/core/Discount.kt`) reads, in order of trust:

1. Price against MRP: `₹200 ~~₹4,999~~` (struck-out prices in Telegram posts), `MRP ₹999`, `worth ₹500 for ₹49`, `₹999 → ₹99`, `from ₹1,999 to ₹599`.
2. Stated percentages: `96% off`, `flat 60%`, `-91%`, `up to 80% off` (marked as "up to").
3. Flat amounts off a minimum order: `₹150 off on orders above ₹199` → 75%.
4. Buy X get Y, and ₹1 or free deals.

"100% cotton" and similar aren't discounts. Price-error wording ("price error", "pricing glitch") is flagged separately. The store comes from the post's links first (`swiggy.com/instamart` beats `swiggy.com`), then the earliest store name in the text. `shared/fixtures/cases.json` holds the cases both apps must agree on; the web tests and the Android unit tests both run it.

## What it can and can't see

- ✅ **Public deal channels**: DesiDime, GrabOn India, PowerLoot and EarnKaro on Telegram (read through the public `t.me/s/` web preview, no login or API key), plus any public channel you add. CI's live source check (`npm run probe -- --show`) prints how every current post is read. RSS and Atom feeds are supported in code as well.
- ➖ **Offers only inside your account**: personal coupons in the Swiggy, Zomato and Blinkit apps depend on your login and address, and no open feed exists. Swiggy's Builders Club API is invite-only and built for ordering. Zomato's MCP server is for ordering through an AI assistant.
- ➖ **Amazon and PVR offer pages** block automated reading, and Amazon's product API (now the Creators API) is for its affiliates. Bachat relies on deal posts for them.

## Run it

```bash
npm install
npm run dev                      # web app on :5173, API on :3000
BACHAT_FIXTURES=1 npm run dev    # the same, with offline sample deals
npm test                         # shared engine, server and scanner
npm run build && npm run test:e2e
npm run probe -- desidime somechannel   # check channels without a database
```

Environment: `DATABASE_URL` (Postgres; without it an embedded PGlite database in `data/`), `BACHAT_SCAN_MINUTES` (checks while the service is awake, default 10, 0 for none), `BACHAT_FIXTURES=1` (offline sources), `BACHAT_CONTACT` (VAPID contact URL).

## Deploy

1. Create a free Postgres database (Neon works) and copy its connection string.
2. In Render, the Blueprint adds `bachat-offer-alerts`; paste the connection string into `DATABASE_URL`.
3. In GitHub, add the same string as the repo secret `BACHAT_DATABASE_URL`. `.github/workflows/bachat-scan.yml` then checks every 10 minutes and sends the push alerts, so the Render service can sleep.

The VAPID keys for web push are made on first start and kept in the database, so the service and the scanner share them without more configuration.

## Android

`android/` is a Kotlin + Jetpack Compose app (minSdk 26). It reads the store list and default sources from `shared/data` and checks the sources itself, on the phone's own connection, so the channels see a normal home connection rather than a cloud server. CI runs the unit tests (including the shared cases), builds the APK, runs `scripts/privacy-check.sh` (only INTERNET and POST_NOTIFICATIONS plus WorkManager's own, no tracker SDKs, no unreviewed endpoints) and uploads `bachat-debug-apk`.
