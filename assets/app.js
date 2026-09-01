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
  var SUGGEST_MAX = 8;

  var state = {
    q: "",
    terms: [],
    groups: new Set(),
    benefits: new Set(),
    myths: new Set(),
    sort: "canonical",
    view: "card",
    visible: [],       // 現在表示中のID順（前後ナビ用）
    suggestions: [],
    suggestIndex: -1
  };

  var byId = {};
  DEITIES.forEach(function (d, i) { d._order = i; byId[d.id] = d; });

  /* 系譜の相互参照を補完する。
     データ側では片方向にだけ書けばよく、逆向きはここで自動的に張られる。 */
  (function linkRelations() {
    function add(id, key, value) {
      var t = byId[id];
      if (t && t[key].indexOf(value) === -1) t[key].push(value);
    }
    DEITIES.forEach(function (d) {
      d.parents.forEach(function (p) { add(p, "children", d.id); });
      d.children.forEach(function (c) { add(c, "parents", d.id); });
      d.spouse.forEach(function (s) { add(s, "spouse", d.id); });
    });
  })();

  var el = {};
  ["grid", "tableWrap", "tableBody", "empty", "count", "search", "clearSearch", "suggest",
   "groupFilters", "benefitFilters", "mythFilters", "sort", "resetBtn", "randomBtn", "themeBtn",
   "viewCard", "viewTable", "overlay", "sheetBody", "sheetClose", "prevBtn", "nextBtn"
  ].forEach(function (k) { el[k] = document.getElementById(k); });

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
  function norm(s) { return toHira(String(s).toLowerCase()); }

  // 神名として検索する対象（候補表示に使う）
  function nameFields(d) {
    if (!d._names) d._names = [d.name, d.kana, d.romaji]
      .concat(d.aliases, d.keywords || []).map(norm);
    return d._names;
  }
  // 全文検索の対象
  function haystack(d) {
    if (!d._hay) {
      d._hay = norm([d.name, d.kana, d.romaji, d.group, d.epithet, d.description, d.trivia]
        .concat(d.aliases, d.keywords || [], d.tags, d.benefits, d.myths, d.shrines, d.sources)
        .join(" "));
    }
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

  function listOrDash(arr) {
    if (!arr || !arr.length || (arr.length === 1 && arr[0] === "—")) return null;
    return arr;
  }

  /* ── 絞り込み ───────────────────────── */
  function matches(d) {
    if (state.groups.size && !state.groups.has(d.group)) return false;
    if (state.benefits.size && !d.benefits.some(function (b) { return state.benefits.has(b); })) return false;
    if (state.myths.size && !d.myths.some(function (m) { return state.myths.has(m); })) return false;
    if (state.terms.length) {
      var hay = haystack(d);
      for (var i = 0; i < state.terms.length; i++) {
        if (hay.indexOf(state.terms[i]) === -1) return false;   // 空白区切りは AND
      }
    }
    return true;
  }

  // 名前以外で一致したときに、どの項目で当たったかを返す
  function matchReason(d) {
    if (!state.terms.length) return null;
    var t = state.terms[0];
    if (norm(d.name).indexOf(t) !== -1 || norm(d.kana).indexOf(t) !== -1) return null;
    var buckets = [["別名", d.aliases], ["通称", d.keywords || []], ["ご利益", d.benefits], ["神社", d.shrines],
                   ["神話", d.myths], ["属性", d.tags], ["典拠", d.sources]];
    for (var i = 0; i < buckets.length; i++) {
      var hit = (buckets[i][1] || []).filter(function (v) { return norm(v).indexOf(t) !== -1; })[0];
      if (hit) return buckets[i][0] + "「" + hit + "」に一致";
    }
    if (norm(d.romaji).indexOf(t) !== -1) return "ローマ字表記に一致";
    return "解説文に一致";
  }

  function sortList(list) {
    var s = state.sort;
    return list.slice().sort(function (a, b) {
      if (s === "kana") return toHira(a.kana).localeCompare(toHira(b.kana), "ja");
      if (s === "group") {
        var g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
        if (g !== 0) return g;
      }
      return a._order - b._order;
    });
  }

  /* ── 描画 ───────────────────────────── */
  function metaRow(label, values, max, cls) {
    var arr = listOrDash(values);
    if (!arr) return "";
    var shown = arr.slice(0, max).map(function (v) {
      return '<span class="mini ' + (cls || "") + '">' + esc(v) + "</span>";
    }).join("");
    var rest = arr.length > max ? '<span class="mini mini--more">+' + (arr.length - max) + "</span>" : "";
    return '<div class="card__meta"><span class="card__metak">' + label + "</span>" +
           '<span class="card__metav">' + shown + rest + "</span></div>";
  }

  function cardHTML(d) {
    var gc = GROUP_VAR[d.group] || "var(--accent)";
    var reason = matchReason(d);
    return (
      '<button class="card" type="button" data-id="' + esc(d.id) + '" style="--gc:' + gc + '">' +
        '<span class="card__glyph" aria-hidden="true">' + esc(d.name.charAt(0)) + "</span>" +
        '<span class="card__group">' + esc(d.group) + "</span>" +
        '<h3 class="card__name">' + esc(d.name) + "</h3>" +
        '<span class="card__kana">' + esc(d.kana) + "</span>" +
        '<p class="card__epithet">' + esc(d.epithet) + "</p>" +
        '<span class="card__metas">' +
          metaRow("別名", d.aliases, 2) +
          metaRow("ご利益", d.benefits, 3, "mini--benefit") +
          metaRow("主な社", d.shrines, 1) +
        "</span>" +
        (reason ? '<span class="card__reason">' + esc(reason) + "</span>" : "") +
      "</button>"
    );
  }

  function cell(values, max, cls) {
    var arr = listOrDash(values);
    if (!arr) return '<span class="mini mini--none">—</span>';
    return arr.slice(0, max).map(function (v) {
      return '<span class="mini ' + (cls || "") + '">' + esc(v) + "</span>";
    }).join("") + (arr.length > max ? '<span class="mini mini--more">+' + (arr.length - max) + "</span>" : "");
  }

  function rowHTML(d) {
    var gc = GROUP_VAR[d.group] || "var(--accent)";
    return '<tr data-id="' + esc(d.id) + '" tabindex="0">' +
      '<th scope="row"><span class="t-name">' + esc(d.name) + "</span>" +
        '<span class="t-kana">' + esc(d.kana) + "</span></th>" +
      '<td><span class="t-group" style="--gc:' + gc + '">' + esc(d.group) + "</span></td>" +
      "<td>" + cell(d.aliases, 3) + "</td>" +
      "<td>" + cell(d.benefits, 4, "mini--benefit") + "</td>" +
      "<td>" + cell(d.shrines, 2) + "</td>" +
      "</tr>";
  }

  function render() {
    var list = sortList(DEITIES.filter(matches));
    state.visible = list.map(function (d) { return d.id; });

    if (state.view === "table") {
      el.tableBody.innerHTML = list.map(rowHTML).join("");
      el.grid.innerHTML = "";
    } else {
      el.grid.innerHTML = list.map(cardHTML).join("");
      el.tableBody.innerHTML = "";
    }
    el.grid.hidden = state.view !== "card";
    el.tableWrap.hidden = state.view !== "table" || list.length === 0;
    el.empty.hidden = list.length !== 0;

    var total = DEITIES.length;
    el.count.innerHTML = list.length === total
      ? "全 <b>" + total + "</b> 柱"
      : "<b>" + list.length + "</b> 柱 / 全 " + total + " 柱";

    el.clearSearch.hidden = !state.q;
    updateChipCounts();
  }

  /* ── 神名の候補（サジェスト） ───────────── */
  function buildSuggestions() {
    if (!state.terms.length) return [];
    var t = state.terms[0];
    var starts = [], contains = [];
    DEITIES.forEach(function (d) {
      var fields = nameFields(d), best = -1;
      for (var i = 0; i < fields.length; i++) {
        var pos = fields[i].indexOf(t);
        if (pos === 0) { best = 0; break; }
        if (pos > 0 && best !== 0) best = 1;
      }
      if (best === 0) starts.push(d);
      else if (best === 1) contains.push(d);
    });
    return starts.concat(contains).slice(0, SUGGEST_MAX);
  }

  function renderSuggestions() {
    var list = state.suggestions;
    if (!list.length) {
      el.suggest.hidden = true;
      el.search.setAttribute("aria-expanded", "false");
      return;
    }
    var t = state.terms[0];
    el.suggest.innerHTML = list.map(function (d, i) {
      // 入力語がどの表記に当たったかを添える（別名で引けたことが分かるように）
      var via = "";
      if (norm(d.name).indexOf(t) === -1 && norm(d.kana).indexOf(t) === -1) {
        var alias = d.aliases.filter(function (a) { return norm(a).indexOf(t) !== -1; })[0];
        var kw = (d.keywords || []).filter(function (a) { return norm(a).indexOf(t) !== -1; })[0];
        if (alias) via = '<span class="suggest__via">別名: ' + esc(alias) + "</span>";
        else if (kw) via = '<span class="suggest__via">通称: ' + esc(kw) + "</span>";
      }
      return '<li id="sg-' + i + '" class="suggest__item" role="option" data-id="' + esc(d.id) + '"' +
        (i === state.suggestIndex ? ' aria-selected="true"' : ' aria-selected="false"') + ">" +
        '<span class="suggest__name">' + esc(d.name) + "</span>" +
        '<span class="suggest__kana">' + esc(d.kana) + "</span>" + via +
        '<span class="suggest__group">' + esc(d.group) + "</span></li>";
    }).join("");
    el.suggest.hidden = false;
    el.search.setAttribute("aria-expanded", "true");
  }

  function closeSuggest() {
    state.suggestions = []; state.suggestIndex = -1;
    el.suggest.hidden = true;
    el.search.setAttribute("aria-expanded", "false");
  }

  /* ── チップ ─────────────────────────── */
  function buildChips(container, items, set, withCount) {
    container.innerHTML = items.map(function (it) {
      var v = it.value !== undefined ? it.value : it;
      return '<button class="chip" type="button" aria-pressed="' + (set.has(v) ? "true" : "false") +
        '" data-value="' + esc(v) + '">' + esc(v) +
        (withCount && it.n ? '<span class="chip__n">' + it.n + "</span>" : "") + "</button>";
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
    var saved = { groups: state.groups, benefits: state.benefits, myths: state.myths };
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
      return t ? '<button class="pill pill--link" type="button" data-goto="' + esc(id) + '">' +
        esc(t.name) + "</button>" : "";
    }).join("");
  }

  function plainPills(arr, cls) {
    var a = listOrDash(arr);
    if (!a) return '<span class="pill pill--none">記載なし</span>';
    return a.map(function (v) { return '<span class="pill ' + (cls || "") + '">' + esc(v) + "</span>"; }).join("");
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
          row("ご利益", plainPills(d.benefits, "pill--benefit")) +
          row("主な社", plainPills(d.shrines)) +
          row("親神", relPills(d.parents)) +
          row("配偶", relPills(d.spouse)) +
          row("子神", relPills(d.children)) +
          row("神話", plainPills(d.myths)) +
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

  /* ── テーマ・表示形式 ───────────────── */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存不可でも継続 */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function currentTheme() { return document.documentElement.getAttribute("data-theme"); }
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); store("kamigami-theme", t); }

  function setView(v) {
    state.view = v;
    el.viewCard.setAttribute("aria-pressed", String(v === "card"));
    el.viewTable.setAttribute("aria-pressed", String(v === "table"));
    store("kamigami-view", v);
    render();
  }

  /* ── イベント ───────────────────────── */
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  function applyQuery() {
    state.q = el.search.value.trim();
    state.terms = norm(state.q).split(/[\s　]+/).filter(Boolean);
    state.suggestions = buildSuggestions();
    state.suggestIndex = -1;
    renderSuggestions();
    render();
  }

  el.search.addEventListener("input", debounce(applyQuery, 110));
  el.search.addEventListener("focus", function () { if (state.q) renderSuggestions(); });
  el.search.addEventListener("blur", function () { setTimeout(closeSuggest, 150); });

  el.search.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!state.suggestions.length) return;
      e.preventDefault();
      var n = state.suggestions.length;
      state.suggestIndex = e.key === "ArrowDown"
        ? (state.suggestIndex + 1 >= n ? -1 : state.suggestIndex + 1)
        : (state.suggestIndex - 1 < -1 ? n - 1 : state.suggestIndex - 1);
      renderSuggestions();
      return;
    }
    if (e.key === "Enter") {
      var pick = state.suggestIndex >= 0 ? state.suggestions[state.suggestIndex]
                                         : (state.suggestions.length === 1 ? state.suggestions[0] : null);
      if (pick) { e.preventDefault(); closeSuggest(); openDeity(pick.id); }
      return;
    }
    if (e.key === "Escape") { closeSuggest(); }
  });

  el.suggest.addEventListener("mousedown", function (e) {
    var item = e.target.closest(".suggest__item");
    if (!item) return;
    e.preventDefault();               // blur より先に処理する
    closeSuggest();
    openDeity(item.getAttribute("data-id"));
  });

  el.clearSearch.addEventListener("click", function () {
    el.search.value = ""; closeSuggest(); applyQuery(); el.search.focus();
  });

  el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(); });

  el.resetBtn.addEventListener("click", function () {
    state.groups.clear(); state.benefits.clear(); state.myths.clear();
    state.sort = "canonical";
    el.search.value = ""; el.sort.value = "canonical";
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
      c.setAttribute("aria-pressed", "false");
    });
    closeSuggest();
    applyQuery();
  });

  el.viewCard.addEventListener("click", function () { setView("card"); });
  el.viewTable.addEventListener("click", function () { setView("table"); });

  el.grid.addEventListener("click", function (e) {
    var card = e.target.closest(".card");
    if (card) openDeity(card.getAttribute("data-id"));
  });

  el.tableBody.addEventListener("click", function (e) {
    var tr = e.target.closest("tr");
    if (tr) openDeity(tr.getAttribute("data-id"));
  });
  el.tableBody.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var tr = e.target.closest("tr");
    if (tr) { e.preventDefault(); openDeity(tr.getAttribute("data-id")); }
  });

  el.sheetBody.addEventListener("click", function (e) {
    var link = e.target.closest("[data-goto]");
    if (link) openDeity(link.getAttribute("data-goto"));
  });

  el.prevBtn.addEventListener("click", function () { if (this.dataset.target) openDeity(this.dataset.target); });
  el.nextBtn.addEventListener("click", function () { if (this.dataset.target) openDeity(this.dataset.target); });

  el.sheetClose.addEventListener("click", closeSheet);
  el.overlay.addEventListener("click", function (e) { if (e.target === el.overlay) closeSheet(); });

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
  (function initTheme() {
    var saved = load("kamigami-theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
    else document.documentElement.removeAttribute("data-theme");
  })();

  buildChips(el.groupFilters, GROUP_ORDER.map(function (g) {
    return { value: g, n: DEITIES.filter(function (d) { return d.group === g; }).length };
  }), state.groups, true);
  buildChips(el.benefitFilters, uniqueValues("benefits").slice(0, 28), state.benefits, true);
  buildChips(el.mythFilters, uniqueValues("myths").slice(0, 22), state.myths, true);

  setView(load("kamigami-view") === "table" ? "table" : "card");

  var initial = location.hash.replace(/^#/, "");
  if (initial && byId[initial]) openDeity(initial, false);
})();
