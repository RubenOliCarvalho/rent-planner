# Rent planner

A free, private planner for renting in South Africa:

1. **Income**: take-home pay, or an estimate from gross salary (SARS 2026/27 PAYE and UIF).
2. **Budget**: full line items, today and after the move.
3. **Rent and move-in cash**: the highest rent that fits (the lowest of three checks: what the budget
   leaves, a share of income, and the landlord's income test), the cash needed before moving in, and the
   earliest month someone can afford to move.
4. **Find a rental**: choose areas, type, bedrooms, max rent, must-haves and sites. Open the searches on
   Property24 and Private Property, then send the listings back with the **Send to Rent planner** bookmark.
   Each listing is checked against the filters and the budget.

**Nothing is saved or sent anywhere.** Everything runs in the visitor's browser tab. People keep a plan by
downloading it (a `.json` file) or with a share link. The plan sits in the part of the link after `#`, which
browsers never send to a server.

## How the rental search works

A static page can't read other websites, and the property sites don't offer a public feed. So the visitor's
own browser does the reading:

- The app opens each site's search for the chosen areas in a new tab.
- On a results page, the **Send to Rent planner** bookmark (a bookmarklet) reads the listings on the page and
  hands them back to the app tab with `postMessage`. On a single listing, it adds the details results pages
  leave out (pets, furnishing, deposit, availability).
- If the site tab wasn't opened from the app, the bookmark copies the listings instead, and the visitor pastes
  them into the app.
- Listings can also be added by hand, which is the way to go on a phone.

The bookmark only runs when the visitor clicks it on a page they opened themselves. Nothing is fetched
automatically. The parsers in `js/parsers.js` depend on each site's page layout, so they need updating when a
site changes its pages.

## Run it locally

The bookmark is built from `js/parsers.js` with `fetch`, so open the page from a web address, not as a file:

```
python -m http.server 8000
```

Then go to http://localhost:8000.

## Tests

```
node --test tests/maths.test.mjs
```

These cover the tax tables, budget, rent limit and move timing.

## Publish on GitHub Pages

1. Create a public repository, for example `rent-planner`, and push these files to its `main` branch.
2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` and `/ (root)`.
3. The site appears at `https://<your-user>.github.io/rent-planner/` after a minute or two.

The empty `.nojekyll` file tells GitHub Pages to serve the files exactly as they are.

## Updating each year

The SARS tables are in `js/tax.js` (`TAX_TABLE`). Update them after each February Budget, then run the tests.

## Files

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | The page |
| `js/app.js` | The interface: inputs, tables, search links, bookmark, download and share |
| `js/planner.js` | Budget, rent limit, move cost, earliest move, listing checks (pure functions) |
| `js/tax.js` | SARS 2026/27 PAYE, UIF, medical tax credits |
| `js/defaults.js` | Starting budget lines, areas with each site's search address, sites |
| `js/parsers.js` | Reads Property24 and Private Property pages (used by the bookmark) |

Estimates only, not financial or tax advice. Not affiliated with Property24 or Private Property. Listing
content belongs to those sites and their agents.
