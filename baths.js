// Záložka Koupání: jen záznam data koupání ke každé želvě, bez intervalu.
import { $, TURTLES, NAMES, tort, esc, todayStr, parse, fmt, fmtShort, fmtDow, fmtDowYear, dayDiff, daysWord,
  periodFrom, periodTo, periodLabel, periodRange, segment, turtleChips, selectedTurtles, delButton, flash } from "./common.js";

var store = null, list = [], loaded = false, period = "m", sel = {};

function mine(id) { return list.filter(function (e) { return e.turtle === id; }); }

function render() {
  // poslední koupání každé želvy
  var box = $("bathlast"); box.innerHTML = "";
  var today = parse(todayStr());
  TURTLES.forEach(function (t) {
    var m = mine(t.id).map(function (e) { return e.date; }).sort();
    var c = document.createElement("div"); c.className = "t"; c.style.setProperty("--c", t.color);
    var h = tort(t.id) + '<div class="n">' + t.name + " " + t.sex + '</div>' + (t.where ? '<div class="d">' + t.where + '</div>' : '');
    if (!m.length) h += '<div class="g">–</div><div class="d">' + (loaded ? "zatím nekoupána" : "načítám…") + '</div>';
    else {
      var last = m[m.length - 1], ago = dayDiff(today, parse(last));
      h += '<div class="g">' + fmtShort(last) + '</div><div class="d">' +
        (ago === 0 ? "dnes" : ago === 1 ? "včera" : ago > 1 ? "před " + ago + " " + daysWord(ago) : "plánováno") + '</div>';
    }
    c.innerHTML = h; box.appendChild(c);
  });

  // přehled za zvolené období
  var from = periodFrom(period), to = periodTo();
  var inP = list.filter(function (e) { return e.date >= from && e.date <= to; }).sort(function (a, b) {
    return a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.ts || 0) - (a.ts || 0);
  });
  $("bathsum").innerHTML = TURTLES.map(function (t) {
    var n = inP.filter(function (e) { return e.turtle === t.id; }).length;
    return '<span class="pill" style="--c:' + t.color + '"><b>' + esc(t.name) + '</b> ' + n + '×</span>';
  }).join("");
  $("bathperiod").textContent = "Koupání – " + periodLabel(period) + " (" + periodRange(period) + ")";

  var ul = $("bathhist"); ul.innerHTML = "";
  if (!inP.length) { ul.innerHTML = '<li style="display:block"><div class="empty">' + tort("otik") + 'V tomto období zatím žádné koupání.</div></li>'; return; }
  inP.forEach(function (e) {
    var li = document.createElement("li");
    li.innerHTML = tort(e.turtle, "mini") + '<div class="m"><b>' + esc(NAMES[e.turtle] || e.turtle) + '</b><div class="note">' + fmtDowYear(e.date) + '</div></div>';
    li.appendChild(delButton(function () { store.remove(e.id); }));
    ul.appendChild(li);
  });
}

export function initBaths() {
  $("bd").value = todayStr();
  var drawChips = turtleChips($("bathchips"), sel);
  segment($("bathseg"), period, function (p) { period = p; render(); });
  $("bathform").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var msg = $("bathmsg");
    if (!store) return;
    var ids = selectedTurtles(sel), date = $("bd").value || todayStr();
    if (!ids.length) { flash(msg, "Vyber aspoň jednu želvu.", true); return; }
    ids.forEach(function (id) {
      // stejné ID pro želvu a den: opakované uložení téhož dne nevytvoří duplicitu
      store.set(date + "_" + id, { turtle: id, date: date, note: "", ts: Date.now() });
    });
    TURTLES.forEach(function (t) { sel[t.id] = false; });
    drawChips();
    flash(msg, "Uloženo ✓ " + ids.map(function (i) { return NAMES[i]; }).join(", ") + " · " + fmtDow(date));
  });
  render();
}

export function startBaths(s, onErr) {
  store = s;
  s.subscribe(function (l, fromCache) {
    list = l;
    if (!fromCache || l.length) loaded = true;
    render();
  }, function (e) { loaded = true; onErr(e); render(); });
}
