// Záložka Měření: délka v cm, jednou za 3 měsíce, s grafem vývoje.
import { $, TURTLES, NAMES, tort, esc, todayStr, parse, ymd, fmt, fmtShort, fmtG, dayDiff, daysWord,
  markerSvg, delButton, flash } from "./common.js";

var store = null, list = [], loaded = false, dirty = false;

function mine(id) { return list.filter(function (e) { return e.turtle === id; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
function addMonths(s, n) {
  var d = parse(s), y = d.getFullYear(), m = d.getMonth() + n;
  var dim = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(d.getDate(), dim)));
}
function dueOf(m) { return addMonths(m[m.length - 1].date, 3); }

function defaultDate() {
  var id = $("mt").value, m = mine(id);
  return m.length ? dueOf(m) : todayStr();
}

function renderDue() {
  var el = $("measdue");
  if (!loaded) { el.textContent = "Načítám…"; el.className = "due"; return; }
  var dues = [];
  TURTLES.forEach(function (t) { var m = mine(t.id); if (m.length) dues.push({ t: t, d: dueOf(m) }); });
  if (!dues.length) { el.textContent = "Zatím žádné měření – přidej první."; el.className = "due"; return; }
  var first = dues.reduce(function (a, b) { return b.d < a.d ? b : a; });
  var who = dues.filter(function (x) { return x.d === first.d; }).map(function (x) { return x.t.name; });
  var suffix = who.length < dues.length ? " · " + who.join(", ") : "";
  var left = dayDiff(parse(first.d), parse(todayStr()));
  if (left > 1) { el.textContent = "Další měření: " + fmt(first.d) + " (za " + left + " " + daysWord(left) + ")" + suffix; el.className = "due ok"; }
  else if (left === 1) { el.textContent = "Další měření: zítra (" + fmt(first.d) + ")" + suffix; el.className = "due ok"; }
  else if (left === 0) { el.textContent = "Další měření: dnes!" + suffix; el.className = "due warn"; }
  else { el.textContent = "Měření je po termínu o " + (-left) + " " + daysWord(-left) + " (mělo být " + fmt(first.d) + ")" + suffix; el.className = "due warn"; }
}

function renderCards() {
  var box = $("meascards"); box.innerHTML = "";
  TURTLES.forEach(function (t) {
    var m = mine(t.id), c = document.createElement("div");
    c.className = "t"; c.style.setProperty("--c", t.color);
    var h = tort(t.id) + '<div class="n">' + t.name + " " + t.sex + '</div>';
    if (!m.length) h += '<div class="g">–</div><div class="d">zatím neměřena</div>';
    else {
      var l = m[m.length - 1];
      h += '<div class="g">' + fmtG(l.cm) + ' cm</div>';
      var d = "";
      if (m.length > 1) {
        var diff = l.cm - m[m.length - 2].cm, cls = diff > 0 ? "up" : (diff < 0 ? "down" : "");
        d = '<span class="delta ' + cls + '">' + (diff > 0 ? "+" : diff < 0 ? "−" : "±") + fmtG(Math.abs(diff)) + ' cm</span> · ';
      }
      h += '<div class="d">' + d + fmtShort(l.date) + '</div><div class="d">příště ' + fmtShort(dueOf(m)) + '</div>';
    }
    c.innerHTML = h; box.appendChild(c);
  });
}

function renderChart() {
  var box = $("measchart"), all = list.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (all.length < 2) { box.innerHTML = '<div class="empty">' + tort("otik") + 'Graf se zobrazí od dvou měření.</div>'; return; }
  var W = 340, H = 200, L = 40, R = 12, T = 12, B = 26;
  var vs = all.map(function (e) { return e.cm; });
  var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs);
  if (max - min < 1) { min -= 1; max += 1; }
  var pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad;
  var t0 = parse(all[0].date).getTime(), t1 = parse(all[all.length - 1].date).getTime();
  if (t1 === t0) t1 = t0 + 86400000;
  function X(d) { return L + (parse(d).getTime() - t0) / (t1 - t0) * (W - L - R); }
  function Y(v) { return T + (1 - (v - min) / (max - min)) * (H - T - B); }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf vývoje délky">';
  for (var i = 0; i <= 3; i++) {
    var v = min + (max - min) * i / 3, y = Y(v);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/>';
    s += '<text x="' + (L - 5) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtG(v) + '</text>';
  }
  s += '<text x="' + L + '" y="' + (H - 8) + '" font-size="10" fill="var(--mute)">' + fmtShort(all[0].date) + '</text>';
  s += '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(all[all.length - 1].date) + '</text>';
  TURTLES.forEach(function (t) {
    var m = mine(t.id);
    if (!m.length) return;
    s += '<polyline points="' + m.map(function (e) { return X(e.date).toFixed(1) + "," + Y(e.cm).toFixed(1); }).join(" ") + '" fill="none" stroke="' + t.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    m.forEach(function (e) {
      var x = X(e.date), y = Y(e.cm);
      s += '<g transform="translate(' + (x - 5) + ',' + (y - 5) + ')">' + markerSvg(t.marker, t.color, 10) + '</g>';
    });
  });
  box.innerHTML = s + '</svg>';
}

function renderHist() {
  var ul = $("meashist"); ul.innerHTML = "";
  if (!list.length) { ul.innerHTML = '<li style="display:block"><div class="empty">' + tort("buffy") + 'Zatím tu nic není.</div></li>'; return; }
  list.slice().sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.ts || 0) - (a.ts || 0); }).forEach(function (e) {
    var li = document.createElement("li");
    li.innerHTML = tort(e.turtle, "mini") + '<div class="m"><b>' + esc(NAMES[e.turtle] || e.turtle) + '</b> · ' + fmtG(e.cm) + ' cm<div class="note">' + fmt(e.date) + (e.note ? " · " + esc(e.note) : "") + '</div></div>';
    li.appendChild(delButton(function () { store.remove(e.id); }));
    ul.appendChild(li);
  });
}

function render() {
  renderDue(); renderCards(); renderChart(); renderHist();
  if (!dirty && loaded) $("md").value = defaultDate();
}

export function initMeasure() {
  $("mt").innerHTML = TURTLES.map(function (t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join("");
  $("mlegend").innerHTML = TURTLES.map(function (t) {
    return '<span style="color:var(--mute)"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' + markerSvg(t.marker, t.color, 12) + '</svg>' + t.name + '</span>';
  }).join("");
  $("md").value = todayStr();
  $("md").addEventListener("input", function () { dirty = true; });
  $("mt").addEventListener("change", function () { if (!dirty) $("md").value = defaultDate(); });
  $("measform").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!store) return;
    var v = parseFloat($("mc").value.replace(",", "."));
    if (!(v > 0)) return;
    store.add({ turtle: $("mt").value, cm: v, date: $("md").value || todayStr(), note: $("mn").value.trim(), ts: Date.now() });
    $("mc").value = ""; $("mn").value = ""; dirty = false; render();
    flash($("measmsg"), "Uloženo ✓");
  });
  render();
}

export function startMeasure(s, onErr) {
  store = s;
  s.subscribe(function (l, fromCache) {
    list = l;
    if (!fromCache || l.length) loaded = true;
    render();
  }, function (e) { loaded = true; onErr(e); render(); });
}
