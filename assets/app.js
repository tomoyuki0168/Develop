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

  /* 実行時に生成する文言の日本語版。HTML に書けないものだけをここに置く */
  var JA = {
    countAll: "全 <b>{total}</b> 柱", countSome: "<b>{n}</b> 柱 / 全 {total} 柱",
    none: "記載なし", viaAlias: "別名", viaKeyword: "通称",
    matchedIn: "{field}「{value}」に一致", matchedRomaji: "ローマ字表記に一致",
    matchedText: "解説文に一致", trivia: "こぼれ話",
    rowAliases: "別名", rowBenefits: "ご利益", rowShrines: "主な社",
    rowParents: "親神", rowSpouse: "配偶", rowChildren: "子神",
    rowMyths: "神話", rowSources: "典拠", rowTags: "属性",
    fAliases: "別名", fKeywords: "通称", fBenefits: "ご利益",
    fShrines: "神社", fMyths: "神話", fTags: "属性", fSources: "典拠",
    metaAliases: "別名", metaBenefits: "ご利益", metaShrines: "主な社"
  };

  var I18N = window.I18N || {};
  var lang = "ja";
  var T = null;                       // 日本語のときは null（原文をそのまま使う）

  function ui(k) { return (T && T.ui[k]) || JA[k] || k; }
  function term(v) { return (T && T.terms[v]) || v; }
  function place(v) {
    if (!T) return v;
    if (T.places && T.places[v]) return T.places[v];
    // placesFrom を持つ言語は、その言語の表記を借りる（例: 韓国語はローマ字表記を使う）
    var from = T.placesFrom && I18N[T.placesFrom];
    if (from && from.places && from.places[v]) return from.places[v];
    return v;
  }
  function grp(g) { return (T && T.groups[g]) || g; }
  function tr(d) { return T && T.deities[d.id]; }
  function dName(d) { var e = tr(d); return (e && e.name) || d.name; }
  function dEpithet(d) { var e = tr(d); return (e && e.epithet) || d.epithet; }
  function dDesc(d) { var e = tr(d); return (e && e.description) || d.description; }
  function dTrivia(d) { var e = tr(d); return e ? e.trivia : d.trivia; }
  function mapList(arr, fn) { return (arr || []).map(fn); }

  /* 見出しの下に添える行。見出しが漢字表記そのものなら、重ねて出さない */
  function subLine(d) {
    return (T && dName(d) !== d.name) ? esc(d.name) + " ・ " + esc(d.kana) : esc(d.kana);
  }

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
   "lang", "viewCard", "viewTable", "overlay", "sheetBody", "sheetClose", "prevBtn", "nextBtn"
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
  // ローマ字の長音記号を落とす。Ōkuninushi を "okuninushi" で引けるようにするため
  function deaccent(s) {
    return String(s).normalize ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "") : String(s);
  }

  /* 日本語の新字体・簡体字・繁体字を同じ形に畳む表。
     「大國主」と「大国主」、「毘賣」と「毘売」を同じものとして扱うために使う。
     検索語と検索対象の両方に同じ変換をかけるので、取りこぼしは起きない。
     tools/make-variants.py で生成した。 */
  var VARIANTS = {"丑":"醜","业":"業","东":"東","严":"厳","个":"箇","临":"臨","丽":"麗","义":"義","乌":"烏","乐":"楽","习":"習","书":"書","亂":"乱","云":"雲","产":"産","亩":"畝","仓":"倉","仪":"儀","伤":"傷","來":"来","俁":"俣","兔":"兎","內":"内","关":"関","兴":"興","养":"養","冈":"岡","农":"農","冰":"氷","冲":"沖","凑":"湊","创":"創","别":"別","制":"製","剧":"劇","势":"勢","卖":"売","卫":"衛","县":"県","參":"参","叶":"葉","呜":"嗚","嚴":"厳","园":"園","国":"國","圣":"聖","场":"場","壽":"寿","备":"備","复":"復","头":"頭","奧":"奥","妇":"婦","孙":"孫","學":"学","宫":"宮","导":"導","尔":"爾","屬":"属","岚":"嵐","岛":"島","岳":"嶽","巖":"巌","广":"広","库":"庫","廣":"広","开":"開","异":"異","张":"張","弥":"彌","彥":"彦","後":"后","徵":"征","愈":"癒","愿":"願","戋":"戔","托":"託","护":"護","斋":"斎","斩":"斬","时":"時","暗":"闇","术":"術","机":"機","杀":"殺","条":"條","枪":"槍","栉":"櫛","树":"樹","梦":"夢","榮":"栄","樂":"楽","樱":"桜","櫻":"桜","歲":"歳","气":"気","氣":"気","汤":"湯","泄":"洩","泷":"滝","泽":"沢","涂":"塗","淺":"浅","渔":"漁","溫":"温","滨":"浜","澤":"沢","濱":"浜","瀧":"滝","灣":"湾","灭":"滅","灵":"霊","灶":"竈","灾":"災","爱":"愛","狹":"狭","现":"現","琼":"瓊","瓮":"甕","电":"電","盐":"塩","盜":"盗","矶":"磯","础":"礎","祸":"禍","禮":"礼","秽":"穢","窗":"窓","笼":"籠","筑":"築","系":"係","縣":"県","约":"約","级":"級","纪":"紀","练":"練","织":"織","结":"結","统":"統","绵":"綿","罗":"羅","肤":"膚","胜":"勝","腳":"脚","舊":"旧","艺":"芸","苇":"葦","荣":"栄","萨":"薩","萬":"万","著":"着","藝":"芸","號":"号","蠶":"蚕","觀":"観","见":"見","观":"観","视":"視","许":"許","访":"訪","诃":"訶","词":"詞","试":"試","话":"話","诞":"誕","说":"説","诸":"諸","诹":"諏","诺":"諾","调":"調","谋":"謀","谱":"譜","谷":"穀","豐":"豊","豬":"猪","賣":"売","负":"負","财":"財","贵":"貴","贺":"賀","轮":"輪","轲":"軻","辟":"闢","边":"辺","达":"達","运":"運","进":"進","远":"遠","连":"連","迩":"邇","迹":"跡","邊":"辺","邻":"隣","醫":"医","钿":"鈿","铁":"鉄","铃":"鈴","锻":"鍛","镇":"鎮","镜":"鏡","长":"長","關":"関","门":"門","问":"問","间":"間","阑":"闌","阳":"陽","难":"難","雞":"鶏","雾":"霧","靈":"霊","靜":"静","韩":"韓","须":"須","风":"風","飞":"飛","餘":"余","饶":"饒","馆":"館","馔":"饌","驛":"駅","马":"馬","驰":"馳","驹":"駒","驿":"駅","體":"体","鬥":"斗","鸟":"鳥","鸡":"鶏","鸬":"鸕","鸭":"鴨","鹈":"鵜","鹚":"鶿","鹫":"鷲","鹽":"塩","黃":"黄","齋":"斎","龍":"竜","龙":"竜","龜":"亀","龟":"亀"};
  function foldKanji(s) {
    var out = "", i;
    for (i = 0; i < s.length; i++) out += VARIANTS[s.charAt(i)] || s.charAt(i);
    return out;
  }

  function norm(s) { return foldKanji(deaccent(toHira(String(s).toLowerCase()))); }

  // 神名として検索する対象（候補表示に使う）
  function nameFields(d) {
    if (d._namesLang !== lang) {
      var extra = [];
      if (tr(d) && tr(d).name) extra.push(tr(d).name);
      if (I18N.en && I18N.en.deities[d.id]) extra.push(I18N.en.deities[d.id].name);
      d._names = [d.name, d.kana, d.romaji].concat(d.aliases, d.keywords || [], extra).map(norm);
      d._namesLang = lang;
    }
    return d._names;
  }
  // 全文検索の対象
  function haystack(d) {
    if (d._hayLang !== lang) {
      var e = tr(d) || {};
      var en = (I18N.en && I18N.en.deities[d.id]) || {};   // 英語は常に引けるようにする
      // 訳文と原文の両方を対象にする。英語表示でも日本語で引けるようにするため
      var parts = [d.name, d.kana, d.romaji, d.group, d.epithet, d.description, d.trivia,
                   e.name, e.epithet, e.description, e.trivia, grp(d.group),
                   en.name, en.epithet]
        .concat(d.aliases, d.keywords || [], d.tags, d.benefits, d.myths, d.shrines, d.sources,
                mapList(d.tags, term), mapList(d.benefits, term), mapList(d.myths, term),
                mapList(d.shrines, place), mapList(d.sources, term),
                I18N.en ? mapList(d.benefits, function (v) { return I18N.en.terms[v] || v; }) : [],
                I18N.en ? mapList(d.myths, function (v) { return I18N.en.terms[v] || v; }) : []);
      d._hay = norm(parts.filter(Boolean).join(" "));
      d._hayLang = lang;
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
    if (norm(d.name).indexOf(t) !== -1 || norm(d.kana).indexOf(t) !== -1 ||
        norm(dName(d)).indexOf(t) !== -1) return null;
    var buckets = [["fAliases", d.aliases, null], ["fKeywords", d.keywords || [], null],
                   ["fBenefits", d.benefits, term], ["fShrines", d.shrines, place],
                   ["fMyths", d.myths, term], ["fTags", d.tags, term], ["fSources", d.sources, term]];
    for (var i = 0; i < buckets.length; i++) {
      var conv = buckets[i][2] || function (v) { return v; };
      var hit = (buckets[i][1] || []).filter(function (v) {
        return norm(v).indexOf(t) !== -1 || norm(conv(v)).indexOf(t) !== -1;
      })[0];
      if (hit) {
        return ui("matchedIn").replace("{field}", ui(buckets[i][0])).replace("{value}", conv(hit));
      }
    }
    if (norm(d.romaji).indexOf(t) !== -1) return ui("matchedRomaji");
    return ui("matchedText");
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
    // 日本語以外では訳名を見出しにし、漢字表記を下に添える（現地表示と突き合わせるため）
    var sub = subLine(d);
    return (
      '<button class="card" type="button" data-id="' + esc(d.id) + '" style="--gc:' + gc + '">' +
        '<span class="card__glyph" aria-hidden="true">' + esc(d.name.charAt(0)) + "</span>" +
        '<span class="card__group">' + esc(grp(d.group)) + "</span>" +
        '<h3 class="card__name">' + esc(dName(d)) + "</h3>" +
        '<span class="card__kana">' + sub + "</span>" +
        '<p class="card__epithet">' + esc(dEpithet(d)) + "</p>" +
        '<span class="card__metas">' +
          metaRow(ui("metaAliases"), d.aliases, 2) +
          metaRow(ui("metaBenefits"), mapList(d.benefits, term), 3, "mini--benefit") +
          metaRow(ui("metaShrines"), mapList(d.shrines, place), 1) +
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
    var sub = subLine(d);
    return '<tr data-id="' + esc(d.id) + '" tabindex="0">' +
      '<th scope="row"><span class="t-name">' + esc(dName(d)) + "</span>" +
        '<span class="t-kana">' + sub + "</span></th>" +
      '<td><span class="t-group" style="--gc:' + gc + '">' + esc(grp(d.group)) + "</span></td>" +
      "<td>" + cell(d.aliases, 3) + "</td>" +
      "<td>" + cell(mapList(d.benefits, term), 4, "mini--benefit") + "</td>" +
      "<td>" + cell(mapList(d.shrines, place), 2) + "</td>" +
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
      ? ui("countAll").replace("{total}", total)
      : ui("countSome").replace("{n}", list.length).replace("{total}", total);

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
      el.suggest.innerHTML = "";          // 残しておくと次の検索まで古い候補が DOM に残る
      el.suggest.hidden = true;
      el.search.setAttribute("aria-expanded", "false");
      return;
    }
    var t = state.terms[0];
    el.suggest.innerHTML = list.map(function (d, i) {
      // 入力語がどの表記に当たったかを添える（別名で引けたことが分かるように）
      var via = "";
      if (norm(d.name).indexOf(t) === -1 && norm(d.kana).indexOf(t) === -1 &&
          norm(dName(d)).indexOf(t) === -1) {
        var alias = d.aliases.filter(function (a) { return norm(a).indexOf(t) !== -1; })[0];
        var kw = (d.keywords || []).filter(function (a) { return norm(a).indexOf(t) !== -1; })[0];
        if (alias) via = '<span class="suggest__via">' + ui("viaAlias") + ": " + esc(alias) + "</span>";
        else if (kw) via = '<span class="suggest__via">' + ui("viaKeyword") + ": " + esc(kw) + "</span>";
      }
      return '<li id="sg-' + i + '" class="suggest__item" role="option" data-id="' + esc(d.id) + '"' +
        (i === state.suggestIndex ? ' aria-selected="true"' : ' aria-selected="false"') + ">" +
        '<span class="suggest__name">' + esc(dName(d)) + "</span>" +
        '<span class="suggest__kana">' + esc(T && dName(d) !== d.name ? d.name : d.kana) + "</span>" + via +
        '<span class="suggest__group">' + esc(grp(d.group)) + "</span></li>";
    }).join("");
    el.suggest.hidden = false;
    el.search.setAttribute("aria-expanded", "true");
  }

  function closeSuggest() {
    state.suggestions = []; state.suggestIndex = -1;
    el.suggest.innerHTML = "";
    el.suggest.hidden = true;
    el.search.setAttribute("aria-expanded", "false");
  }

  /* ── チップ ─────────────────────────── */
  // チップの表示だけを現在の言語で描き直す（値は原文のまま保つ）
  function paintChips(container, label) {
    Array.prototype.forEach.call(container.querySelectorAll(".chip"), function (chip) {
      var v = chip.getAttribute("data-value");
      var n = chip.querySelector(".chip__n");
      chip.textContent = label(v);
      if (n) chip.appendChild(n);
    });
  }

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
    if (!ids || !ids.length) return '<span class="pill pill--none">' + ui("none") + "</span>";
    return ids.map(function (id) {
      var t = byId[id];
      return t ? '<button class="pill pill--link" type="button" data-goto="' + esc(id) + '">' +
        esc(dName(t)) + "</button>" : "";
    }).join("");
  }

  function plainPills(arr, cls) {
    var a = listOrDash(arr);
    if (!a) return '<span class="pill pill--none">' + ui("none") + "</span>";
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
          '<span class="d-group">' + esc(grp(d.group)) + "</span>" +
          '<h2 class="d-name" id="sheetName">' + esc(dName(d)) + "</h2>" +
          '<div class="d-kana">' + subLine(d) + "</div>" +
          '<div class="d-romaji">' + esc(d.romaji) + "</div>" +
          '<p class="d-epithet">' + esc(dEpithet(d)) + "</p>" +
        "</div>" +
        '<p class="d-desc">' + esc(dDesc(d)) + "</p>" +
        (dTrivia(d) ? '<div class="d-trivia"><h4>' + ui("trivia") + "</h4><p>" +
          esc(dTrivia(d)) + "</p></div>" : "") +
        '<div class="d-rows">' +
          row(ui("rowAliases"), plainPills(d.aliases)) +
          row(ui("rowBenefits"), plainPills(mapList(d.benefits, term), "pill--benefit")) +
          row(ui("rowShrines"), plainPills(mapList(d.shrines, place))) +
          row(ui("rowParents"), relPills(d.parents)) +
          row(ui("rowSpouse"), relPills(d.spouse)) +
          row(ui("rowChildren"), relPills(d.children)) +
          row(ui("rowMyths"), plainPills(mapList(d.myths, term))) +
          row(ui("rowSources"), plainPills(mapList(d.sources, term))) +
          row(ui("rowTags"), plainPills(mapList(d.tags, term))) +
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

  /* HTML に書かれた日本語を原本として保持し、切替時に差し替える */
  var uiNodes = [];
  function collectUiNodes() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (n) {
      uiNodes.push({ node: n, key: n.getAttribute("data-i18n"), ja: n.innerHTML });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-attr]"), function (n) {
      n.getAttribute("data-i18n-attr").split("|").forEach(function (pair) {
        var a = pair.split(":");
        uiNodes.push({ node: n, attr: a[0], key: a[1], ja: n.getAttribute(a[0]) });
      });
    });
  }

  function applyUiLang() {
    uiNodes.forEach(function (r) {
      var v = T && T.ui[r.key];
      if (r.attr) r.node.setAttribute(r.attr, v || r.ja);
      else r.node.innerHTML = v || r.ja;
    });
    document.documentElement.lang = (T && T.htmlLang) || "ja";
    paintChips(el.groupFilters, grp);
    paintChips(el.benefitFilters, term);
    paintChips(el.mythFilters, term);
  }

  function setLang(code) {
    lang = I18N[code] ? code : "ja";
    T = I18N[lang] || null;
    el.lang.value = lang;
    store("kamigami-lang", lang);
    applyUiLang();
    render();
    if (!el.overlay.hidden) {
      var id = location.hash.replace(/^#/, "");
      if (byId[id]) openDeity(id, false);
    }
  }

  function detectLang() {
    var q = (location.search.match(/[?&]lang=([\w-]+)/) || [])[1];
    if (q && I18N[q]) return q;
    var saved = load("kamigami-lang");
    if (saved && (saved === "ja" || I18N[saved])) return saved;
    var nav = (navigator.language || "").toLowerCase();
    if (nav.indexOf("ja") === 0) return "ja";
    return I18N.en ? "en" : "ja";
  }

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

  collectUiNodes();
  el.lang.addEventListener("change", function () { setLang(el.lang.value); });

  state.view = load("kamigami-view") === "table" ? "table" : "card";
  el.viewCard.setAttribute("aria-pressed", String(state.view === "card"));
  el.viewTable.setAttribute("aria-pressed", String(state.view === "table"));
  setLang(detectLang());

  var initial = location.hash.replace(/^#/, "");
  if (initial && byId[initial]) openDeity(initial, false);
})();
