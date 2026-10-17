'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

const CATEGORIES = {
  People: {
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫',
      '🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪',
      '🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎',
      '🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰',
      '😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈',
      '👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  Hands: {
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟',
      '🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏',
      '🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🫂',
    ],
  },
  Nature: {
    icon: '🌿',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈',
      '🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋',
      '🌸','💐','🌷','🌹','🌺','🌻','🌼','🌱','🌲','🌳','🌴','🌵','🍀','🌿','🍃','🍂',
      '🍁','🌾','🌊','🌈','☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','❄️','🔥','💧','🌍',
    ],
  },
  Food: {
    icon: '🍔',
    emojis: [
      '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝',
      '🍅','🥑','🥦','🥬','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀',
      '🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🌮','🌯',
      '🫔','🥙','🧆','🥚','🍲','🥣','🥗','🍿','🧂','🍩','🍪','🎂','🍰','🧁','🍫','🍬',
      '☕','🍵','🧃','🥤','🍶','🍷','🍸','🍹','🍺','🧋',
    ],
  },
  Activities: {
    icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳',
      '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🏋️',
      '🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🎻','🎲',
      '♟️','🎯','🎳','🎮','🕹️','🧩',
    ],
  },
  Objects: {
    icon: '💡',
    emojis: [
      '⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📹','🎥','📞','☎️',
      '📺','📻','🎙️','⏱️','⏰','🕰️','⌛','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️',
      '💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧲','🔧','🔨','⚒️','🛠️','⛏️',
      '🪚','🔩','⚙️','🪤','🧱','⛓️','🧰','🧲','🔬','🔭','📡','💉','🩸','💊','🩹','🩺',
      '📝','✏️','🖊️','🖋️','📚','📖','🔖','📎','📐','📏','✂️','🗃️','🗄️','🗑️','🔒','🔓',
      '🔑','🗝️',
    ],
  },
  Symbols: {
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗',
      '💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎',
      '♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️',
      '☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵',
      '🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢',
      '♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆',
      '〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️',
      '🌀','💤','🏧','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚻','🚼',
      '🚾','🛜','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣',
      '▶️','⏸️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','🔀','🔁','🔂','◀️','🔼','🔽','⏫','⏬',
      '➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','🔄','↪️','↩️','⤴️','⤵️','#️⃣',
      '*️⃣','🔢','🔣','🔤','🔡','🔠','🔟','💲','©️','®️','™️',
    ],
  },
  Flags: {
    icon: '🏁',
    emojis: [
      '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️',
      '🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇧🇷','🇷🇺','🇦🇺','🇨🇦',
      '🇪🇸','🇮🇹','🇲🇽','🇦🇷','🇳🇬','🇿🇦','🇪🇬','🇹🇷','🇸🇦','🇦🇪','🇮🇩','🇹🇭',
    ],
  },
};

const CATEGORY_NAMES = Object.keys(CATEGORIES);

export default function EmojiPicker({ onSelect, onRemove, onClose }) {
  const [activeCategory, setActiveCategory] = useState('People');
  const [filter, setFilter] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build searchable emoji index once
  const emojiIndex = useMemo(() => {
    const index = [];
    const keywords = {
      '😀':'grin happy','😃':'smile happy','😄':'laugh happy','😁':'beam grin','😆':'laughing','😅':'sweat smile',
      '🤣':'rofl laugh','😂':'joy tears laugh','🙂':'slight smile','😉':'wink','😊':'blush','😇':'angel halo',
      '🥰':'hearts love','😍':'heart eyes love','🤩':'star struck','😘':'kiss','😎':'cool sunglasses',
      '🤔':'think hmm','😢':'cry sad','😭':'sob cry','😡':'angry mad','😱':'scream fear','🤯':'mind blown',
      '🥳':'party celebrate','😴':'sleep zzz','🤮':'vomit sick','🤒':'sick ill','💀':'skull dead','👻':'ghost',
      '👽':'alien','🤖':'robot','💩':'poop','🤡':'clown','👹':'ogre','👺':'goblin',
      '👋':'wave hello','👍':'thumbs up good','👎':'thumbs down bad','👏':'clap','🙏':'pray please thanks',
      '💪':'muscle strong','✊':'fist','👊':'punch','✌️':'peace victory','🤝':'handshake',
      '❤️':'red heart love','💔':'broken heart','💕':'hearts love','🖤':'black heart','💯':'hundred perfect',
      '🔥':'fire hot lit','⭐':'star','✨':'sparkle shine','💡':'light bulb idea','🎉':'party tada celebrate',
      '🎊':'confetti','🎁':'gift present','🏆':'trophy winner','🎯':'target bullseye','🚀':'rocket launch',
      '✅':'check done','❌':'cross no wrong','⚠️':'warning','💬':'speech bubble chat','📝':'memo write note',
      '📚':'books','💻':'laptop computer','📱':'phone mobile','🔒':'lock','🔑':'key',
      '☀️':'sun','🌙':'moon','🌈':'rainbow','🌊':'wave ocean','🌸':'cherry blossom flower',
      '🌹':'rose flower','🍀':'clover luck','🌿':'herb leaf','🌲':'tree','🔥':'fire flame',
      '🐶':'dog','🐱':'cat','🐼':'panda','🦊':'fox','🐻':'bear','🦁':'lion',
      '🍎':'apple','🍕':'pizza','🍔':'burger','☕':'coffee','🍺':'beer','🎂':'cake birthday',
      '⚽':'soccer football','🏀':'basketball','🎮':'game controller','🎵':'music note','🎨':'art palette',
    };
    for (const cat of CATEGORY_NAMES) {
      for (const em of CATEGORIES[cat].emojis) {
        const kw = keywords[em] || '';
        index.push({ emoji: em, search: `${cat.toLowerCase()} ${kw}` });
      }
    }
    return index;
  }, []);

  const filteredEmojis = useMemo(() => {
    if (!filter.trim()) return null;
    const q = filter.toLowerCase();
    return emojiIndex
      .filter(e => e.search.includes(q))
      .map(e => e.emoji)
      .slice(0, 80);
  }, [filter, emojiIndex]);

  const displayEmojis = filteredEmojis || CATEGORIES[activeCategory]?.emojis || [];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="relative z-50 mb-4 w-[352px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
          <span className="text-xs font-medium text-[var(--text-primary)] border-b-2 border-[var(--accent)] pb-1.5">Emoji</span>
          <button
            onClick={onRemove}
            className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-lg px-2.5 py-1.5 border border-[var(--border-hover)] focus-within:border-[var(--accent)] transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="flex-1 bg-transparent outline-none text-xs text-[var(--text-primary)] placeholder-[#555]"
            />
            {!filter && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[var(--text-faint)] bg-[var(--bg-elevated)] px-1 rounded">⌘</span>
                <span className="text-lg select-none">{CATEGORIES[activeCategory]?.icon}</span>
              </div>
            )}
          </div>
        </div>

        {/* Category label */}
        {!filter && (
          <div className="px-3 pb-1">
            <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">{activeCategory}</span>
          </div>
        )}

        {/* Emoji grid */}
        <div ref={scrollRef} className="px-2 pb-2 max-h-[220px] overflow-y-auto dark-scrollbar">
          <div className="grid grid-cols-9 gap-0">
            {displayEmojis.map((emoji, i) => (
              <button
                key={emoji + i}
                onClick={() => onSelect(emoji)}
                className="text-[22px] h-9 w-9 flex items-center justify-center rounded-md hover:bg-[var(--bg-elevated)] transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom category bar */}
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-[var(--border-default)] bg-[var(--bg-elevated)]">
          {CATEGORY_NAMES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setFilter(''); }}
              className={`text-lg h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                activeCategory === cat && !filter
                  ? 'bg-[var(--bg-elevated)]'
                  : 'hover:bg-[var(--bg-elevated)]/50 opacity-60 hover:opacity-100'
              }`}
              title={cat}
            >
              {CATEGORIES[cat].icon}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
