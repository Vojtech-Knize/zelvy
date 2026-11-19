// Záložka Krmení: krmení jde zapsat každý den; výběr z nabídky + vlastní krmení.
import { $, TURTLES, NAMES, tort, esc, todayStr, parse, ymd, fmt, fmtShort, fmtDow, fmtDowYear, dayDiff, daysWord,
  lsGet, lsSet, periodFrom, periodLabel, segment, turtleChips, selectedTurtles, delButton, flash } from "./common.js";

var FOODS = ["Suché krmení", "Polníček", "Rukola", "Čínské zelí", "Okurka", "Paprika", "Hroznové víno", "Jablíčko"];
var LS_CUSTOM = "zelvy-vlastni-krmeni";

var store = null, list = [], loaded = false, period = "m";
var selT = {}, selF = {}, custom = [], slotDirty = false;
TURTLES.forEach(function (t) { selT[t.id] = true; });
try { custom = JSON.parse(lsGet(LS_CUSTOM) || "[]"); } catch (x) { custom = []; }

function isFeedDay() { return true; } // krmení jde zapsat každý den

// dny od (dnes − 14 dní) do dneška, nejnovější nahoře
function slots() {
  var out = [], t = parse(todayStr());
  for (var i = 0; i >= -14; i--) {
    var d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    if (isFeedDay(d)) out.push(ymd(d));
  }
  return out;
}
function doneCount(date) {
  var seen = {};
  list.forEach(function (e) { if (e.date === date) seen[e.turtle] = 1; });
  return Object.keys(seen).length;
}
function defaultSlot() {
  var today = todayStr(), s = slots().filter(function (d) { return d <= today; });
  return s.length ? s[0] : slots()[0];
}

function allFoods() {
  var extra = [];
  custom.concat(list.reduce(function (a, e) { return a.concat(e.foods || []); }, [])).forEach(function (f) {
    if (FOODS.indexOf(f) < 0 && extra.indexOf(f) < 0) extra.push(f);
  });
  return FOODS.concat(extra);
}

function drawFoods() {
  $("foodchips").innerHTML = allFoods().map(function (f) {
    var on = selF[f];
    return '<button type="button" class="chip food' + (on ? ' on' : '') + '" data-f="' + esc(f) + '">' + (on ? '✓ ' : '') + esc(f) + '</button>';
  }).join("");
}

function drawSlots() {
  var sel = $("fd"), keep = slotDirty ? sel.value : defaultSlot(), today = todayStr();
  sel.innerHTML = slots().map(function (d) {
    var n = doneCount(d), mark = n >= TURTLES.length ? " ✓" : (n ? " (" + n + "/" + TURTLES.length + ")" : "");
    return '<option value="' + d + '">' + fmtDow(d) + (d === today ? " · dnes" : "") + mark + '</option>';
  }).join("");
  sel.value = keep;
}

function renderNext() {
  var el = $("feednext"), today = parse(todayStr()), ts = todayStr();
  if (!loaded) { el.textContent = "Načítám…"; el.className = "due"; return; }
  if (isFeedDay(today)) {
    var n = doneCount(ts);
    if (n >= TURTLES.length) { el.textContent = "Dnes zapsáno ✓"; el.className = "due ok"; }
    else { el.textContent = "Dnes ještě nezapsáno" + (n ? " (zapsáno " + n + " z " + TURTLES.length + ")" : ""); el.className = "due warn"; }
    return;
  }
  for (var i = 1; i <= 7; i++) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (isFeedDay(d)) {
      el.textContent = "Další krmení: " + fmtDow(ymd(d)) + (i === 1 ? " (zítra)" : " (za " + i + " " + daysWord(i) + ")");
      el.className = "due ok"; return;
    }
  }
}

// graf: řádky = krmení, sloupce = dny (měsíc) nebo týdny (půlrok, rok); sytost = v kolika dnech se podávalo
function renderChart(inP, from) {
  var box = $("feedchart");
  if (!inP.length) { box.innerHTML = '<div class="empty">' + tort("otik") + 'Graf se zobrazí po prvním zápisu krmení.</div>'; return; }
  var weekly = period === "h" || period === "y", today = parse(todayStr()), start = parse(from);
  function key(d) { // sloupec: den, nebo pondělí daného týdne
    if (!weekly) return ymd(d);
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return ymd(x);
  }
  var cols = [], seen = {};
  for (var d = new Date(start); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    var k = key(d);
    if (!seen[k]) { seen[k] = cols.length; cols.push(k); }
  }
  var per = {}, days = {}; // krmení -> sloupec -> množina dnů
  inP.forEach(function (e) {
    if (e.date > ymd(today)) return;
    var c = seen[key(parse(e.date))];
    if (c == null) return;
    (e.foods || []).forEach(function (f) {
      per[f] = per[f] || {}; (per[f][c] = per[f][c] || {})[e.date] = 1;
    });
  });
  var foods = Object.keys(per).sort(function (a, b) {
    var ta = Object.keys(per[a]).reduce(function (n, c) { return n + Object.keys(per[a][c]).length; }, 0);
    var tb = Object.keys(per[b]).reduce(function (n, c) { return n + Object.keys(per[b][c]).length; }, 0);
    return tb - ta;
  });
  if (!foods.length) { box.innerHTML = '<div class="empty">' + tort("otik") + 'V tomto období není zapsané žádné krmení.</div>'; return; }
  var W = 340, LW = 92, RH = 20, TOP = 4, H = TOP + foods.length * RH + 22;
  var cw = (W - LW - 2) / cols.length;
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf krmení v čase">';
  foods.forEach(function (f, r) {
    var y = TOP + r * RH, label = f.length > 14 ? f.slice(0, 13) + "…" : f;
    svg += '<text x="' + (LW - 6) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="var(--ink)">' + esc(label) + '</text>';
    svg += '<rect x="' + LW + '" y="' + (y + 2) + '" width="' + (W - LW - 2) + '" height="' + (RH - 4) + '" rx="3" fill="var(--line)" opacity=".45"/>';
    cols.forEach(function (k, c) {
      var n = per[f][c] ? Object.keys(per[f][c]).length : 0;
      if (!n) return;
      var op = weekly ? Math.max(.3, n / 7) : 1;
      svg += '<rect x="' + (LW + c * cw + .5) + '" y="' + (y + 2) + '" width="' + Math.max(cw - 1, 1) + '" height="' + (RH - 4) + '" rx="2" fill="var(--otik)" opacity="' + op.toFixed(2) + '"/>';
    });
  });
  var ay = TOP + foods.length * RH + 14;
  svg += '<text x="' + LW + '" y="' + ay + '" font-size="10" fill="var(--mute)">' + fmtShort(from) + '</text>';
  svg += '<text x="' + (W - 2) + '" y="' + ay + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(ymd(today)) + '</text>';
  box.innerHTML = svg + '</svg>';
  $("feedchartnote").textContent = weekly ? "Jeden sloupec = týden, sytost = počet dní, kdy se podávalo." : "Jeden sloupec = den.";
}

function render() {
  renderNext();
  drawSlots();
  drawFoods();

  var from = periodFrom(period);
  var inP = list.filter(function (e) { return e.date >= from; });
  renderChart(inP, from);
  $("feedperiod").textContent = "Krmení " + periodLabel(period) + " (od " + fmt(from) + ")";

  // kolikrát se v období objevilo které krmení (počítá se dny, ne zápisy)
  var days = {}, perFood = {};
  inP.forEach(function (e) {
    days[e.date] = 1;
    (e.foods || []).forEach(function (f) { perFood[f] = perFood[f] || {}; perFood[f][e.date] = 1; });
  });
  var counts = Object.keys(perFood).map(function (f) { return [f, Object.keys(perFood[f]).length]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  $("feedsum").innerHTML = '<span class="pill"><b>Krmných dnů</b> ' + Object.keys(days).length + '</span>' +
    counts.map(function (c) { return '<span class="pill"><b>' + esc(c[0]) + '</b> ' + c[1] + '×</span>'; }).join("");

  // seskupení: stejný den + stejné krmení = jeden řádek (např. všechny želvy dostaly totéž)
  var groups = {};
  inP.forEach(function (e) {
    var key = e.date + "|" + (e.foods || []).slice().sort().join("¦");
    (groups[key] = groups[key] || { date: e.date, foods: e.foods || [], items: [] }).items.push(e);
  });
  var arr = Object.keys(groups).map(function (k) { return groups[k]; })
    .sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.foods.join() < b.foods.join() ? -1 : 1); });

  var ul = $("feedhist"); ul.innerHTML = "";
  if (!arr.length) { ul.innerHTML = '<li style="display:block"><div class="empty">' + tort("buffy") + 'V tomto období zatím žádné krmení.</div></li>'; return; }
  arr.forEach(function (g) {
    var ids = g.items.map(function (e) { return e.turtle; });
    var who = ids.length >= TURTLES.length ? "Všechny želvy" : TURTLES.filter(function (t) { return ids.indexOf(t.id) >= 0; }).map(function (t) { return t.name; }).join(", ");
    var li = document.createElement("li");
    li.innerHTML = tort(ids[0], "mini") +
      '<div class="m"><b>' + fmtDowYear(g.date) + '</b> · ' + esc(who) +
      '<div class="note">' + (g.foods.length ? esc(g.foods.join(", ")) : "bez zadaného krmení") + '</div></div>';
    li.appendChild(delButton(function () { g.items.forEach(function (e) { store.remove(e.id); }); }));
    ul.appendChild(li);
  });
}

export function initFeedings() {
  turtleChips($("feedturtles"), selT);
  segment($("feedseg"), period, function (p) { period = p; render(); });
  $("fd").addEventListener("change", function () { slotDirty = true; });

  $("foodchips").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    selF[b.dataset.f] = !selF[b.dataset.f];
    drawFoods();
  });
  function addCustom() {
    var inp = $("customfood"), v = inp.value.trim().replace(/\s+/g, " ");
    if (!v) return;
    v = v.charAt(0).toUpperCase() + v.slice(1);
    var known = allFoods().filter(function (f) { return f.toLowerCase() === v.toLowerCase(); })[0];
    if (known) v = known;
    else { custom.push(v); lsSet(LS_CUSTOM, JSON.stringify(custom)); }
    selF[v] = true; inp.value = ""; drawFoods();
  }
  $("addcustom").addEventListener("click", addCustom);
  $("customfood").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  $("feedform").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var msg = $("feedmsg");
    if (!store) return;
    var ids = selectedTurtles(selT), date = $("fd").value;
    var foods = allFoods().filter(function (f) { return selF[f]; });
    if (!ids.length) { flash(msg, "Vyber aspoň jednu želvu.", true); return; }
    if (!foods.length) { flash(msg, "Vyber aspoň jedno krmení.", true); return; }
    ids.forEach(function (id) {
      // ID = den + želva: opětovné uložení téhož dne záznam přepíše (oprava)
      store.set(date + "_" + id, { turtle: id, date: date, foods: foods, note: "", ts: Date.now() });
    });
    selF = {}; slotDirty = false; drawFoods();
    flash(msg, "Uloženo ✓ " + fmtDow(date) + " · " + foods.join(", "));
  });
  render();
}

export function startFeedings(s, onErr) {
  store = s;
  s.subscribe(function (l, fromCache) {
    list = l;
    if (!fromCache || l.length) loaded = true;
    render();
  }, function (e) { loaded = true; onErr(e); render(); });
}
