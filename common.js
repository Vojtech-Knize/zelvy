// Sdílené věci pro všechny záložky (vážení, koupání, krmení).
export var FB_VER = "10.14.1";
export var APP_URL = "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-app.js";
export var FS_URL = "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-firestore.js";

export var TURTLES = [
  { id: "buffy", name: "Buffy", sex: "♀", color: "var(--buffy)", marker: "circle", acc: "bow", where: "" },
  { id: "otik", name: "Otík", sex: "♂", color: "var(--otik)", marker: "square", acc: "", where: "" },
  { id: "cecik", name: "Cecík", sex: "♀", color: "var(--cecik)", marker: "triangle", acc: "flower", where: "ze školky" },
  { id: "drobecek", name: "Drobeček", sex: "♂", color: "var(--drobecek)", marker: "diamond", acc: "", where: "ze školky" }
];
export var NAMES = {};
TURTLES.forEach(function (t) { NAMES[t.id] = t.name; });
export function turtleById(id) { for (var i = 0; i < TURTLES.length; i++) if (TURTLES[i].id === id) return TURTLES[i]; return TURTLES[1]; }
export function markerSvg(m, color, size) {
  var h = size / 2, c = 'fill="' + color + '"';
  if (m === "square") return '<rect x="' + (h * .25) + '" y="' + (h * .25) + '" width="' + (size * .75) + '" height="' + (size * .75) + '" rx="1.5" ' + c + '/>';
  if (m === "triangle") return '<polygon points="' + h + ',' + (h * .1) + ' ' + (size * .95) + ',' + (size * .92) + ' ' + (size * .05) + ',' + (size * .92) + '" ' + c + '/>';
  if (m === "diamond") return '<polygon points="' + h + ',' + (size * .05) + ' ' + (size * .95) + ',' + h + ' ' + h + ',' + (size * .95) + ' ' + (size * .05) + ',' + h + '" ' + c + '/>';
  return '<circle cx="' + h + '" cy="' + h + '" r="' + (h * .85) + '" ' + c + '/>';
}

export function $(id) { return document.getElementById(id); }
export function lsGet(k) { try { return localStorage.getItem(k); } catch (x) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (x) {} }
export function lsDel(k) { try { localStorage.removeItem(k); } catch (x) {} }

export function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function todayStr() { return ymd(new Date()); }
export function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function fmt(s) { var d = parse(s); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); }
export function fmtShort(s) { var d = parse(s); return d.getDate() + ". " + (d.getMonth() + 1) + "."; }
export function fmtG(n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); }
export function dayDiff(a, b) { return Math.round((a - b) / 86400000); }
export function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
export function tort(k, cls) {
  var t = turtleById(k);
  var acc = t.acc === "bow" ? '<use href="#bow"/>' : (t.acc === "flower" ? '<use href="#flower"/>' : '');
  return '<svg class="' + t.id + ' ' + (cls || "") + '" viewBox="0 0 120 80" aria-hidden="true"><use href="#tort"/>' + acc + '</svg>';
}

var DOW = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
export function fmtDow(s) { var d = parse(s); return DOW[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + "."; }
export function fmtDowYear(s) { return fmtDow(s) + " " + parse(s).getFullYear(); }
export function daysWord(n) { return n === 1 ? "den" : (n >= 2 && n <= 4 ? "dny" : "dní"); }

// ---------- období (měsíc / půlrok / rok, počítáno zpět od dneška) ----------
export var PERIODS = [
  { id: "w", label: "Týden", days: 7 },
  { id: "w2", label: "2 týdny", days: 14 },
  { id: "m", label: "Měsíc", months: 1 },
  { id: "h", label: "Půlrok", months: 6 },
  { id: "y", label: "Rok", months: 12 }
];
function mondayOf(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); }
// Období začíná vždy v pondělí a končí nedělí aktuálního týdne.
export function periodFrom(id) {
  var p = PERIODS.filter(function (x) { return x.id === id; })[0] || PERIODS[0];
  var now = new Date(), start;
  if (id === "w") start = now;
  else if (id === "w2") start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  else {
    var y = now.getFullYear(), m = now.getMonth() - p.months, day = now.getDate();
    var dim = new Date(y, m + 1, 0).getDate(); // počet dní v cílovém měsíci
    start = new Date(y, m, Math.min(day, dim));
  }
  return ymd(mondayOf(start));
}
export function periodTo() {
  var m = mondayOf(new Date());
  return ymd(new Date(m.getFullYear(), m.getMonth(), m.getDate() + 6));
}
export function periodLabel(id) {
  return { w: "tento týden", w2: "poslední 2 týdny", m: "poslední měsíc", h: "poslední půlrok", y: "poslední rok" }[id];
}
export function periodRange(id) { return fmt(periodFrom(id)) + " – " + fmt(periodTo()); }
export function segment(box, initial, onChange) {
  box.innerHTML = PERIODS.map(function (p) {
    return '<button type="button" data-p="' + p.id + '"' + (p.id === initial ? ' class="on"' : '') + '>' + p.label + '</button>';
  }).join("");
  box.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    Array.prototype.forEach.call(box.children, function (c) { c.classList.toggle("on", c === b); });
    onChange(b.dataset.p);
  });
}

// ---------- výběr želv (více najednou) ----------
export function turtleChips(box, sel, onChange) {
  function draw() {
    box.innerHTML = TURTLES.map(function (t) {
      return '<button type="button" class="chip' + (sel[t.id] ? ' on' : '') + '" data-id="' + t.id + '" style="--c:' + t.color + '">' + (sel[t.id] ? '✓ ' : '') + esc(t.name) + '</button>';
    }).join("");
  }
  box.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    sel[b.dataset.id] = !sel[b.dataset.id];
    draw();
    if (onChange) onChange();
  });
  draw();
  return draw;
}
export function selectedTurtles(sel) { return TURTLES.filter(function (t) { return sel[t.id]; }).map(function (t) { return t.id; }); }

// ---------- mazání na dvě klepnutí ----------
export function delButton(onConfirm) {
  var b = document.createElement("button");
  b.className = "ghost"; b.type = "button"; b.textContent = "Smazat";
  var armed = false, tm = null;
  b.addEventListener("click", function () {
    if (!armed) {
      armed = true; b.textContent = "Opravdu?"; b.classList.add("sure");
      tm = setTimeout(function () { armed = false; b.textContent = "Smazat"; b.classList.remove("sure"); }, 3000);
      return;
    }
    clearTimeout(tm); onConfirm();
  });
  return b;
}

export function flash(el, text, isErr) {
  el.className = "msg" + (isErr ? " err" : "");
  el.textContent = text;
  if (!isErr) setTimeout(function () { if (el.textContent === text) el.textContent = ""; }, 3000);
}
