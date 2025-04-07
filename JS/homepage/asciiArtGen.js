function weightedRandomChoice(weightedPrompts) {
    let totalWeight = weightedPrompts.reduce((sum, item) => sum + item.weight, 0);
    let randomValue = Math.random() * totalWeight;

    for (let item of weightedPrompts) {
        if (randomValue < item.weight) {
            return item.prompt;
        }
        randomValue -= item.weight;
    }
}

const fallbacks = `
    ---------------------------------------------------
|                     /        \\                         |
|                    |   O  O   |                        |
|                    |    \\/     |                       |
|                    |   ------  |                        |
|                     \\________/                        |
|                                                        |
|                  W A I T I N G...                      |
----------------------------------------------------------

`;

displayAsciiArt(fallbacks);


async function generateAsciiArt() {
      const weightedPrompts = [
        { prompt: "Generate a pixelated skull with detailed shading.", weight: 7 },
        { prompt: "Create a smiley face with a wide, toothy grin.", weight: 6 },
        { prompt: "Design a pixelated heart symbol with intricate patterns.", weight: 7 },
        { prompt: "Render a ghost figure with flowing, wispy edges.", weight: 6 },
        { prompt: "Illustrate an alien head with multiple eyes and antennae.", weight: 5 },
        { prompt: "Draw a pixelated robot with articulated limbs.", weight: 5 },
        { prompt: "Render a realistic cat face with whiskers and fur detail.", weight: 6 },
         { prompt: "Create a dog face with droopy ears and a playful expression.", weight: 6 },
        { prompt: "Illustrate a pumpkin with a detailed, spooky carved face.", weight: 5 },
        { prompt: "Generate a fish with scales and fins in a watery environment.", weight: 4 },
        { prompt: "Design a pixelated thunderbolt symbol with jagged edges.", weight: 5 },
        { prompt: "Draw a clock with roman numerals and detailed hands.", weight: 4 },
        { prompt: "Create a spaceship with thrusters and portholes.", weight: 5 },
        { prompt: "Illustrate a dragon face with scales and prominent horns.", weight: 5 },
        { prompt: "Generate a wizard hat with star and moon symbols.", weight: 4 },
        { prompt: "Depict an owl with large, expressive eyes and feathery details.", weight: 6 },
       { prompt: "Create a mountain range with snow-capped peaks.", weight: 4 },
        { prompt: "Illustrate a detailed moon with craters and shadows.", weight: 4 },
        { prompt: "Render a hand showing a peace sign with realistic finger proportions.", weight: 5 },
        { prompt: "Generate a bat with detailed wings and a small, cute face.", weight: 5 },
        { prompt: "Create a bright sun with intricate, radiating rays.", weight: 6 },
         { prompt: "Draw a tree with a dense canopy and detailed bark.", weight: 5 },
         { prompt: "Generate a star with a bright core and detailed points.", weight: 6 },
        { prompt: "Illustrate a vibrant flower with layered petals and a central pistil.", weight: 5 },
        { prompt: "Create a house with windows, a door, and a chimney, with depth.", weight: 5 },
        { prompt: "Draw a car with wheels, windows, and a defined body.", weight: 5 },
       { prompt: "Generate a butterfly with detailed wings and antennae.", weight: 5 },
       { prompt: "Illustrate a bird with realistic feathers and a defined beak.", weight: 5 },
       { prompt: "Create a snowflake with intricate, fractal-like details.", weight: 4 },
        { prompt: "Draw an anchor symbol with a detailed rope.", weight: 5 },
        { prompt: "Generate a musical note with a detailed staff and lines.", weight: 5 },
        { prompt: "Illustrate a key with detailed teeth and a key ring.", weight: 5 },
         { prompt: "Create a lock with a detailed keyhole and a shackle.", weight: 5 },
       { prompt: "Draw a crown with jewels and a detailed band.", weight: 5 },
        { prompt: "Generate a sword with a detailed hilt and sharp edge.", weight: 4 },
       { prompt: "Illustrate a shield with a detailed cross or emblem.", weight: 5 },
        { prompt: "Create a book with visible pages and a cover design.", weight: 4 },
       { prompt: "Draw a candle with a flame and dripping wax.", weight: 5 },
        { prompt: "Generate a diamond shape with detailed facets.", weight: 5 },
        { prompt: "Illustrate a lightning bolt with jagged, branching details.", weight: 5 },
       { prompt: "Create an arrow pointing right with feathers.", weight: 5 },
       { prompt: "Draw an arrow pointing left with feathers.", weight: 5 },
        { prompt: "Generate an arrow pointing up with feathers.", weight: 5 },
        { prompt: "Illustrate an arrow pointing down with feathers.", weight: 5 },
        { prompt: "Create a smiley face with sunglasses and a cool expression.", weight: 6 },
        { prompt: "Draw a frowning face with downward curved eyebrows.", weight: 5 },
       { prompt: "Generate a thumbs up symbol with a detailed hand.", weight: 6 },
        { prompt: "Illustrate a thumbs down symbol with a detailed hand.", weight: 5 },
        { prompt: "Create a detailed checkmark with rounded edges.", weight: 6 },
       { prompt: "Draw a clear cross mark with sharp angles.", weight: 5 },
       { prompt: "Generate a detailed yin-yang symbol with equal halves.", weight: 4 },
       { prompt: "Illustrate an infinity symbol with flowing curves.", weight: 5 },
        { prompt: "Create a peace symbol with a clean and balanced design.", weight: 6 },
        { prompt: "Generate a smiley face with a tongue out, and a playful expression.", weight: 6 },
        { prompt: "Illustrate a sad face with down turned mouth and tear.", weight: 5 },
       { prompt: "Create a neutral face with a straight mouth.", weight: 5 },
        { prompt: "Draw a happy face with a smiling mouth and bright eyes.", weight: 6 },
        { prompt: "Generate a surprised face with wide eyes and an open mouth.", weight: 5 },
       { prompt: "Illustrate a winking face with one eye closed and a subtle smile.", weight: 5 }
    ];


    const prompt = weightedRandomChoice(weightedPrompts);
    console.log(`Generating ASCII Art for: ${prompt}`);
    displayAsciiArt(fallbacks)

        const formatInstructions = `
    - Create an ASCII art representation based on the following prompt.
    - The art must fill a 20x8 grid (20 columns and 8 rows) completely without extra spaces.
    - Every row and column should be utilized meaningfully to enhance the representation.
    - Use clear and simple characters, avoiding complex or random symbols such as '@' or '?'.
    - Aim for a clean, easily recognizable, and expressive ASCII art output.
    - Ensure the art conveys the intended object or scene clearly and precisely within the defined grid.
    - Wrap the ASCII output in triple backticks (\`\`\`) so it can be extracted cleanly.

    Prompt: ${prompt}
    `;

    // Simulating API call
      try {
        
        // Mock API call (Replace this with an actual ASCII generator API)
        const response = await fetch("https://text.pollinations.ai/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "system", content: formatInstructions }],
                model: "openai",
                temperature: 0.7
            })
        });


        if (!response.ok) throw new Error("Failed to fetch ASCII art");

          const text = await response.text();
        const match = text.match(/```([\s\S]*?)```/);
          const asciiArt = match ? match[1].trim() : text;
        displayAsciiArt(asciiArt);
      } catch (error) {
        console.error("Error generating ASCII art:", error);
        displayAsciiArt("⚠️ Failed to generate ASCII art.");
    }
}

// Function to display ASCII art in the pre block
function displayAsciiArt(art) {
    document.getElementById("asciiArtZone").textContent = art;
}