import { firebaseConfig } from "./firebase-config.js";

var FB_VER = "10.14.1";
var APP_URL = "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-app.js";
var FS_URL = "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-firestore.js";

var NAMES = { buffy: "Buffy", otik: "Otík" };
var SEED = [
  { id: "seed-buffy-20261114", turtle: "buffy", grams: 50, date: "2026-11-14", note: "", ts: 1794657090385 },
  { id: "seed-otik-20261114", turtle: "otik", grams: 53, date: "2026-11-14", note: "", ts: 1794657098182 }
];
var LS_ENTRIES = "zelvy-vazeni-v1";
var LS_CODE = "zelvy-kod";

var entries = [];
var loaded = false;
var backend = null;
var timer = null;

function $(id) { return document.getElementById(id); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (x) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (x) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (x) {} }

function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function fmt(s) { var d = parse(s); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); }
function fmtShort(s) { var d = parse(s); return d.getDate() + ". " + (d.getMonth() + 1) + "."; }
function fmtG(n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); }
function dayDiff(a, b) { return Math.round((a - b) / 86400000); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function tort(k, cls) {
  var kk = (k === "buffy" || k === "otik") ? k : "otik";
  return '<svg class="' + kk + ' ' + (cls || "") + '" viewBox="0 0 120 80" aria-hidden="true"><use href="#tort"/>' + (kk === "buffy" ? '<use href="#bow"/>' : '') + '</svg>';
}

// ---------- kód domácnosti ----------
var ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newCode() {
  var out = "", buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  for (var i = 0; i < buf.length; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}
function normCode(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function prettyCode(c) { return c.replace(/(.{4})(?=.)/g, "$1-"); }
function validCode(c) { return c.length >= 12 && c.length <= 64; }

function codeFromHash() {
  var m = /[#&]k=([^&]+)/.exec(location.hash || "");
  if (!m) return null;
  var c = normCode(decodeURIComponent(m[1]));
  try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {}
  return validCode(c) ? c : null;
}

// ---------- úložiště ----------
function localBackend() {
  var list;
  try { list = JSON.parse(lsGet(LS_ENTRIES) || "[]"); } catch (x) { list = []; }
  var cb = null;
  function save() { lsSet(LS_ENTRIES, JSON.stringify(list)); if (cb) cb(list.slice(), false); }
  return {
    mode: "local",
    subscribe: function (onData) { cb = onData; onData(list.slice(), false); },
    add: function (rec) { rec.id = "l" + Date.now(); list.push(rec); save(); return Promise.resolve(); },
    remove: function (id) { list = list.filter(function (e) { return e.id !== id; }); save(); return Promise.resolve(); },
    seed: function (items) { items.forEach(function (s) { if (!list.some(function (e) { return e.id === s.id; })) list.push(s); }); save(); return Promise.resolve(); }
  };
}

async function firestoreBackend(code) {
  var mods = await Promise.all([import(APP_URL), import(FS_URL)]);
  var A = mods[0], F = mods[1];
  var app = A.initializeApp(firebaseConfig);
  var db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (x) {
    db = F.getFirestore(app);
  }
  var col = F.collection(db, "households", code, "weights");
  function clean(rec) { return { turtle: rec.turtle, grams: rec.grams, date: rec.date, note: rec.note || "", ts: rec.ts || Date.now() }; }
  return {
    mode: "cloud",
    subscribe: function (onData, onErr) {
      F.onSnapshot(F.query(col, F.orderBy("date")), function (snap) {
        onData(snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }), snap.metadata.fromCache);
      }, onErr);
    },
    // Zápis se nečeká na server: offline se uloží do paměti zařízení a odešle se po připojení.
    add: function (rec) { F.addDoc(col, clean(rec)).catch(showWriteError); return Promise.resolve(); },
    remove: function (id) { F.deleteDoc(F.doc(col, id)).catch(showWriteError); return Promise.resolve(); },
    seed: function (items) {
      items.forEach(function (s) { F.setDoc(F.doc(col, s.id), clean(s)).catch(showWriteError); });
      return Promise.resolve();
    }
  };
}

function showWriteError(e) {
  var fm = $("formmsg");
  fm.className = "msg err";
  fm.textContent = (e && e.code === "permission-denied")
    ? "Databáze zápis odmítla. Zkontroluj pravidla ve Firebase."
    : "Uložení se nepovedlo. Zkus to znovu.";
}

// ---------- vykreslení ----------
function sorted() {
  return entries.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.ts || 0) - (b.ts || 0);
  });
}

function render() {
  var all = sorted();
  renderDue(all);
  renderCards(all);
  renderChart(all);
  renderHist(all);
  $("seedcard").hidden = !(backend && loaded && all.length === 0 && !seedDismissed());
}

function renderDue(all) {
  var el = $("due");
  if (!loaded) { el.textContent = "Načítám…"; el.className = "due"; return; }
  if (!all.length) { el.textContent = "Zatím žádné vážení – přidej první."; el.className = "due"; return; }
  var last = all[all.length - 1].date;
  var due = parse(last); due.setDate(due.getDate() + 14);
  var left = dayDiff(due, parse(todayStr()));
  var ds = due.getDate() + ". " + (due.getMonth() + 1) + ". " + due.getFullYear();
  if (left > 1) { el.textContent = "Další vážení: " + ds + " (za " + left + " dní)"; el.className = "due ok"; }
  else if (left === 1) { el.textContent = "Další vážení: zítra (" + ds + ")"; el.className = "due ok"; }
  else if (left === 0) { el.textContent = "Další vážení: dnes!"; el.className = "due warn"; }
  else { var o = -left; el.textContent = "Vážení je po termínu o " + o + (o === 1 ? " den" : (o < 5 ? " dny" : " dní")) + " (mělo být " + ds + ")"; el.className = "due warn"; }
}

// změna za 30 dní: porovná poslední vážení s tím, které je nejblíž 30 dnům před ním
function monthly(mine) {
  if (mine.length < 2) return null;
  var l = mine[mine.length - 1];
  var lt = parse(l.date).getTime(), target = lt - 30 * 86400000, best = null, bd = Infinity;
  for (var i = 0; i < mine.length - 1; i++) {
    var t = parse(mine[i].date).getTime();
    if (t >= lt) continue;
    var dd = Math.abs(t - target);
    if (dd < bd) { bd = dd; best = mine[i]; }
  }
  if (!best || !(best.grams > 0)) return null;
  var span = dayDiff(parse(l.date), parse(best.date));
  if (span < 1) return null;
  var diff = l.grams - best.grams;
  return { span: span, perMonth: diff / span * 30, pct: diff / best.grams * 100 / span * 30 };
}

function renderCards(all) {
  var box = $("turtles"); box.innerHTML = "";
  ["buffy", "otik"].forEach(function (k) {
    var mine = all.filter(function (e) { return e.turtle === k; });
    var c = document.createElement("div"); c.className = "t";
    c.style.setProperty("--c", k === "buffy" ? "var(--buffy)" : "var(--otik)");
    var h = tort(k) + '<div class="n">' + NAMES[k] + (k === "buffy" ? " ♀" : " ♂") + '</div>';
    if (!mine.length) { h += '<div class="g">–</div><div class="d">zatím bez vážení</div>'; }
    else {
      var l = mine[mine.length - 1];
      h += '<div class="g">' + fmtG(l.grams) + ' g</div>';
      var d = '';
      if (mine.length > 1) {
        var diff = l.grams - mine[mine.length - 2].grams;
        var cls = diff > 0 ? "up" : (diff < 0 ? "down" : "");
        var sign = diff > 0 ? "+" : (diff < 0 ? "−" : "±");
        d = '<span class="delta ' + cls + '">' + sign + fmtG(Math.abs(diff)) + ' g</span> · ';
      }
      h += '<div class="d">' + d + fmtShort(l.date) + '</div>';
      var m = monthly(mine);
      if (m) {
        var mc = m.perMonth > 0 ? "up" : (m.perMonth < 0 ? "down" : "");
        var ms = m.perMonth > 0 ? "+" : (m.perMonth < 0 ? "−" : "±");
        var approx = Math.abs(m.span - 30) > 3;
        h += '<div class="mo"><div class="d">Za měsíc</div><b class="delta ' + mc + '">' + ms + fmtG(Math.abs(m.perMonth)) + ' g</b> <span class="d">(' + ms + fmtG(Math.abs(m.pct)) + ' %)</span>' +
          (approx ? '<div class="d">přepočteno z ' + m.span + ' dní</div>' : '') + '</div>';
      }
    }
    c.innerHTML = h; box.appendChild(c);
  });
}

function renderChart(all) {
  var box = $("chart");
  if (all.length < 2) { box.innerHTML = '<div class="empty">' + tort("otik") + 'Graf se zobrazí od dvou vážení.</div>'; return; }
  var W = 340, H = 200, L = 40, R = 12, T = 12, B = 26;
  var gs = all.map(function (e) { return e.grams; });
  var min = Math.min.apply(null, gs), max = Math.max.apply(null, gs);
  if (max - min < 1) { min -= 1; max += 1; }
  var pad = (max - min) * 0.12; min = Math.max(0, min - pad); max = max + pad;
  var t0 = parse(all[0].date).getTime(), t1 = parse(all[all.length - 1].date).getTime();
  if (t1 === t0) t1 = t0 + 86400000;
  function X(d) { return L + (parse(d).getTime() - t0) / (t1 - t0) * (W - L - R); }
  function Y(g) { return T + (1 - (g - min) / (max - min)) * (H - T - B); }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf vývoje váhy">';
  for (var i = 0; i <= 3; i++) {
    var v = min + (max - min) * i / 3, y = Y(v);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/>';
    s += '<text x="' + (L - 5) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--mute)">' + Math.round(v) + '</text>';
  }
  s += '<text x="' + L + '" y="' + (H - 8) + '" font-size="10" fill="var(--mute)">' + fmtShort(all[0].date) + '</text>';
  s += '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="var(--mute)">' + fmtShort(all[all.length - 1].date) + '</text>';
  [["buffy", "var(--buffy)", false], ["otik", "var(--otik)", true]].forEach(function (cfg) {
    var mine = all.filter(function (e) { return e.turtle === cfg[0]; });
    if (!mine.length) return;
    var pts = mine.map(function (e) { return X(e.date).toFixed(1) + "," + Y(e.grams).toFixed(1); }).join(" ");
    s += '<polyline points="' + pts + '" fill="none" stroke="' + cfg[1] + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    mine.forEach(function (e) {
      var x = X(e.date), y = Y(e.grams);
      s += cfg[2] ? '<rect x="' + (x - 3.5) + '" y="' + (y - 3.5) + '" width="7" height="7" rx="1.5" fill="' + cfg[1] + '"/>'
        : '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + cfg[1] + '"/>';
    });
  });
  s += '</svg>';
  box.innerHTML = s;
}

function renderHist(all) {
  var ul = $("hist"); ul.innerHTML = "";
  if (!all.length) { ul.innerHTML = '<li style="display:block"><div class="empty">' + tort("buffy") + 'Zatím tu nic není.</div></li>'; return; }
  all.slice().reverse().forEach(function (e) {
    var li = document.createElement("li");
    li.innerHTML = tort(e.turtle, "mini") +
      '<div class="m"><b>' + esc(NAMES[e.turtle] || e.turtle) + '</b> · ' + fmtG(e.grams) + ' g<div class="note">' + fmt(e.date) + (e.note ? " · " + esc(e.note) : "") + '</div></div>';
    var b = document.createElement("button"); b.className = "ghost"; b.type = "button"; b.textContent = "Smazat";
    var armed = false, tm = null;
    b.addEventListener("click", function () {
      if (!armed) { armed = true; b.textContent = "Opravdu?"; b.classList.add("sure"); tm = setTimeout(function () { armed = false; b.textContent = "Smazat"; b.classList.remove("sure"); }, 3000); return; }
      clearTimeout(tm); backend.remove(e.id);
    });
    li.appendChild(b); ul.appendChild(li);
  });
}

// ---------- seed ----------
function seedDismissed() { return lsGet("zelvy-seed-done") === "1"; }
$("doseed").addEventListener("click", function () {
  $("doseed").disabled = true;
  backend.seed(SEED).then(function () { lsSet("zelvy-seed-done", "1"); $("seedcard").hidden = true; });
});

// ---------- formulář ----------
$("dd").value = todayStr();
$("f").addEventListener("submit", function (ev) {
  ev.preventDefault();
  if (!backend) return;
  var g = parseFloat($("gg").value.replace(",", "."));
  if (!(g > 0)) return;
  var rec = { turtle: $("tt").value, grams: g, date: $("dd").value || todayStr(), note: $("nn").value.trim(), ts: Date.now() };
  var fm = $("formmsg"); fm.className = "msg"; fm.textContent = "";
  backend.add(rec).then(function () {
    $("gg").value = ""; $("nn").value = "";
    fm.textContent = backend.mode === "cloud" ? "Uloženo ✓ (odešle se, jakmile bude připojení)" : "Uloženo ✓";
    setTimeout(function () { if (fm.textContent.indexOf("Uloženo") === 0) fm.textContent = ""; }, 3000);
  });
});

// ---------- nastavení sdílení ----------
function shareLink(code) { return location.origin + location.pathname + "#k=" + code; }

function showSettings(code) {
  $("settings").hidden = false;
  $("codeshow").value = prettyCode(code);
  $("copylink").onclick = function () {
    var link = shareLink(code), m = $("settingsmsg");
    var done = function () { m.className = "msg"; m.textContent = "Odkaz zkopírován ✓ Pošli ho druhému telefonu."; };
    var fail = function () { m.className = "msg err"; m.textContent = "Kopírování nevyšlo. Pošli kód ručně: " + prettyCode(code); };
    try { navigator.clipboard.writeText(link).then(done, fail); } catch (x) { fail(); }
  };
  $("leave").onclick = function () {
    if (!$("leave").dataset.armed) {
      $("leave").dataset.armed = "1"; $("leave").textContent = "Opravdu odpojit?";
      setTimeout(function () { delete $("leave").dataset.armed; $("leave").textContent = "Odpojit"; }, 3000);
      return;
    }
    lsDel(LS_CODE); lsDel("zelvy-seed-done"); location.reload();
  };
}

function showSetup() {
  $("setup").hidden = false;
  $("due").textContent = "Nejdřív propoj telefony (viz výše).";
  $("newcode").onclick = function () { lsSet(LS_CODE, newCode()); location.reload(); };
  $("joincode").onclick = function () {
    var c = normCode($("codein").value);
    if (!validCode(c)) { $("setupmsg").className = "msg err"; $("setupmsg").textContent = "Kód vypadá krátký. Zkontroluj ho."; return; }
    lsSet(LS_CODE, c); location.reload();
  };
}

// ---------- start ----------
function onData(list, fromCache) {
  entries = list;
  if (!fromCache || list.length) {
    loaded = true; clearTimeout(timer);
    if (!fromCache) $("status").textContent = "";
  }
  render();
}
function onErr(e) {
  loaded = true; clearTimeout(timer);
  var st = $("status"); st.className = "msg err";
  st.textContent = (e && e.code === "permission-denied")
    ? "Databáze data nepustila. Zkontroluj pravidla ve Firebase."
    : "Data se nepodařilo načíst.";
  render();
}

async function start() {
  render();
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }

  if (!firebaseConfig) {
    backend = localBackend();
    $("status").textContent = "Sdílení zatím není nastavené, data jsou jen v tomto zařízení.";
    backend.subscribe(onData, onErr);
    loaded = true; render();
    return;
  }

  var code = codeFromHash();
  if (code) lsSet(LS_CODE, code);
  code = lsGet(LS_CODE);
  if (!code || !validCode(code)) { loaded = true; showSetup(); render(); $("due").textContent = "Nejdřív propoj telefony (viz výše)."; return; }

  showSettings(code);
  timer = setTimeout(function () {
    if (!loaded) { $("status").className = "msg err"; $("status").textContent = "Data se zatím nepodařilo načíst. Zkontroluj připojení."; }
  }, 10000);

  try {
    backend = await firestoreBackend(code);
    backend.subscribe(onData, onErr);
  } catch (e) {
    clearTimeout(timer);
    loaded = true;
    backend = localBackend();
    $("status").className = "msg err";
    $("status").textContent = "Sdílení se nepodařilo spustit (offline?). Data se teď ukládají jen v tomto zařízení.";
    backend.subscribe(onData, onErr);
    render();
  }
}

start();
