/**
 * Generate fancy random workspace names like GitHub repo suggestions.
 * Format: adjective-noun (e.g. "cosmic-penguin", "flying-cutlet")
 */

const ADJECTIVES = [
  'amber', 'blazing', 'calm', 'cosmic', 'crimson', 'crystal', 'dark',
  'dazzling', 'dreamy', 'dusty', 'elegant', 'emerald', 'epic', 'fading',
  'fierce', 'flying', 'frozen', 'gentle', 'gilded', 'glowing', 'golden',
  'graceful', 'hidden', 'hollow', 'hushed', 'icy', 'ivory', 'jade',
  'jolly', 'keen', 'lazy', 'limber', 'lively', 'lunar', 'magic',
  'marble', 'mellow', 'misty', 'molten', 'moonlit', 'mossy', 'neon',
  'nimble', 'noble', 'obsidian', 'onyx', 'pale', 'phantom', 'plucky',
  'polar', 'polished', 'quiet', 'rapid', 'raspy', 'regal', 'rosy',
  'royal', 'rustic', 'sable', 'salty', 'scarlet', 'serene', 'shadow',
  'shiny', 'silent', 'silver', 'sleek', 'smoky', 'snowy', 'solar',
  'spicy', 'starlit', 'steady', 'stormy', 'sturdy', 'subtle', 'sunny',
  'swift', 'tawny', 'tender', 'thorny', 'tidal', 'timber', 'topaz',
  'twilight', 'velvet', 'vivid', 'wandering', 'warm', 'wild', 'windy',
  'wistful', 'witty', 'zany', 'zesty',
]

const NOUNS = [
  'anvil', 'arrow', 'atlas', 'aurora', 'badger', 'beacon', 'birch',
  'bison', 'bolt', 'breeze', 'brook', 'canvas', 'canyon', 'cedar',
  'cipher', 'cliff', 'comet', 'coral', 'crane', 'creek', 'crest',
  'cutlet', 'dawn', 'delta', 'dingo', 'drift', 'dusk', 'eagle',
  'echo', 'ember', 'falcon', 'fern', 'finch', 'fjord', 'flame',
  'flint', 'forge', 'frost', 'gale', 'gazelle', 'glacier', 'grove',
  'harbor', 'hawk', 'heron', 'horizon', 'husky', 'iris', 'island',
  'jasper', 'kite', 'lagoon', 'lark', 'ledge', 'lynx', 'maple',
  'marsh', 'meadow', 'meteor', 'mist', 'moose', 'nebula', 'nova',
  'oasis', 'orchid', 'osprey', 'otter', 'panda', 'peak', 'pearl',
  'pebble', 'penguin', 'phoenix', 'pine', 'pixel', 'plume', 'prism',
  'quartz', 'raven', 'reef', 'ridge', 'ripple', 'robin', 'sage',
  'salmon', 'scroll', 'sketch', 'slate', 'spark', 'spruce', 'storm',
  'summit', 'swift', 'thistle', 'thorn', 'tide', 'tiger', 'torch',
  'trail', 'tulip', 'vertex', 'violet', 'vortex', 'willow', 'wolf',
  'wren', 'zenith',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateWorkspaceName() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
}
