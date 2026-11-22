/* Rent planner: listing parsers.
   Reads a Property24 or Private Property page that the person has open in their own browser.
   Used two ways: inside the app (tests, pasted data) and inside the "Send to Rent planner"
   bookmark, which runs this same file on the site's page. Classic script, no imports. */
var RPParse = (function () {
  "use strict";

  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  function txt(el) { return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

  // "R 11 000" / "R 24 000 per month" -> 11000; "POA" -> null.
  // Only thousand groups count, so "R 11 000 1 Bedroom" reads 11000, not 110001.
  function money(t) {
    if (!t) return null;
    var m = String(t).match(/R\s*(\d{1,3}(?:[   ,]\d{3})*|\d+)(?:\.\d{1,2})?(?!\d)/);
    if (!m) return null;
    var v = parseFloat(m[1].replace(/[\s  ,]/g, ""));
    return v > 0 ? v : null;
  }

  function num(t) {
    if (t == null) return null;
    var m = String(t).replace(/ /g, " ").match(/\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : null;
  }

  function propType(t) {
    t = (t || "").toLowerCase();
    if (/commercial|office|retail|industrial|warehouse|shop to|business premises/.test(t)) return "commercial";
    if (/townhouse|cluster|duplex|simplex/.test(t)) return "townhouse";
    if (/apartment|flat|bachelor|studio|penthouse|loft/.test(t)) return "apartment";
    if (/house|cottage/.test(t)) return "house";
    if (/room/.test(t)) return "room";
    return "other";
  }

  var NO_PETS = [/\bno pets?\b/, /\bpets?\s*allowed\s*[:\-]?\s*no\b/, /\bnot\s+pet[- ]friendly\b/,
    /\bpets?\s+(?:are\s+)?not\s+(?:allowed|permitted)\b/, /\bno\s+animals\b/, /\bstrictly\s+no\s+pets\b/];
  var YES_PETS = [/\bpets?\s*allowed\s*[:\-]?\s*yes\b/, /\bpet[- ]friendly\b/,
    /\bpets?\s+(?:are\s+)?(?:allowed|welcome|considered|permitted)\b/, /\bcats?\s+(?:allowed|welcome|considered|permitted)\b/];
  var SHARED = [/\brooms? (?:to rent|for rent|available|to let)\b/, /\bper room\b/,
    /\bstudent (?:accommodation|digs|rooms?|house|commune|living|residence|res)\b/, /\bdigs\b/,
    /\bshared (?:house|home|apartment|flat|unit|space|kitchen|bathroom|accommodation|living)\b/, /\bcommune\b/,
    /\bprice is per (?:person|room|bed|student)\b/, /\bper (?:person|student|bed)\b/, /\bhouse ?share\b/, /\bflat ?share\b/,
    /\bcommunal (?:kitchen|bathroom|lounge)\b/, /\bco-?living\b/, /\bavailable:? ?\d+ rooms?\b/,
    /\b(?:a|one|1) room (?:in|available)\b/, /\bsharing with\b/];

  function any(list, t) { for (var i = 0; i < list.length; i++) if (list[i].test(t)) return true; return false; }

  function pets(text) {
    var t = (text || "").toLowerCase();
    if (any(NO_PETS, t)) return "no";
    if (any(YES_PETS, t)) return "yes";
    return "unknown";
  }

  function furnished(text) {
    var m = (text || "").match(/\bFurnished\s+(Yes|No|Optional)\b/);
    if (m) return m[1].toLowerCase();
    var t = (text || "").toLowerCase();
    if (t.indexOf("unfurnished") >= 0 || t.indexOf("un-furnished") >= 0) return "no";
    if (/\b(fully|semi|partly|partially)[- ]furnished\b|\bfurnished (apartment|flat|unit|home|house)\b/.test(t)) return "yes";
    return "unknown";
  }

  function shared(text) { return any(SHARED, (text || "").toLowerCase()); }

  function deposit(text, rent) {
    var m = (text || "").match(/Deposit\s*[:\-]?\s*(R\s?[\d\s ,]+)/i);
    if (m) return money(m[1]);
    m = (text || "").match(/(\d+(?:\.\d)?|one|two|three)\s*(?:x\s*)?months?'?s?\s*(?:rental\s*)?deposit/i) ||
        (text || "").match(/deposit\s*(?:of|is|:|-)?\s*(\d+(?:\.\d)?|one|two|three)\s*months?/i);
    if (m && rent) {
      var n = { one: 1, two: 2, three: 3 }[m[1].toLowerCase()] || parseFloat(m[1]);
      return n * rent;
    }
    return null;
  }

  // -> ISO date "2026-12-01", "now", or null. A date with no year is taken as the next one.
  function available(text, today) {
    today = today || new Date();
    if (/Available\s*:?\s*(Now|Immediately)/i.test(text || "")) return "now";
    var m = (text || "").match(/(?:Available(?: from)?|Occupation(?: Date)?)\s*:?\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s*(\d{4})?/i);
    if (!m) return null;
    var mon = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
    if (mon < 0) return null;
    var d = Math.min(parseInt(m[1], 10), 28), y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
    var when = new Date(y, mon, d);
    if (!m[3] && (today - when) / 864e5 > 45) when = new Date(y + 1, mon, d);
    else if (!m[3] && (when - today) / 864e5 > 300) when = new Date(y - 1, mon, d);
    return when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
  }

  // Many bedrooms at a one-room price: usually a student let priced per room.
  function looksPerRoom(l) { return (l.beds || 0) >= 3 && (l.rent || 0) > 0 && l.rent / l.beds < 2500; }

  function finish(l) {
    var t = (l.title || "") + " " + (l.description || "");
    if (l.beds == null && /bachelor|studio/i.test(l.title || "")) l.beds = 0.5;
    l.shared = !!(l.shared || shared(t) || looksPerRoom(l));
    if (!l.pets || l.pets === "unknown") l.pets = pets(t);
    if (!l.furnished || l.furnished === "unknown") l.furnished = furnished(t);
    return l;
  }

  // ---- Property24 results page ----
  function p24Results(doc) {
    var out = [], tiles = doc.querySelectorAll(".js_resultTile");
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i], links = tile.querySelectorAll("a[href]"), a = null, m = null;
      for (var j = 0; j < links.length && !m; j++) {
        m = links[j].getAttribute("href").match(/\/to-rent\/([^/]+)\/[^/]+\/[^/]+\/(\d+)\/(\d{6,})/);
        if (m) a = links[j];
      }
      if (!m) continue;
      var inner = tile.querySelector("[title]");
      var title = txt(tile.querySelector(".p24_description")) || (inner ? inner.getAttribute("title") : "");
      var feats = {};
      tile.querySelectorAll(".p24_featureDetails").forEach(function (f) {
        var spans = f.querySelectorAll("span");
        feats[(f.getAttribute("title") || "").toLowerCase()] = spans.length ? txt(spans[spans.length - 1]) : txt(f);
      });
      var loc = txt(tile.querySelector(".p24_location"));
      out.push(finish({
        site: "property24", id: m[3],
        url: "https://www.property24.com" + a.getAttribute("href").split("?")[0],
        suburb: loc || m[1].replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
        title: title, type: propType(title),
        rent: money(txt(tile.querySelector(".p24_price"))),
        beds: num(feats["bedrooms"]), baths: num(feats["bathrooms"]),
        parking: num(feats["parking spaces"] || feats["garages"]), size: num(feats["floor size"]),
        pets: "unknown", furnished: "unknown"
      }));
    }
    return out;
  }

  // ---- Private Property results page ----
  function ppResults(doc) {
    var out = [], cards = doc.querySelectorAll("a.listing-result");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], href = card.getAttribute("href") || "", m = href.match(/\/(RR\d+)/);
      if (!m) continue;
      var title = card.getAttribute("title") || txt(card.querySelector(".listing-result__title"));
      var feats = {};
      card.querySelectorAll(".listing-result__feature").forEach(function (f) {
        feats[(f.getAttribute("title") || "").toLowerCase()] = txt(f);
      });
      var avail = txt(card.querySelector(".listing-result__badge--available-from")).replace("Available:", "").trim();
      var desc = txt(card.querySelector(".listing-result__description")).slice(0, 600);
      var parking = num(feats["parking spaces"]);
      if (parking == null) parking = num(feats["garages"]);
      out.push(finish({
        site: "privateproperty", id: m[1],
        url: (href.indexOf("http") === 0 ? "" : "https://www.privateproperty.co.za") + href.split("?")[0],
        suburb: txt(card.querySelector(".listing-result__desktop-suburb") || card.querySelector(".listing-result__mobile-suburb")) || null,
        title: title, type: propType(title),
        rent: money(txt(card.querySelector(".listing-result__price"))),
        beds: num(feats["bedrooms"]), baths: num(feats["bathrooms"]), parking: parking, size: num(feats["floor size"]),
        available: avail ? available("Available " + avail) : null,
        description: desc, pets: "unknown", furnished: "unknown"
      }));
    }
    return out;
  }

  function meta(doc, prop) {
    var m = doc.querySelector('meta[property="' + prop + '"]');
    return m ? (m.getAttribute("content") || "").trim() : "";
  }

  function pageText(doc) {
    var root = doc.body ? doc.body.cloneNode(true) : null;
    if (!root) return "";
    root.querySelectorAll("script,style,noscript,svg,header,nav,footer").forEach(function (x) { x.remove(); });
    return (root.textContent || "").replace(/\s+/g, " ").trim();
  }

  // ---- A single listing page on either site ----
  function detail(doc, url, site) {
    url = meta(doc, "og:url") || url;
    var m = site === "property24" ? url.match(/\/(\d{6,})(?:[/?#]|$)/) : url.match(/\/(RR\d+)/);
    if (!m) return null;
    var title = txt(doc.querySelector("h1")) || meta(doc, "og:title");
    var priceEl = doc.querySelector(".p24_price, .listing-price-display__price");
    var rent = money(txt(priceEl)) || money(meta(doc, "og:title")) || money(meta(doc, "og:description"));
    var text = pageText(doc);
    var bm = title.match(/(\d+(?:\.5)?)\s+Bedroom/i);
    var baths = text.match(/Bathrooms?\s*:?\s+(\d+(?:\.5)?)/);
    var parks = [], re = /(?:Parking|Garages?|Garage parking|Open parking|Covered parking|Parking Spaces)\s*:?\s+(\d+)\b/g, p;
    while ((p = re.exec(text))) parks.push(parseFloat(p[1]));
    var size = text.match(/Floor (?:Size|area)\s*:?\s*(\d+(?:[.,]\d+)?)\s*m/i);
    var sub = title.match(/\bin\s+([A-Z][A-Za-z' -]+?)(?:\s*-|\s*\||$)/);
    var typeM = text.match(/Type of Property\s+([A-Za-z /]+?)\s+(?:Description|Lifestyle|Listing|Furnished)/);
    var av = available(text);
    return finish({
      site: site, id: m[1], url: url.split("?")[0], title: title,
      suburb: sub ? sub[1].trim() : null, type: propType(typeM ? typeM[1] : title),
      rent: rent, beds: bm ? parseFloat(bm[1]) : null, baths: baths ? parseFloat(baths[1]) : null,
      parking: parks.length ? Math.max.apply(null, parks) : null, size: size ? num(size[1]) : null,
      available: av, deposit: deposit(text, rent),
      pets: pets(text), furnished: furnished(text), shared: shared(text),
      description: meta(doc, "og:description").slice(0, 600), detail: true
    });
  }

  function siteOf(url, doc) {
    var u = (url || "").toLowerCase();
    if (u.indexOf("property24.com") >= 0 || doc.querySelector(".p24_tileContainer, .js_resultTile")) return "property24";
    if (u.indexOf("privateproperty.co.za") >= 0 || doc.querySelector("a.listing-result")) return "privateproperty";
    return null;
  }

  // Whole page -> {site, kind: "results" | "listing" | "none", listings: [...]}
  function parseDocument(doc, url) {
    var site = siteOf(url, doc);
    if (!site) return { site: null, kind: "none", listings: [] };
    var list = site === "property24" ? p24Results(doc) : ppResults(doc);
    if (list.length) return { site: site, kind: "results", listings: list };
    var one = detail(doc, url, site);
    return one ? { site: site, kind: "listing", listings: [one] } : { site: site, kind: "none", listings: [] };
  }

  return { money: money, num: num, propType: propType, pets: pets, furnished: furnished, shared: shared,
    deposit: deposit, available: available, looksPerRoom: looksPerRoom, parseDocument: parseDocument };
})();
