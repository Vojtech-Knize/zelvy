// Záložka Rosení: záznam dnů, kdy se rosilo želvárium, a graf v čase.
import { $, tort, esc, todayStr, parse, ymd, fmtDow, fmtDowYear, fmtShort, dayDiff, daysWord,
  periodFrom, periodTo, periodLabel, periodRange, segment, delButton, flash } from "./common.js";

var store = null, list = [], loaded = false, period = "w";

function days() { var s = {}; list.forEach(function (e) { s[e.date] = e; }); return s; }

function renderNext() {
  var el = $("spraynext"), ts = todayStr(), d = days();
  if (!loaded) { el.textContent = "Načítám…"; el.className = "due"; return; }
  if (d[ts]) { el.textContent = "Dnes zarošeno ✓"; el.className = "due ok"; return; }
  var past = Object.keys(d).filter(function (x) { return x <= ts; }).sort();
  if (!past.length) { el.textContent = "Dnes ještě nerošeno · zatím žádný záznam"; el.className = "due warn"; return; }
  var ago = dayDiff(parse(ts), parse(past[past.length - 1]));
  el.textContent = "Dnes ještě nerošeno · naposledy před " + ago + " " + daysWord(ago) + " (" + fmtDow(past[past.length - 1]) + ")";
  el.className = "due warn";
}

function renderChart(inP, from) {
  var box = $("spraychart");
  var weekly = period === "h" || period === "y", end = parse(periodTo()), start = parse(from);
  function key(d) {
    if (!weekly) return ymd(d);
    return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
  }
  var cols = [], idx = {};
  for (var d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    var k = key(d);
    if (idx[k] == null) { idx[k] = cols.length; cols.push(k); }
  }
  var cnt = cols.map(function () { return 0; });
  inP.forEach(function (e) { var c = idx[key(parse(e.date))]; if (c != null) cnt[c]++; });
  var W = 340, L = 4, TOP = weekly ? 4 : 18, BH = 56, H = TOP + BH + 22;
  var cw = (W - L - 4) / cols.length;
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf rosení v čase">';
  svg += '<rect x="' + L + '" y="' + TOP + '" width="' + (W - L - 4) + '" height="' + BH + '" rx="4" fill="var(--line)" opacity=".45"/>';
  if (!weekly) {
    var names = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"], fs = cw >= 14 ? 10 : 8;
    cols.forEach(function (k, c) {
      var dow = parse(k).getDay();
      if (cw < 14 && dow !== 1) return;
      svg += '<text x="' + (L + c * cw + cw / 2) + '" y="12" text-anchor="middle" font-size="' + fs + '" fill="var(--mute)"' + (dow === 1 ? ' font-weight="700"' : '') + '>' + names[dow] + '</text>';
    });
  }
  cols.forEach(function (k, c) {
    if (!cnt[c]) return;
    var h = weekly ? Math.max(4, cnt[c] / 7 * BH) : BH;
    svg += '<rect x="' + (L + c * cw + .5) + '" y="' + (TOP + BH - h) + '" width="' + Math.max(cw - 1, 1) + '" height="' + h + '" rx="2" fill="#3d8fc4"/>';
  });
  var ay = TOP + BH + 14;
  svg += '<text x="' + L + '" y="' + ay + '" font-size="10" fill="var(--mute)">' + fmtShort(from) + '</text>';
  svg += '<text x="' + (W - 4) + '" y="' + ay + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(periodTo()) + '</text>';
  box.innerHTML = svg + '</svg>';
  $("spraychartnote").textContent = weekly ? "Jeden sloupec = týden, výška = počet dní s rosením (max. 7)." : "Jeden sloupec = den, modrý = rosilo se.";
}

function render() {
  renderNext();
  var from = periodFrom(period), to = periodTo();
  var inP = list.filter(function (e) { return e.date >= from && e.date <= to; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  $("sprayperiod").textContent = "Rosení – " + periodLabel(period) + " (" + periodRange(period) + ")";
  $("spraysum").innerHTML = '<span class="pill"><b>Dnů s rosením</b> ' + inP.length + '</span>';
  renderChart(inP, from);
  var ul = $("sprayhist"); ul.innerHTML = "";
  if (!inP.length) { ul.innerHTML = '<li style="display:block"><div class="empty">' + tort("buffy") + 'V tomto období zatím žádné rosení.</div></li>'; return; }
  inP.forEach(function (e) {
    var li = document.createElement("li");
    li.innerHTML = '<div style="font-size:26px;width:38px;text-align:center;flex:none" aria-hidden="true">💧</div><div class="m"><b>' + fmtDowYear(e.date) + '</b>' +
      (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</div>';
    li.appendChild(delButton(function () { store.remove(e.id); }));
    ul.appendChild(li);
  });
}

export function initSpray() {
  $("sd").value = todayStr();
  segment($("sprayseg"), period, function (p) { period = p; render(); });
  $("sprayform").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!store) return;
    var date = $("sd").value || todayStr();
    // ID = datum: jeden záznam na den, opakované uložení ho jen přepíše
    store.set(date, { date: date, note: $("sn").value.trim(), ts: Date.now() });
    $("sn").value = "";
    flash($("spraymsg"), "Uloženo ✓ " + fmtDow(date));
  });
  render();
}

export function startSpray(s, onErr) {
  store = s;
  s.subscribe(function (l, fromCache) {
    list = l;
    if (!fromCache || l.length) loaded = true;
    render();
  }, function (e) { loaded = true; onErr(e); render(); });
}
