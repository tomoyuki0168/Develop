#!/usr/bin/env python3
"""
検索用の字体対応表を作る（assets/app.js の VARIANTS に貼る）。

  python3 tools/make-variants.py

新字体・簡体字・繁体字を「日本語表記の形」へ畳むための表を、
神名・神社名・語彙に実際に現れる漢字から生成する。

検索語と検索対象の両方に同じ変換をかけて使うので、畳みすぎても
取りこぼしにはならない。逆に、値が別のキーにもなっていると
双方向に変換されて一致しなくなるため、循環がないことを検査する。
"""
import io, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

def load_zhconv():
    try:
        import zhconv
        return zhconv
    except ImportError:
        pass
    tmp = tempfile.mkdtemp()
    subprocess.check_call([sys.executable, "-m", "pip", "download", "zhconv",
                           "-d", tmp, "--no-deps", "-q"])
    tgz = [f for f in os.listdir(tmp) if f.endswith(".tar.gz")][0]
    subprocess.check_call(["tar", "xzf", os.path.join(tmp, tgz), "-C", tmp])
    src = [d for d in os.listdir(tmp) if d.startswith("zhconv-")][0]
    sys.path.insert(0, os.path.join(tmp, src))
    import zhconv
    return zhconv

# zhconv では拾えない日本語新字体の対応。目視で確認したものだけを置く
MANUAL = {
    "賣": "売", "卖": "売", "氣": "気", "气": "気", "豐": "豊", "藝": "芸", "艺": "芸",
    "歲": "歳", "龍": "竜", "龙": "竜", "學": "学", "號": "号", "舊": "旧",
    "觀": "観", "观": "観", "櫻": "桜", "樱": "桜", "濱": "浜", "滨": "浜",
    "邊": "辺", "边": "辺", "壽": "寿", "廣": "広", "广": "広", "澤": "沢", "泽": "沢",
    "關": "関", "关": "関", "樂": "楽", "乐": "楽", "榮": "栄", "荣": "栄",
    "嚴": "厳", "严": "厳", "靈": "霊", "灵": "霊", "齋": "斎", "斋": "斎",
    "雞": "鶏", "鸡": "鶏", "龜": "亀", "龟": "亀", "瀧": "滝", "泷": "滝",
    "鹽": "塩", "盐": "塩", "巖": "巌", "縣": "県", "县": "県", "驛": "駅", "驿": "駅",
    # 人神（実在の人物）の名に現れる新字体。zhconv は日本の字体を知らないため手で置く
    "德": "徳", "應": "応", "应": "応", "齊": "斉", "齐": "斉", "兒": "児", "儿": "児",
    "經": "経", "经": "経", "賴": "頼", "赖": "頼", "眞": "真", "鐮": "鎌", "镰": "鎌",
    "權": "権", "权": "権",
    # zhconv は日本の新字体を知らないため、データに実際にある字だけ手で対応づける
    "鄉": "郷", "乡": "郷", "傳": "伝", "传": "伝", "對": "対", "对": "対",
    "惠": "恵", "滿": "満", "满": "満", "讀": "読", "读": "読", "黑": "黒",
    "巢": "巣", "帶": "帯", "带": "帯", "攝": "摂", "摄": "摂", "樣": "様", "样": "様",
    "稻": "稲", "勳": "勲", "勋": "勲", "隱": "隠", "隐": "隠", "曾": "曽",
    "嶋": "島", "姬": "姫", "劍": "劔", "剑": "劔", "剣": "劔",
}

def main():
    zhconv = load_zhconv()
    out = subprocess.run(["node", "-e", '''
const d = require("./data/deities.js");
const s = new Set();
d.forEach(x => { [x.name, ...x.aliases, ...x.shrines, ...x.myths, ...x.benefits, ...x.tags]
  .forEach(v => [...v].forEach(c => s.add(c))); });
console.log([...s].join(""));
'''], capture_output=True, text=True, cwd=APP)
    jp = sorted({c for c in out.stdout.strip() if "一" <= c <= "鿿"})

    fold = {}
    for c in jp:
        for target in ("zh-hans", "zh-tw"):
            v = zhconv.convert(c, target)
            if len(v) == 1 and v != c:
                fold.setdefault(v, c)
    fold.update(MANUAL)

    # 値がキーにもなっている循環を潰す
    for _ in range(5):
        changed = False
        for k in list(fold):
            if fold[k] in fold and fold[fold[k]] != fold[k]:
                fold[k] = fold[fold[k]]; changed = True
            if k == fold[k]:
                del fold[k]; changed = True
        if not changed:
            break
    bad = [k for k, v in fold.items() if v in fold]
    if bad:
        print("循環が残っています:", bad); sys.exit(1)

    print("畳み込み %d 件。assets/app.js の VARIANTS に貼ってください。" % len(fold))
    print(",".join('"%s":"%s"' % (k, v) for k, v in sorted(fold.items())))

main()
