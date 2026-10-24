// Emoji shortcode map for the `:name:` syntax in comments (GitHub/Slack style).
// Keep names lowercase; first key for an emoji is treated as its canonical name.
export const EMOJI_SHORTCODES = {
  // Smileys
  grinning: '😀', smile: '😄', smiley: '😃', grin: '😁', laughing: '😆', satisfied: '😆',
  sweat_smile: '😅', rofl: '🤣', joy: '😂', slightly_smiling_face: '🙂', upside_down_face: '🙃',
  wink: '😉', blush: '😊', innocent: '😇', smiling_face_with_three_hearts: '🥰', heart_eyes: '😍',
  star_struck: '🤩', kissing_heart: '😘', yum: '😋', stuck_out_tongue: '😛',
  stuck_out_tongue_winking_eye: '😜', zany_face: '🤪', money_mouth_face: '🤑', hugs: '🤗',
  thinking: '🤔', zipper_mouth_face: '🤐', neutral_face: '😐', expressionless: '😑',
  no_mouth: '😶', smirk: '😏', unamused: '😒', roll_eyes: '🙄', grimacing: '😬',
  relieved: '😌', pensive: '😔', sleepy: '😪', sleeping: '😴', mask: '😷',
  face_with_thermometer: '🤒', nauseated_face: '🤢', vomiting: '🤮', hot_face: '🥵',
  cold_face: '🥶', woozy_face: '🥴', dizzy_face: '😵', exploding_head: '🤯', mind_blown: '🤯',
  cowboy_hat_face: '🤠', partying_face: '🥳', sunglasses: '😎', nerd_face: '🤓',
  confused: '😕', worried: '😟', slightly_frowning_face: '🙁', open_mouth: '😮',
  hushed: '😯', astonished: '😲', flushed: '😳', pleading_face: '🥺', frowning: '😦',
  anguished: '😧', fearful: '😨', cold_sweat: '😰', cry: '😢', sob: '😭', scream: '😱',
  confounded: '😖', disappointed: '😞', sweat: '😓', weary: '😩', tired_face: '😫',
  yawning_face: '🥱', triumph: '😤', rage: '😡', angry: '😠', cursing_face: '🤬',
  smiling_imp: '😈', imp: '👿', skull: '💀', poop: '💩', hankey: '💩', clown_face: '🤡',
  ghost: '👻', alien: '👽', space_invader: '👾', robot: '🤖',
  // Hands & people
  wave: '👋', raised_hand: '✋', vulcan_salute: '🖖', ok_hand: '👌', pinching_hand: '🤏',
  v: '✌️', victory: '✌️', crossed_fingers: '🤞', love_you_gesture: '🤟', metal: '🤘',
  call_me_hand: '🤙', point_left: '👈', point_right: '👉', point_up_2: '👆', point_down: '👇',
  middle_finger: '🖕', fu: '🖕', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎',
  fist: '✊', facepunch: '👊', punch: '👊', fist_left: '🤛', fist_right: '🤜', clap: '👏',
  raised_hands: '🙌', open_hands: '👐', handshake: '🤝', pray: '🙏', muscle: '💪',
  // Hearts & symbols
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙',
  purple_heart: '💜', black_heart: '🖤', white_heart: '🤍', brown_heart: '🤎',
  broken_heart: '💔', heart_on_fire: '❤️‍🔥', two_hearts: '💕', sparkling_heart: '💖',
  cupid: '💘', heartbeat: '💓', heartpulse: '💗', revolving_hearts: '💞',
  hundred: '💯', '100': '💯', anger: '💢', boom: '💥', collision: '💥', dizzy: '💫',
  sweat_drops: '💦', dash: '💨', fire: '🔥', star: '⭐', star2: '🌟', sparkles: '✨',
  zap: '⚡', bulb: '💡', // ideas/energy
  // Celebration & objects
  tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁', trophy: '🏆', medal: '🏅',
  '1st_place_medal': '🥇', '2nd_place_medal': '🥈', '3rd_place_medal': '🥉',
  dart: '🎯', rocket: '🚀', crown: '👑', gem: '💎', moneybag: '💰', dollar: '💵',
  // Marks
  white_check_mark: '✅', heavy_check_mark: '✔️', check: '✔️', x: '❌', negative_squared_cross_mark: '❎',
  warning: '⚠️', no_entry: '⛔', no_entry_sign: '🚫', question: '❓', grey_question: '❔',
  exclamation: '❗', bangbang: '‼️', stop_sign: '🛑', recycle: '♻️',
  // Tech & work
  computer: '💻', desktop_computer: '🖥️', keyboard: '⌨️', iphone: '📱', phone: '☎️',
  email: '📧', envelope: '✉️', memo: '📝', pencil: '📝', book: '📖', books: '📚',
  bookmark: '🔖', paperclip: '📎', lock: '🔒', unlock: '🔓', key: '🔑', mag: '🔍',
  hourglass: '⌛', alarm_clock: '⏰', calendar: '📅', chart_with_upwards_trend: '📈',
  bug: '🐛', wrench: '🔧', hammer: '🔨', gear: '⚙️', link: '🔗',
  // Speech
  speech_balloon: '💬', thought_balloon: '💭', eyes: '👀', wave_goodbye: '👋',
  // Nature
  sun: '☀️', sunny: '☀️', moon: '🌙', crescent_moon: '🌙', rainbow: '🌈', cloud: '☁️',
  snowflake: '❄️', ocean: '🌊', droplet: '💧', earth_africa: '🌍', earth_americas: '🌎',
  cherry_blossom: '🌸', rose: '🌹', sunflower: '🌻', hibiscus: '🌺', tulip: '🌷',
  seedling: '🌱', evergreen_tree: '🌲', deciduous_tree: '🌳', palm_tree: '🌴',
  cactus: '🌵', four_leaf_clover: '🍀', leaves: '🍃', maple_leaf: '🍁',
  // Animals
  dog: '🐶', cat: '🐱', mouse: '🐭', hamster: '🐹', rabbit: '🐰', fox_face: '🦊',
  bear: '🐻', panda_face: '🐼', koala: '🐨', tiger: '🐯', lion: '🦁', cow: '🐮',
  pig: '🐷', frog: '🐸', monkey_face: '🐵', chicken: '🐔', penguin: '🐧', bird: '🐦',
  eagle: '🦅', owl: '🦉', unicorn: '🦄', bee: '🐝', butterfly: '🦋', snail: '🐌',
  // Food & drink
  apple: '🍎', green_apple: '🍏', banana: '🍌', watermelon: '🍉', grapes: '🍇',
  strawberry: '🍓', peach: '🍑', pineapple: '🍍', avocado: '🥑', tomato: '🍅',
  corn: '🌽', bread: '🍞', cheese: '🧀', egg: '🥚', bacon: '🥓', hamburger: '🍔',
  fries: '🍟', pizza: '🍕', hotdog: '🌭', taco: '🌮', burrito: '🌯', popcorn: '🍿',
  doughnut: '🍩', cookie: '🍪', birthday: '🎂', cake: '🍰', cupcake: '🧁',
  chocolate_bar: '🍫', candy: '🍬', lollipop: '🍭', coffee: '☕', tea: '🍵',
  beer: '🍺', beers: '🍻', wine_glass: '🍷', cocktail: '🍸', tropical_drink: '🍹',
  champagne: '🍾', clinking_glasses: '🥂',
  // Activities
  soccer: '⚽', basketball: '🏀', football: '🏈', baseball: '⚾', tennis: '🎾',
  volleyball: '🏐', '8ball': '🎱', ping_pong: '🏓', badminton: '🏸', goal_net: '🥅',
  golf: '⛳', video_game: '🎮', game_die: '🎲', musical_note: '🎵', notes: '🎶',
  microphone: '🎤', headphones: '🎧', guitar: '🎸', art: '🎨', clapper: '🎬',
};

// Search shortcodes by a partial query. Returns [{ code, emoji }] ordered so that
// prefix matches come first. `limit` caps the result count.
export function searchEmojiShortcodes(query, limit = 8) {
  const q = (query || '').toLowerCase();
  if (!q) return [];
  const prefix = [];
  const contains = [];
  for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
    if (code.startsWith(q)) prefix.push({ code, emoji });
    else if (code.includes(q)) contains.push({ code, emoji });
  }
  return [...prefix, ...contains].slice(0, limit);
}

// Exact shortcode lookup for `:name:` auto-conversion. Returns the emoji or null.
export function lookupEmojiShortcode(name) {
  return EMOJI_SHORTCODES[(name || '').toLowerCase()] || null;
}
