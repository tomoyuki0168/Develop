#!/usr/bin/env python3
"""
繁體中文版（zh-Hant.js）を、簡体版（zh-Hans.js）から生成する。

  python3 tools/make-zh-hant.py

変換は zhconv の zh-tw テーブルを使う。ただし機械変換では誤る語が
いくつかあるため、変換前に個別の置き換えを当てている（FIXES）。
変換対象は「値」だけで、キー（日本語の原文）には触れない。
"""
import io, os, re, sys, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

def load_zhconv():
    try:
        import zhconv
        return zhconv
    except ImportError:
        pass
    # 未導入なら pip download で取り寄せて展開する（ネットワークが要る）
    tmp = tempfile.mkdtemp()
    subprocess.check_call([sys.executable, "-m", "pip", "download", "zhconv",
                           "-d", tmp, "--no-deps", "-q"])
    tgz = [f for f in os.listdir(tmp) if f.endswith(".tar.gz")][0]
    subprocess.check_call(["tar", "xzf", os.path.join(tmp, tgz), "-C", tmp])
    src = [d for d in os.listdir(tmp) if d.startswith("zhconv-")][0]
    sys.path.insert(0, os.path.join(tmp, src))
    import zhconv
    return zhconv

# 機械変換が誤る語。変換前に繁体の正しい形へ置き換えておく
FIXES = [
    ("冲破", "衝破"),      # これだけが「衝」。以下の一括置換より先に当てる
    ("冲", "沖"),          # 沖之島・沖津宮・沖き入れる/洗う はすべて「沖」
    ("制棺", "製棺"),
    ("制玉", "製玉"),
]

# 変換後に直す語。zhconv は「征」を一律に「徵」へ寄せてしまうが、
# 遠征・東征・出征の「征」は繁体でも「征」のままが正しい（象徵は正しい）
POST_FIXES = [("東徵", "東征"), ("遠徵", "遠征"), ("出徵", "出征")]

def main():
    zhconv = load_zhconv()
    src = io.open(os.path.join(APP, "data/i18n/zh-Hans.js"), encoding="utf-8").read()

    def conv(text):
        for a, b in FIXES:
            text = text.replace(a, b)
        text = zhconv.convert(text, "zh-tw")
        for a, b in POST_FIXES:
            text = text.replace(a, b)
        return text

    # 「: "値"」の値だけを変換する。キーは日本語の原文なので触らない
    out = re.sub(r'(:\s*)"((?:[^"\\]|\\.)*)"',
                 lambda m: m.group(1) + '"' + conv(m.group(2)) + '"', src)

    out = out.replace('window.I18N["zh-Hans"]', 'window.I18N["zh-Hant"]')
    out = out.replace('label: "簡體中文"', 'label: "繁體中文"')
    out = out.replace('htmlLang: "zh-Hans"', 'htmlLang: "zh-Hant"')
    out = out.replace(" * 简体中文\n", " * 繁體中文（tools/make-zh-hant.py が zh-Hans.js から生成）\n")
    out = out.replace(" * 簡體中文\n", " * 繁體中文（tools/make-zh-hant.py が zh-Hans.js から生成）\n")

    # 変換漏れの検査。もう一度かけて変化するなら、直っていない字が残っている
    vals = re.findall(r':\s*"((?:[^"\\]|\\.)*)"', out)
    for v in vals:
        again = zhconv.convert(v, "zh-tw")
        for a, b in POST_FIXES:
            again = again.replace(a, b)
        if again != v:
            print("変換漏れ:", v[:60], "→", again[:60])
            sys.exit(1)

    io.open(os.path.join(APP, "data/i18n/zh-Hant.js"), "w", encoding="utf-8").write(out)
    print("data/i18n/zh-Hant.js を生成しました")

main()
