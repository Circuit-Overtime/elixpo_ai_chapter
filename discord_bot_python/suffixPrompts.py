def get_suffix_prompt(theme):
  suffixes = {
      "fantasy": "in a magical fantasy setting, with mythical creatures and surreal landscapes",
      "halloween": "with spooky Halloween-themed elements, pumpkins, and eerie shadows",
      "structure": "in the style of monumental architecture, statues, or structural art",
      "crayon": "in the style of colorful crayon art with vibrant, childlike strokes",
      "space": "in a vast, cosmic space setting with stars, planets and nebulae",
      "chromatic": "in a chromatic style with vibrant, shifting colors and gradients",
      "cyberpunk": "in a futuristic cyberpunk setting with neon lights and dystopian vibes",
      "anime": "in the style of anime, with detailed character designs and dynamic poses",
      "landscape": "depicting a breathtaking landscape with natural scenery and serene views",
      "samurai": "featuring a traditional samurai theme with warriors and ancient Japan",
      "wpap": "in the WPAP style with geometric shapes and vibrant pop-art colors",
      "vintage": "in a vintage, old-fashioned style with sepia tones and retro aesthetics",
      "pixel": "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics",
      "normal": "realistic and natural style",
      "synthwave": "in a retro-futuristic synthwave style with neon colors and 80s vibes",
  }
  return suffixes.get(theme, "artistic style")