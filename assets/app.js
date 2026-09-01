/**
 * 天津神・国津神 図鑑 — アプリケーション
 * 依存なし・ビルド不要。index.html を直接開いても動作する。
 */
(function () {
  "use strict";

  var GROUP_ORDER = ["別天津神", "神世七代", "天津神", "国津神"];
  var GROUP_VAR = {
    "別天津神": "var(--g-koto)",
    "神世七代": "var(--g-nanayo)",
    "天津神": "var(--g-ama)",
    "国津神": "var(--g-kuni)"
  };

  var state = {
    q: "",
    groups: new Set(),
    benefits: new Set(),
    myths: new Set(),
    sort: "canonical",
    visible: []      // 現在表示中のID順（前後ナビ用）
  };

  var byId = {};
  DEITIES.forEach(function (d, i) { d._order = i; byId[d.id] = d; });

  var el = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    count: document.getElementById("count"),
    search: document.getElementById("search"),
    clearSearch: document.getElementById("clearSearch"),
    groupFilters: document.getElementById("groupFilters"),
    benefitFilters: document.getElementById("benefitFilters"),
    mythFilters: document.getElementById("mythFilters"),
    sort: document.getElementById("sort"),
    resetBtn: document.getElementById("resetBtn"),
    randomBtn: document.getElementById("randomBtn"),
    themeBtn: document.getElementById("themeBtn"),
    overlay: document.getElementById("overlay"),
    sheetBody: document.getElementById("sheetBody"),
    sheetClose: document.getElementById("sheetClose"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn")
  };

  /* ── 小物 ───────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // カタカナ → ひらがな（かな検索を両対応にする）
  function toHira(s) {
    return String(s).replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  function haystack(d) {
    if (d._hay) return d._hay;
    var parts = [d.name, d.kana, d.romaji, d.group, d.epithet, d.description, d.trivia]
      .concat(d.aliases, d.tags, d.benefits, d.myths, d.shrines, d.sources);
    d._hay = toHira(parts.join(" ").toLowerCase());
    return d._hay;
  }

  function uniqueValues(key) {
    var counts = {};
    DEITIES.forEach(function (d) {
      (d[key] || []).forEach(function (v) {
        if (v === "—") return;
        counts[v] = (counts[v] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, "ja"); })
      .map(function (v) { return { value: v, n: counts[v] }; });
  }

  /* ── 絞り込み ───────────────────────── */
  function matches(d) {
    if (state.groups.size && !state.groups.has(d.group)) return false;
    if (state.benefits.size) {
      var okB = d.benefits.some(function (b) { return state.benefits.has(b); });
      if (!okB) return false;
    }
    if (state.myths.size) {
      var okM = d.myths.some(function (m) { return state.myths.has(m); });
      if (!okM) return false;
    }
    if (state.q) {
      var hay = haystack(d);
      // 空白区切りの全語を含むこと（AND検索）
      var terms = toHira(state.q.toLowerCase()).split(/[\s　]+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) {
        if (hay.indexOf(terms[i]) === -1) return false;
      }
    }
    return true;
  }

  function sortList(list) {
    var s = state.sort;
    return list.slice().sort(function (a, b) {
      if (s === "kana") return toHira(a.kana).localeCompare(toHira(b.kana), "ja");
      if (s === "group") {
        var g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
        if (g !== 0) return g;
        return a._order - b._order;
      }
      return a._order - b._order;
    });
  }

  /* ── 描画 ───────────────────────────── */
  function cardHTML(d) {
    var gc = GROUP_VAR[d.group] || "var(--accent)";
    var tags = d.tags.slice(0, 3).map(function (t) {
      return '<span class="tag">' + esc(t) + "</span>";
    }).join("");
    return (
      '<button class="card" type="button" data-id="' + esc(d.id) + '" style="--gc:' + gc + '">' +
        '<span class="card__glyph" aria-hidden="true">' + esc(d.name.charAt(0)) + "</span>" +
        '<span class="card__group">' + esc(d.group) + "</span>" +
        '<h3 class="card__name">' + esc(d.name) + "</h3>" +
        '<span class="card__kana">' + esc(d.kana) + "</span>" +
        '<p class="card__epithet">' + esc(d.epithet) + "</p>" +
        '<span class="card__tags">' + tags + "</span>" +
      "</button>"
    );
  }

  function render() {
    var list = sortList(DEITIES.filter(matches));
    state.visible = list.map(function (d) { return d.id; });

    el.grid.innerHTML = list.map(cardHTML).join("");
    el.empty.hidden = list.length !== 0;

    var total = DEITIES.length;
    el.count.innerHTML = list.length === total
      ? "全 <b>" + total + "</b> 柱"
      : "<b>" + list.length + "</b> 柱 / 全 " + total + " 柱";

    el.clearSearch.hidden = !state.q;
    updateChipCounts();
  }

  /* ── チップ ─────────────────────────── */
  function buildChips(container, items, set, withCount) {
    container.innerHTML = items.map(function (it) {
      var v = it.value !== undefined ? it.value : it;
      var n = it.n;
      return '<button class="chip" type="button" role="button" aria-pressed="' +
        (set.has(v) ? "true" : "false") + '" data-value="' + esc(v) + '">' +
        esc(v) + (withCount && n ? '<span class="chip__n">' + n + "</span>" : "") +
        "</button>";
    }).join("");

    container.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      var v = chip.getAttribute("data-value");
      if (set.has(v)) { set.delete(v); chip.setAttribute("aria-pressed", "false"); }
      else { set.add(v); chip.setAttribute("aria-pressed", "true"); }
      render();
    });
  }

  // 現在の絞り込み下で 0 件になるチップを控えめに見せる
  function updateChipCounts() {
    [["group", el.groupFilters], ["benefits", el.benefitFilters], ["myths", el.mythFilters]]
      .forEach(function (pair) {
        var key = pair[0], container = pair[1];
        Array.prototype.forEach.call(container.querySelectorAll(".chip"), function (chip) {
          var v = chip.getAttribute("data-value");
          if (chip.getAttribute("aria-pressed") === "true") { chip.style.opacity = ""; return; }
          var hit = DEITIES.some(function (d) {
            if (!matchesExcept(d, key)) return false;
            return key === "group" ? d.group === v : (d[key] || []).indexOf(v) !== -1;
          });
          chip.style.opacity = hit ? "" : ".35";
        });
      });
  }

  // 指定した軸だけ無視して判定する（チップの有効/無効表示用）
  function matchesExcept(d, skip) {
    var saved = {
      groups: state.groups, benefits: state.benefits, myths: state.myths
    };
    if (skip === "group") state.groups = new Set();
    if (skip === "benefits") state.benefits = new Set();
    if (skip === "myths") state.myths = new Set();
    var ok = matches(d);
    state.groups = saved.groups; state.benefits = saved.benefits; state.myths = saved.myths;
    return ok;
  }

  /* ── 詳細シート ─────────────────────── */
  function relPills(ids) {
    if (!ids || !ids.length) return '<span class="pill pill--none">記載なし</span>';
    return ids.map(function (id) {
      var t = byId[id];
      if (!t) return "";
      return '<button class="pill pill--link" type="button" data-goto="' + esc(id) + '">' + esc(t.name) + "</button>";
    }).join("");
  }

  function plainPills(arr, cls) {
    if (!arr || !arr.length || (arr.length === 1 && arr[0] === "—")) {
      return '<span class="pill pill--none">記載なし</span>';
    }
    return arr.map(function (v) {
      return '<span class="pill ' + (cls || "") + '">' + esc(v) + "</span>";
    }).join("");
  }

  function row(k, vHTML) {
    return '<div class="d-row"><div class="d-row__k">' + k + '</div><div class="d-row__v">' + vHTML + "</div></div>";
  }

  var lastFocus = null;

  function openDeity(id, pushHash) {
    var d = byId[id];
    if (!d) return;
    if (el.overlay.hidden) lastFocus = document.activeElement;
    var gc = GROUP_VAR[d.group] || "var(--accent)";

    el.sheetBody.innerHTML =
      '<div style="--gc:' + gc + '">' +
        '<div class="d-head">' +
          '<span class="d-group">' + esc(d.group) + "</span>" +
          '<h2 class="d-name" id="sheetName">' + esc(d.name) + "</h2>" +
          '<div class="d-kana">' + esc(d.kana) + "</div>" +
          '<div class="d-romaji">' + esc(d.romaji) + "</div>" +
          '<p class="d-epithet">' + esc(d.epithet) + "</p>" +
        "</div>" +
        '<p class="d-desc">' + esc(d.description) + "</p>" +
        (d.trivia ? '<div class="d-trivia"><h4>こぼれ話</h4><p>' + esc(d.trivia) + "</p></div>" : "") +
        '<div class="d-rows">' +
          row("別名", plainPills(d.aliases)) +
          row("親神", relPills(d.parents)) +
          row("配偶", relPills(d.spouse)) +
          row("子神", relPills(d.children)) +
          row("神話", plainPills(d.myths)) +
          row("ご利益", plainPills(d.benefits, "pill--benefit")) +
          row("主な社", plainPills(d.shrines)) +
          row("典拠", plainPills(d.sources)) +
          row("属性", plainPills(d.tags)) +
        "</div>" +
      "</div>";

    el.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    el.sheetBody.scrollTop = 0;
    el.sheetClose.focus();

    // 前後ナビは「今表示している一覧」の並びに従う。一覧外なら全件順で辿る。
    var seq = state.visible.indexOf(id) !== -1 ? state.visible : DEITIES.map(function (x) { return x.id; });
    var i = seq.indexOf(id);
    el.prevBtn.disabled = i <= 0;
    el.nextBtn.disabled = i === -1 || i >= seq.length - 1;
    el.prevBtn.dataset.target = i > 0 ? seq[i - 1] : "";
    el.nextBtn.dataset.target = (i !== -1 && i < seq.length - 1) ? seq[i + 1] : "";

    if (pushHash !== false) history.replaceState(null, "", "#" + id);
  }

  function closeSheet() {
    el.overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  /* ── テーマ ─────────────────────────── */
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme");
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("kamigami-theme", t); } catch (e) { /* 保存不可でも動作は続ける */ }
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("kamigami-theme"); } catch (e) { saved = null; }
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  /* ── イベント ───────────────────────── */
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  el.search.addEventListener("input", debounce(function () {
    state.q = el.search.value.trim();
    render();
  }, 120));

  el.clearSearch.addEventListener("click", function () {
    el.search.value = ""; state.q = ""; render(); el.search.focus();
  });

  el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(); });

  el.resetBtn.addEventListener("click", function () {
    state.q = ""; state.groups.clear(); state.benefits.clear(); state.myths.clear();
    state.sort = "canonical";
    el.search.value = ""; el.sort.value = "canonical";
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
      c.setAttribute("aria-pressed", "false");
    });
    render();
  });

  el.grid.addEventListener("click", function (e) {
    var card = e.target.closest(".card");
    if (card) openDeity(card.getAttribute("data-id"));
  });

  el.sheetBody.addEventListener("click", function (e) {
    var link = e.target.closest("[data-goto]");
    if (link) openDeity(link.getAttribute("data-goto"));
  });

  el.prevBtn.addEventListener("click", function () {
    if (this.dataset.target) openDeity(this.dataset.target);
  });
  el.nextBtn.addEventListener("click", function () {
    if (this.dataset.target) openDeity(this.dataset.target);
  });

  el.sheetClose.addEventListener("click", closeSheet);
  el.overlay.addEventListener("click", function (e) {
    if (e.target === el.overlay) closeSheet();
  });

  el.randomBtn.addEventListener("click", function () {
    var pool = state.visible.length ? state.visible : DEITIES.map(function (d) { return d.id; });
    openDeity(pool[Math.floor(Math.random() * pool.length)]);
  });

  el.themeBtn.addEventListener("click", function () {
    var isDark = currentTheme() === "dark" ||
      (!currentTheme() && window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyTheme(isDark ? "light" : "dark");
  });

  document.addEventListener("keydown", function (e) {
    if (!el.overlay.hidden) {
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key === "ArrowLeft" && !el.prevBtn.disabled) { el.prevBtn.click(); return; }
      if (e.key === "ArrowRight" && !el.nextBtn.disabled) { el.nextBtn.click(); return; }
      return;
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); el.search.focus(); el.search.select(); }
    if (e.key === "Escape" && typing) { document.activeElement.blur(); }
  });

  window.addEventListener("hashchange", function () {
    var id = location.hash.replace(/^#/, "");
    if (id && byId[id]) openDeity(id, false);
  });

  /* ── 起動 ───────────────────────────── */
  initTheme();
  buildChips(el.groupFilters, GROUP_ORDER.map(function (g) {
    return { value: g, n: DEITIES.filter(function (d) { return d.group === g; }).length };
  }), state.groups, true);
  buildChips(el.benefitFilters, uniqueValues("benefits").slice(0, 24), state.benefits, true);
  buildChips(el.mythFilters, uniqueValues("myths").slice(0, 20), state.myths, true);
  render();

  var initial = location.hash.replace(/^#/, "");
  if (initial && byId[initial]) openDeity(initial, false);
})();
