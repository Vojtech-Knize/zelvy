// Záložka Krmení: krmení jde zapsat každý den; výběr z nabídky + vlastní krmení.
import { $, TURTLES, NAMES, tort, esc, todayStr, parse, ymd, fmt, fmtShort, fmtDow, fmtDowYear, dayDiff, daysWord,
  lsGet, lsSet, periodFrom, periodTo, periodLabel, periodRange, segment, turtleChips, selectedTurtles, delButton, flash } from "./common.js";

var FOODS = ["Suché krmení", "Polníček", "Rukola", "Čínské zelí", "Okurka", "Paprika", "Hroznové víno", "Jablíčko"];
var LS_CUSTOM = "zelvy-vlastni-krmeni";

var store = null, list = [], loaded = false, period = "w"; // přehled se otevírá na Týdnu
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

var PAL = ["#5f8a2d", "#d9531e", "#3d8fc4", "#c28a00", "#b8336a", "#7b61c4", "#2a9d8f", "#8d6e63", "#e07a5f", "#6c757d"];
function colorOf(food) { var i = allFoods().indexOf(food); return PAL[(i < 0 ? 0 : i) % PAL.length]; }
function mondayKey(s) { var d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))); }
function addDays(s, n) { var d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }

// graf 1: posledních 14 dní; řádky = krmení, sloupce = dny
function renderChart() {
  var box = $("feedchart"), today = todayStr(), from = addDays(today, -13);
  var inP = list.filter(function (e) { return e.date >= from && e.date <= today; });
  if (!inP.length) { box.innerHTML = '<div class="empty">' + tort("otik") + 'V posledních 14 dnech není zapsané žádné krmení.</div>'; return; }
  var cols = [], idx = {};
  for (var i = 0; i < 14; i++) { var k = addDays(from, i); idx[k] = i; cols.push(k); }
  var per = {};
  inP.forEach(function (e) { (e.foods || []).forEach(function (f) { (per[f] = per[f] || {})[e.date] = 1; }); });
  var foods = Object.keys(per).sort(function (a, b) { return Object.keys(per[b]).length - Object.keys(per[a]).length; });
  var W = 340, LW = 92, RH = 20, TOP = 18, H = TOP + foods.length * RH + 22, cw = (W - LW - 2) / 14;
  var names = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf krmení za posledních 14 dní">';
  cols.forEach(function (k, c) {
    var dow = parse(k).getDay();
    svg += '<text x="' + (LW + c * cw + cw / 2) + '" y="12" text-anchor="middle" font-size="10" fill="var(--mute)"' + (dow === 1 ? ' font-weight="700"' : '') + '>' + names[dow] + '</text>';
  });
  foods.forEach(function (f, r) {
    var y = TOP + r * RH, label = f.length > 14 ? f.slice(0, 13) + "…" : f;
    svg += '<text x="' + (LW - 6) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="var(--ink)">' + esc(label) + '</text>';
    svg += '<rect x="' + LW + '" y="' + (y + 2) + '" width="' + (W - LW - 2) + '" height="' + (RH - 4) + '" rx="3" fill="var(--line)" opacity=".45"/>';
    cols.forEach(function (k, c) {
      if (!per[f][k]) return;
      svg += '<rect x="' + (LW + c * cw + .5) + '" y="' + (y + 2) + '" width="' + (cw - 1) + '" height="' + (RH - 4) + '" rx="2" fill="' + colorOf(f) + '"/>';
    });
  });
  var ay = TOP + foods.length * RH + 14;
  svg += '<text x="' + LW + '" y="' + ay + '" font-size="10" fill="var(--mute)">' + fmtShort(from) + '</text>';
  svg += '<text x="' + (W - 2) + '" y="' + ay + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(today) + '</text>';
  box.innerHTML = svg + '</svg>';
}

// graf 2: sloupcový, od prvního krmení po týdnech; sloupec = týden (Po–Ne), výška = dny podle krmení
function renderTotals() {
  var box = $("feedtotal"), leg = $("feedtotallegend"), note = $("feedtotalnote");
  if (!list.length) { box.innerHTML = '<div class="empty">' + tort("otik") + 'Graf se zobrazí po prvním zápisu krmení.</div>'; leg.innerHTML = ""; note.textContent = ""; return; }
  var first = list.reduce(function (m, e) { return e.date < m ? e.date : m; }, list[0].date);
  var weeks = [], widx = {}, wk = mondayKey(first), last = mondayKey(todayStr());
  for (; wk <= last; wk = addDays(wk, 7)) { widx[wk] = weeks.length; weeks.push(wk); }
  var per = weeks.map(function () { return {}; }), total = {};
  list.forEach(function (e) {
    var w = widx[mondayKey(e.date)];
    if (w == null) return;
    (e.foods || []).forEach(function (f) { (per[w][f] = per[w][f] || {})[e.date] = 1; total[f] = (total[f] || 0) + 1; });
  });
  var foods = allFoods().filter(function (f) { return total[f]; });
  var sums = per.map(function (p) { return Object.keys(p).reduce(function (n, f) { return n + Object.keys(p[f]).length; }, 0); });
  var max = Math.max.apply(null, sums.concat([1]));
  var W = 340, L = 26, R = 4, T = 8, H = 190, B = 24, ph = H - T - B, slot = (W - L - R) / weeks.length, bw = Math.min(slot - 1.5, 38);
  function Y(v) { return T + (1 - v / max) * ph; }
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sloupcový graf krmení po týdnech od začátku">';
  [0, Math.ceil(max / 2), max].forEach(function (v, i, arr) {
    if (i && v === arr[i - 1]) return;
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/>';
    svg += '<text x="' + (L - 5) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--mute)">' + v + '</text>';
  });
  weeks.forEach(function (w, i) {
    var x = L + i * slot + (slot - bw) / 2, acc = 0;
    foods.forEach(function (f) {
      var n = per[i][f] ? Object.keys(per[i][f]).length : 0;
      if (!n) return;
      var y1 = Y(acc + n), h = Y(acc) - y1;
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(h - .6, .5).toFixed(1) + '" fill="' + colorOf(f) + '"/>';
      acc += n;
    });
  });
  var ay = H - 7;
  svg += '<text x="' + L + '" y="' + ay + '" font-size="10" fill="var(--mute)">' + fmtShort(weeks[0]) + '</text>';
  if (weeks.length > 1) svg += '<text x="' + (W - R) + '" y="' + ay + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(weeks[weeks.length - 1]) + '</text>';
  box.innerHTML = svg + '</svg>';
  leg.innerHTML = foods.map(function (f) {
    return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:13px"><i style="width:11px;height:11px;border-radius:3px;background:' + colorOf(f) + ';display:inline-block"></i>' + esc(f) + ' · ' + total[f] + '×</span>';
  }).join("");
  note.textContent = "Od " + fmt(first) + ". Jeden sloupec = týden (Po–Ne), výška = počet dní podle krmení.";
}

function render() {
  renderNext();
  drawSlots();
  drawFoods();

  var from = periodFrom(period), to = periodTo();
  var inP = list.filter(function (e) { return e.date >= from && e.date <= to; });
  renderChart();
  renderTotals();
  $("feedperiod").textContent = "Krmení – " + periodLabel(period) + " (" + periodRange(period) + ")";

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
