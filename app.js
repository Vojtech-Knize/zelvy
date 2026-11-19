import { firebaseConfig } from "./firebase-config.js";
import { APP_URL, FS_URL, TURTLES, NAMES, turtleById, markerSvg, $, lsGet, lsSet, lsDel, ymd, todayStr, parse, fmt, fmtShort, fmtG, dayDiff, esc, tort, flash } from "./common.js";
import { initBaths, startBaths } from "./baths.js";
import { initFeedings, startFeedings } from "./feedings.js";
import { initMeasure, startMeasure } from "./measure.js";
import { initSpray, startSpray } from "./spray.js";


var INTERVAL_DAYS = 7; // jak často se váží
var SEED = [
  { id: "seed-buffy-20261114", turtle: "buffy", grams: 50, date: "2026-11-14", note: "", ts: 1794657090385 },
  { id: "seed-otik-20261114", turtle: "otik", grams: 53, date: "2026-11-14", note: "", ts: 1794657098182 }
];
var LS_ENTRIES = "zelvy-vazeni-v1";
var LS_CODE = "zelvy-kod";

var entries = [];
var loaded = false;
var backend = null;
var ws = null; // úložiště vážení
var timer = null;


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
// backend.store(název) vrátí sadu záznamů (weights / baths / feedings) se stejným rozhraním.
var LS_KEYS = { weights: LS_ENTRIES, baths: "zelvy-koupani-v1", measurements: "zelvy-mereni-v1", sprayings: "zelvy-roseni-v1", feedings: "zelvy-krmeni-v1" };
var ERR_EL = { weights: "formmsg", baths: "bathmsg", feedings: "feedmsg", measurements: "measmsg", sprayings: "spraymsg" };

function localBackend() {
  return {
    mode: "local",
    store: function (name) {
      var key = LS_KEYS[name], list;
      try { list = JSON.parse(lsGet(key) || "[]"); } catch (x) { list = []; }
      var cb = null;
      function save() { lsSet(key, JSON.stringify(list)); if (cb) cb(list.slice(), false); }
      return {
        subscribe: function (onData) { cb = onData; onData(list.slice(), false); },
        add: function (rec) { rec.id = "l" + Date.now() + Math.random().toString(36).slice(2, 6); list.push(rec); save(); return Promise.resolve(); },
        set: function (id, rec) { rec.id = id; list = list.filter(function (e) { return e.id !== id; }); list.push(rec); save(); return Promise.resolve(); },
        remove: function (id) { list = list.filter(function (e) { return e.id !== id; }); save(); return Promise.resolve(); },
        seed: function (items) { items.forEach(function (s) { if (!list.some(function (e) { return e.id === s.id; })) list.push(s); }); save(); return Promise.resolve(); }
      };
    }
  };
}

var CLEAN = {
  weights: function (r) { return { turtle: r.turtle, grams: r.grams, date: r.date, note: r.note || "", ts: r.ts || Date.now() }; },
  baths: function (r) { return { turtle: r.turtle, date: r.date, note: r.note || "", ts: r.ts || Date.now() }; },
  sprayings: function (r) { return { date: r.date, note: r.note || "", ts: r.ts || Date.now() }; },
  measurements: function (r) { return { turtle: r.turtle, cm: r.cm, date: r.date, note: r.note || "", ts: r.ts || Date.now() }; },
  feedings: function (r) { return { turtle: r.turtle, date: r.date, foods: (r.foods || []).slice(0, 20), note: r.note || "", ts: r.ts || Date.now() }; }
};

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
  return {
    mode: "cloud",
    store: function (name) {
      var col = F.collection(db, "households", code, name), clean = CLEAN[name];
      var fail = function (e) { showWriteError(name, e); };
      return {
        subscribe: function (onData, onErr) {
          F.onSnapshot(F.query(col, F.orderBy("date")), function (snap) {
            onData(snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }), snap.metadata.fromCache);
          }, onErr);
        },
        // Zápis se nečeká na server: offline se uloží do paměti zařízení a odešle se po připojení.
        add: function (rec) { F.addDoc(col, clean(rec)).catch(fail); return Promise.resolve(); },
        set: function (id, rec) { F.setDoc(F.doc(col, id), clean(rec)).catch(fail); return Promise.resolve(); },
        remove: function (id) { F.deleteDoc(F.doc(col, id)).catch(fail); return Promise.resolve(); },
        seed: function (items) {
          items.forEach(function (s) { F.setDoc(F.doc(col, s.id), clean(s)).catch(fail); });
          return Promise.resolve();
        }
      };
    }
  };
}

function showWriteError(name, e) {
  var fm = $(ERR_EL[name] || "formmsg");
  fm.className = "msg err";
  fm.textContent = (e && e.code === "permission-denied")
    ? "Databáze zápis odmítla. V databázi (Firebase) je potřeba doplnit pravidla pro tuto záložku."
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
  if (!dateDirty && loaded) $("dd").value = defaultDate(all);
  $("seedcard").hidden = !(backend && loaded && all.length === 0 && !seedDismissed());
}

function dueOf(mine) {
  var d = parse(mine[mine.length - 1].date); d.setDate(d.getDate() + INTERVAL_DAYS); return d;
}

function renderDue(all) {
  var el = $("due");
  if (!loaded) { el.textContent = "Načítám…"; el.className = "due"; return; }
  if (!all.length) { el.textContent = "Zatím žádné vážení – přidej první."; el.className = "due"; return; }
  var dues = [];
  TURTLES.forEach(function (t) {
    var mine = all.filter(function (e) { return e.turtle === t.id; });
    if (mine.length) dues.push({ t: t, d: dueOf(mine) });
  });
  var first = dues.reduce(function (a, b) { return b.d < a.d ? b : a; });
  var who = dues.filter(function (x) { return x.d.getTime() === first.d.getTime(); }).map(function (x) { return x.t.name; });
  var suffix = who.length < dues.length ? " · " + who.join(", ") : "";
  var left = dayDiff(first.d, parse(todayStr()));
  var ds = first.d.getDate() + ". " + (first.d.getMonth() + 1) + ". " + first.d.getFullYear();
  if (left > 1) { el.textContent = "Další vážení: " + ds + " (za " + left + " dní)" + suffix; el.className = "due ok"; }
  else if (left === 1) { el.textContent = "Další vážení: zítra (" + ds + ")" + suffix; el.className = "due ok"; }
  else if (left === 0) { el.textContent = "Další vážení: dnes!" + suffix; el.className = "due warn"; }
  else { var o = -left; el.textContent = "Vážení je po termínu o " + o + (o === 1 ? " den" : (o < 5 ? " dny" : " dní")) + " (mělo být " + ds + ")" + suffix; el.className = "due warn"; }
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
  TURTLES.forEach(function (t) {
    var k = t.id;
    var mine = all.filter(function (e) { return e.turtle === k; });
    var c = document.createElement("div"); c.className = "t";
    c.style.setProperty("--c", t.color);
    var h = tort(k) + '<div class="n">' + t.name + " " + t.sex + '</div>' + (t.where ? '<div class="d">' + t.where + '</div>' : '');
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
      var nd = dueOf(mine);
      h += '<div class="d">příště ' + nd.getDate() + ". " + (nd.getMonth() + 1) + ".</div>";
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
  TURTLES.forEach(function (t) {
    var mine = all.filter(function (e) { return e.turtle === t.id; });
    if (!mine.length) return;
    var pts = mine.map(function (e) { return X(e.date).toFixed(1) + "," + Y(e.grams).toFixed(1); }).join(" ");
    s += '<polyline points="' + pts + '" fill="none" stroke="' + t.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    mine.forEach(function (e) {
      var x = X(e.date), y = Y(e.grams), f = 'fill="' + t.color + '"';
      if (t.marker === "square") s += '<rect x="' + (x - 3.5) + '" y="' + (y - 3.5) + '" width="7" height="7" rx="1.5" ' + f + '/>';
      else if (t.marker === "triangle") s += '<polygon points="' + x + ',' + (y - 5) + ' ' + (x + 5) + ',' + (y + 4) + ' ' + (x - 5) + ',' + (y + 4) + '" ' + f + '/>';
      else if (t.marker === "diamond") s += '<polygon points="' + x + ',' + (y - 5) + ' ' + (x + 5) + ',' + y + ' ' + x + ',' + (y + 5) + ' ' + (x - 5) + ',' + y + '" ' + f + '/>';
      else s += '<circle cx="' + x + '" cy="' + y + '" r="4" ' + f + '/>';
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
      clearTimeout(tm); ws.remove(e.id);
    });
    li.appendChild(b); ul.appendChild(li);
  });
}

// ---------- seed ----------
function seedDismissed() { return lsGet("zelvy-seed-done") === "1"; }
$("doseed").addEventListener("click", function () {
  $("doseed").disabled = true;
  ws.seed(SEED).then(function () { lsSet("zelvy-seed-done", "1"); $("seedcard").hidden = true; });
});

// ---------- formulář ----------
$("dd").value = todayStr();
// Datum ve formuláři: den dalšího vážení (poslední vážení + interval). Ručně změněné datum se nepřepisuje.
var dateDirty = false;
$("dd").addEventListener("input", function () { dateDirty = true; });
function defaultDate(all) {
  var tid = $("tt").value;
  var mine = all.filter(function (e) { return e.turtle === tid; });
  if (!mine.length) return todayStr();
  return ymd(dueOf(mine));
}
(function fillForm() {
  $("tt").innerHTML = TURTLES.map(function (t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join("");
  $("legend").innerHTML = TURTLES.map(function (t) {
    return '<span style="color:var(--mute)"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' + markerSvg(t.marker, t.color, 12) + '</svg>' + t.name + '</span>';
  }).join("");
  $("tt").addEventListener("change", function () { if (!dateDirty) $("dd").value = defaultDate(sorted()); });
})();
$("f").addEventListener("submit", function (ev) {
  ev.preventDefault();
  if (!ws) return;
  var g = parseFloat($("gg").value.replace(",", "."));
  if (!(g > 0)) return;
  var rec = { turtle: $("tt").value, grams: g, date: $("dd").value || todayStr(), note: $("nn").value.trim(), ts: Date.now() };
  var fm = $("formmsg"); fm.className = "msg"; fm.textContent = "";
  dateDirty = false; // po uložení se datum znovu nastaví na další týden
  ws.add(rec).then(function () {
    $("gg").value = ""; $("nn").value = ""; render();
    fm.textContent = backend.mode === "cloud" ? "Uloženo ✓ (odešle se, jakmile bude připojení)" : "Uloženo ✓";
    setTimeout(function () { if (fm.textContent.indexOf("Uloženo") === 0) fm.textContent = ""; }, 3000);
  });
});

// ---------- nastavení sdílení ----------
function shareLink(code) { return location.origin + location.pathname + "#k=" + code; }

function showSettings(code) {
  // Nastavení sdílení je schované, otevře se až tlačítkem dole (kód se běžně nepotřebuje).
  var tg = $("togglesettings");
  tg.hidden = false;
  tg.onclick = function () {
    var box = $("settings");
    box.hidden = !box.hidden;
    tg.textContent = box.hidden ? "⚙ Sdílení a kód" : "⚙ Skrýt sdílení";
    if (!box.hidden) box.scrollIntoView({ behavior: "smooth", block: "center" });
  };
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

// po připojení databáze: vážení + koupání + krmení
function attach() {
  ws = backend.store("weights");
  ws.subscribe(onData, onErr);
  startBaths(backend.store("baths"), tabErr("bathmsg", "Koupání"));
  startFeedings(backend.store("feedings"), tabErr("feedmsg", "Krmení"));
  startMeasure(backend.store("measurements"), tabErr("measmsg", "Měření"));
  startSpray(backend.store("sprayings"), tabErr("spraymsg", "Rosení"));
}
function tabErr(id, what) {
  return function (e) {
    var el = $(id); el.className = "msg err";
    el.textContent = (e && e.code === "permission-denied")
      ? what + ": databáze data nepustila. V databázi (Firebase) je potřeba doplnit nová pravidla."
      : what + ": data se nepodařilo načíst.";
  };
}

// ---------- záložky ----------
var TAB_SUB = {
  weigh: "Buffy, Otík, Cecík a Drobeček · vážíme jednou týdně",
  bath: "Koupání · zapiš, kdy která želva byla ve vodě",
  feed: "Krmení · zapiš, čím jsi želvy nakrmil",
  spray: "Rosení · kdy se rosilo želvárium",
  meas: "Měření v cm · jednou za 3 měsíce"
};
function showTab(id) {
  if (!TAB_SUB[id]) id = "weigh";
  Array.prototype.forEach.call(document.querySelectorAll("[data-tabid]"), function (s) { s.hidden = s.dataset.tabid !== id; });
  Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
    var on = b.dataset.tab === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("sub").textContent = TAB_SUB[id];
  lsSet("zelvy-tab", id);
}
$("tabs").addEventListener("click", function (e) {
  var b = e.target.closest("button");
  if (b) { showTab(b.dataset.tab); window.scrollTo(0, 0); }
});
showTab("feed"); // aplikace se vždy otevře na Krmení (první záložka)
initBaths();
initFeedings();
initMeasure();
initSpray();

async function start() {
  render();
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }

  if (!firebaseConfig) {
    backend = localBackend();
    $("status").textContent = "Sdílení zatím není nastavené, data jsou jen v tomto zařízení.";
    attach();
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
    attach();
  } catch (e) {
    clearTimeout(timer);
    loaded = true;
    backend = localBackend();
    $("status").className = "msg err";
    $("status").textContent = "Sdílení se nepodařilo spustit (offline?). Data se teď ukládají jen v tomto zařízení.";
    attach();
    render();
  }
}

start();
