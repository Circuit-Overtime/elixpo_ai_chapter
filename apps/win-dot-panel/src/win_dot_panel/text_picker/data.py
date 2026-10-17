"""Offline kaomoji and Unicode symbol collections."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TextItem:
    value: str
    name: str
    category: str
    keywords: str = ""


KAOMOJI = (
    TextItem("(＾▽＾)", "Happy smile", "Happy", "joy cheerful"),
    TextItem("(ᵔ◡ᵔ)", "Gentle smile", "Happy", "content"),
    TextItem("(⌒‿⌒)", "Warm smile", "Happy", "cheerful"),
    TextItem("(✿◠‿◠)", "Flower smile", "Happy", "cute"),
    TextItem("(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "Sparkle celebration", "Happy", "excited yay"),
    TextItem("ヽ(・∀・)ﾉ", "Cheering", "Happy", "yay celebration"),
    TextItem("(ﾉ´ヮ`)ﾉ*: ･ﾟ", "Joyful wave", "Happy", "celebration"),
    TextItem("(≧▽≦)", "Big grin", "Happy", "laugh"),
    TextItem("(づ｡◕‿‿◕｡)づ", "Hug", "Love", "cuddle embrace"),
    TextItem("(っ´▽｀)っ", "Open arms", "Love", "hug embrace"),
    TextItem("(♡°▽°♡)", "In love", "Love", "heart adore"),
    TextItem("(｡♥‿♥｡)", "Heart eyes", "Love", "adoration"),
    TextItem("( ˘ ³˘)♥", "Kiss", "Love", "heart"),
    TextItem("(灬º‿º灬)♡", "Blushing heart", "Love", "shy"),
    TextItem("(╥﹏╥)", "Crying", "Sad", "tears upset"),
    TextItem("(ಥ_ಥ)", "Tearful", "Sad", "cry"),
    TextItem("(；ω；)", "Sad tears", "Sad", "cry"),
    TextItem("(｡•́︿•̀｡)", "Disappointed", "Sad", "upset"),
    TextItem("(つ﹏⊂)", "Hiding tears", "Sad", "cry"),
    TextItem("(╯°□°）╯︵ ┻━┻", "Table flip", "Angry", "rage frustrated"),
    TextItem("(ノಠ益ಠ)ノ彡┻━┻", "Angry table flip", "Angry", "rage"),
    TextItem("(ಠ_ಠ)", "Disapproval", "Angry", "annoyed glare"),
    TextItem("(¬_¬)", "Side eye", "Angry", "suspicious annoyed"),
    TextItem("(ง'̀-'́)ง", "Ready to fight", "Angry", "determined"),
    TextItem("(⊙_⊙)", "Wide eyes", "Surprised", "shocked wow"),
    TextItem("(☉_☉)", "Astonished", "Surprised", "shock"),
    TextItem("(°ロ°) !", "Gasp", "Surprised", "wow"),
    TextItem("(ﾉﾟ0ﾟ)ﾉ~", "Startled", "Surprised", "shock"),
    TextItem("¯\\_(ツ)_/¯", "Shrug", "Gestures", "dunno whatever"),
    TextItem("(☞ﾟヮﾟ)☞", "Finger guns", "Gestures", "point"),
    TextItem("(☝︎ ՞ਊ ՞)☝︎", "Hands up", "Gestures", "point"),
    TextItem("(￣ー￣)ゞ", "Salute", "Gestures", "respect"),
    TextItem("( •_•)>⌐■-■", "Putting on sunglasses", "Gestures", "cool"),
    TextItem("(⌐■_■)", "Cool sunglasses", "Gestures", "deal with it"),
    TextItem("(=^･ω･^=)", "Cat face", "Animals", "kitten"),
    TextItem("(=｀ω´=)", "Grumpy cat", "Animals", "kitten"),
    TextItem("ʕ•ᴥ•ʔ", "Bear", "Animals", "cute"),
    TextItem("ʕっ•ᴥ•ʔっ", "Bear hug", "Animals", "cuddle"),
    TextItem("(U・x・U)", "Dog face", "Animals", "puppy"),
    TextItem("(V●ᴥ●V)", "Puppy", "Animals", "dog"),
)

KAOMOJI_CATEGORIES = (
    "Classic ASCII",
    "Happy",
    "Greeting",
    "Acting cute",
    "Love",
    "Sad",
    "Angry",
    "Surprised",
    "Confused",
    "Gestures",
    "Animals",
    "Sleepy",
    "Celebration",
)

# Each line is one selectable expression. Group names and keywords keep the
# collection searchable without repeating metadata for every variant.
_KAOMOJI_GROUPS = (
    (
        "Classic ASCII",
        "Classic smile",
        "happy smile ascii",
        ":-)\n:)\n:-D\n:D\n;)\n;-)\n=)\n^_^\n^.^\n^^",
    ),
    ("Classic ASCII", "Classic wink", "wink playful ascii", ";D\n;P\n;-)\n^_~\n(^_~)"),
    ("Classic ASCII", "Classic sad", "sad frown ascii", ":-(\n:(\n:'(\nT_T\nT.T\n._.\n-_-"),
    ("Classic ASCII", "Classic surprise", "wow shock ascii", ":-O\n:o\nO_O\no_O\nO.o\n0_0"),
    (
        "Happy",
        "Happy face",
        "smile cheerful joy",
        "(＾◡＾)\n(＾ω＾)\n(◕‿◕)\n(◠‿◠)\n(⌒▽⌒)\n(≧◡≦)\n(⌒ω⌒)\n(￣▽￣)\n(＾ｖ＾)\n(❁´◡`❁)",
    ),
    (
        "Happy",
        "Laughing",
        "laugh giggle lol",
        "(＾▽＾)／\n(≧▽≦)ゞ\n(ﾉ≧∀≦)ﾉ\n(≧∀≦)\n( ´ ▽ ` )\n(๑˃ᴗ˂)ﻭ\n(๑>◡<๑)",
    ),
    (
        "Greeting",
        "Hello",
        "wave hi greeting",
        "(＾▽＾)ノ\n(・ω・)ノ\n(￣▽￣)ノ\n( ´ ▽ ` )ﾉ\nヾ(＾-＾)ノ\nヽ(・∀・)ﾉ\n(｡･ω･)ﾉﾞ\n(ノ^∇^)",
    ),
    (
        "Greeting",
        "Goodbye",
        "bye wave farewell",
        "( ^_^)/~~~\nヾ(＾∇＾)\n(￣ω￣)ノ\n( ´・ω・)ﾉ\n( ´ ▽ ` )ﾉﾞ",
    ),
    ("Greeting", "Bow", "thanks hello respectful", "m(_ _)m\n(_ _)\n(シ_ _)シ\n(人´∀｀)\n(｡-人-｡)"),
    (
        "Acting cute",
        "Cute face",
        "kawaii sweet playful",
        "(｡◕‿◕｡)\n(｡♥‿♥｡)\n(◕ᴗ◕✿)\n(✿◕‿◕)\n(ᵔᴥᵔ)\n(ღ˘⌣˘ღ)\n(๑˘︶˘๑)\n(｡･ω･｡)",
    ),
    (
        "Acting cute",
        "Blushing",
        "shy embarrassed blush",
        "(⁄ ⁄•⁄ω⁄•⁄ ⁄)\n(〃▽〃)\n(*/ω＼*)\n(〃￣ω￣〃)\n(๑•́ ₃ •̀๑)",
    ),
    ("Acting cute", "UwU", "uwu owo kawaii", "UwU\nuwu\nOwO\nowo\n(・`ω´・)\n(〃ω〃)"),
    (
        "Love",
        "Heart",
        "love affection heart",
        "(♡˙︶˙♡)\n(｡♥‿♥｡)\n(♥ω♥*)\n(ღ˘⌣˘ღ)\n(♡°▽°♡)\n(❤ω❤)\n(♥_♥)",
    ),
    (
        "Love",
        "Kiss",
        "love romance affection",
        "( ˘ ³˘)♥\n(づ￣ ³￣)づ\n(っ˘з(˘⌣˘ )\n(๑˘ ₃˘๑)\n(*＾3＾)",
    ),
    (
        "Love",
        "Hug",
        "embrace cuddle arms",
        "(づ￣ ³￣)づ\n(づ◡﹏◡)づ\n(っ´▽｀)っ♡\n(つ≧▽≦)つ\n(づ｡◕‿‿◕｡)づ♡",
    ),
    (
        "Sad",
        "Crying",
        "tears upset sad",
        "(Ｔ▽Ｔ)\n(╥_╥)\n(ಥ﹏ಥ)\n(｡•́︿•̀｡)\n(つ﹏⊂)\n(ノ_<。)\n(；へ：)\n(ಥ_ಥ)",
    ),
    (
        "Sad",
        "Disappointed",
        "frown unhappy",
        "(︶︹︺)\n(￣︿￣)\n( ´△｀)\n(◞‸◟)\n(；￣Д￣)\n(｡╯︵╰｡)",
    ),
    (
        "Angry",
        "Angry face",
        "rage mad furious",
        "(╬ಠ益ಠ)\n(ಠ益ಠ)\n(｀Д´)\n(＃`Д´)\n(งಠ_ಠ)ง\n(╬ Ò﹏Ó)\n(ノ｀Д´)ノ",
    ),
    (
        "Angry",
        "Table flip",
        "rage frustrated",
        "(╯°□°)╯︵ ┻━┻\n(ﾉಥ益ಥ）ﾉ ┻━┻\n(ノಠ益ಠ)ノ彡┻━┻\n┬─┬ノ( º _ ºノ)",
    ),
    (
        "Surprised",
        "Surprised face",
        "shock astonished wow",
        "(⊙o⊙)\n(☉_☉)\n(°o°)\n(゜ロ゜)\n(ﾟДﾟ)\n(⊙_☉)\n( ºΔº )\nΣ(°ロ°)",
    ),
    (
        "Confused",
        "Confused face",
        "puzzled unsure thinking",
        "(・・?)\n(・_・ヾ\n(￣～￣;)\n(•ิ_•ิ)?\n(・・；)\n(⊙_◎)\n( ´･ω･)？",
    ),
    ("Confused", "Side eye", "doubt skeptical suspicious", "(¬_¬)\n(눈_눈)\n(￢_￢)\n(→_→)\n(←_←)"),
    (
        "Confused",
        "Lenny face",
        "smug mischievous playful",
        "( ͡° ͜ʖ ͡°)\n( ͡ᵔ ͜ʖ ͡ᵔ )\n( ͠° ͟ʖ ͡°)\n( ͡~ ͜ʖ ͡°)\n( ͡° ͜ʖ ͡°)つ",
    ),
    (
        "Gestures",
        "Shrug",
        "whatever dunno shoulders",
        "¯\\_(ツ)_/¯\n┐(￣ヘ￣)┌\n┐(´д｀)┌\n╮(╯_╰)╭\n¯\\(°_o)/¯",
    ),
    ("Gestures", "Cheer", "strong fight go", "(ง •̀_•́)ง\n(ง'̀-'́)ง\nᕦ(ò_óˇ)ᕤ\nᕙ(⇀‸↼‶)ᕗ\n(๑•̀ㅂ•́)و✧"),
    ("Gestures", "Point", "finger guns gesture", "(☞ﾟヮﾟ)☞\n☜(ﾟヮﾟ☜)\n(☞ ͡° ͜ʖ ͡°)☞\n(☝︎ ՞ਊ ՞)☝︎\n(☞ﾟ∀ﾟ)☞"),
    (
        "Gestures",
        "Dance",
        "groove celebration",
        "♪(┌・。・)┌\n└(・。・└)♪\n(〜￣▽￣)〜\n〜(￣▽￣〜)\n(ﾉ≧∀≦)ﾉ",
    ),
    (
        "Animals",
        "Cat",
        "kitty kitten feline",
        "(=^･ω･^=)\n(=^ェ^=)\n(=｀ェ´=)\n(=①ω①=)\n(ฅ^•ﻌ•^ฅ)\n(=ↀωↀ=)",
    ),
    ("Animals", "Bear", "cub teddy", "ʕ•ᴥ•ʔ\nʕっ•ᴥ•ʔっ\nʕ´•ᴥ•`ʔ\nʕ￫ᴥ￩ʔ\nʕ·ᴥ·ʔ"),
    ("Animals", "Dog", "puppy canine", "(U・x・U)\n(U＾ω＾)\n(V●ᴥ●V)\n∪･ω･∪\nU・ᴥ・U"),
    (
        "Animals",
        "Other animal",
        "rabbit bunny bird",
        "／(=･ x ･=)＼\n(・×・)\n(・8・)\n(◉Θ◉)\n(•ө•)",
    ),
    (
        "Sleepy",
        "Sleepy face",
        "tired yawn sleep",
        "(－_－) zzZ\n(￣o￣) zzZZzzZZ\n( _ _ ).｡o○\n(∪｡∪)｡｡｡zzZ\n(˘ω˘)",
    ),
    (
        "Celebration",
        "Celebrate",
        "party sparkle excited",
        "ヽ(＾Д＾)ﾉ\n(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧\n＼(＾▽＾)／\n٩(◕‿◕｡)۶\n(っ˘▽˘)っ♬",
    ),
)


def _expand_kaomoji() -> tuple[TextItem, ...]:
    seen = {item.value for item in KAOMOJI}
    extras = []
    for category, name, keywords, lines in _KAOMOJI_GROUPS:
        for value in lines.splitlines():
            if value not in seen:
                seen.add(value)
                extras.append(TextItem(value, name, category, keywords))
    return (*KAOMOJI, *extras)


KAOMOJI = _expand_kaomoji()


SYMBOL_GROUPS = (
    ("Arrows", "← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ↩ ↪ ↶ ↷ ⇐ ⇒ ⇑ ⇓ ⇔ ➜ ➤ ⟵ ⟶ ⟷"),
    ("Math", "± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∝ ∈ ∉ ∩ ∪ ⊂ ⊃ ⊆ ⊇ ∀ ∃ ∅ ∴ ∵ ∠ ⊥ ∥ ⋅ ∘"),
    ("Currency", "$ € £ ¥ ₹ ₩ ₽ ₿ ¢ ₫ ₺ ₴ ₦ ₱ ₲ ₭"),
    ("Punctuation", "… • ‣ ‧ ‰ ′ ″ ‽ ¿ ¡ « » ‹ › ‘ ’ “ ” — – ‑ § ¶ ※ † ‡"),
    ("Shapes", "■ □ ▪ ▫ ▲ △ ▼ ▽ ◆ ◇ ● ○ ◉ ◎ ★ ☆ ♠ ♣ ♥ ♦ ✓ ✔ ✕ ✖ ☑ ☒"),
    ("Music", "♪ ♫ ♬ ♩ ♭ ♮ ♯ 𝄞"),
    ("Legal", "© ® ™ ℠ № ℗ ℮"),
    ("Units", "° ℃ ℉ µ Ω Å Å ² ³ ½ ¼ ¾"),
    ("Greek", "α β γ δ ε θ λ μ π σ φ ψ ω Α Β Γ Δ Θ Λ Π Σ Φ Ω"),
)

SYMBOL_RANGES = (
    ("Arrows", ((0x2190, 0x21FF), (0x27F0, 0x27FF), (0x2900, 0x297F))),
    ("Math", ((0x2200, 0x22FF), (0x2A00, 0x2AFF))),
    ("Currency", ((0x20A0, 0x20CF),)),
    ("Punctuation", ((0x2000, 0x206F), (0x2E00, 0x2E7F))),
    ("Shapes", ((0x25A0, 0x25FF),)),
    ("Dingbats", ((0x2700, 0x27BF),)),
    ("Box Drawing", ((0x2500, 0x257F), (0x2580, 0x259F))),
    ("Numbers", ((0x2070, 0x209F), (0x2150, 0x218F), (0x2460, 0x24FF))),
    ("Latin", ((0x00C0, 0x024F), (0x1E00, 0x1EFF))),
    ("Greek", ((0x0370, 0x03FF), (0x1F00, 0x1FFF))),
    ("Technical", ((0x2100, 0x214F), (0x2300, 0x23FF))),
    ("Music", ((0x1D100, 0x1D1FF),)),
)

SYMBOL_ALIASES = {
    "©": "copyright copy",
    "®": "registered trademark",
    "™": "trademark brand",
    "→": "right arrow next forward",
    "←": "left arrow back previous",
    "↑": "up arrow",
    "↓": "down arrow",
    "∞": "infinity forever",
    "✓": "check tick done",
    "✔": "check tick done",
    "×": "multiply multiplication",
    "÷": "divide division",
    "π": "pi math",
    "€": "euro money",
    "₹": "rupee money india",
}


def _symbol_item(symbol: str, category: str) -> TextItem:
    return TextItem(
        value=symbol,
        name=unicodedata.name(symbol, symbol).replace("-", " ").title(),
        category=category,
        keywords=SYMBOL_ALIASES.get(symbol, ""),
    )


def _symbols() -> tuple[TextItem, ...]:
    seen = set()
    items = []
    for category, values in SYMBOL_GROUPS:
        for symbol in values.split():
            if symbol not in seen:
                seen.add(symbol)
                items.append(_symbol_item(symbol, category))
    for category, ranges in SYMBOL_RANGES:
        for first, last in ranges:
            for codepoint in range(first, last + 1):
                symbol = chr(codepoint)
                # Invisible format characters and combining marks are not useful as
                # standalone grid items.
                if unicodedata.category(symbol)[0] not in "LNSP" or symbol in seen:
                    continue
                seen.add(symbol)
                items.append(_symbol_item(symbol, category))
    return tuple(items)


SYMBOLS = _symbols()
