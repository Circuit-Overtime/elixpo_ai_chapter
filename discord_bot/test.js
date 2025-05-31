    import fetch from 'node-fetch';
    import fs from 'fs';
    import readline from 'readline';

    const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
    });

    function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
    }

    function generateImageURL(promptText, imageUrl = null) {
    const baseURL = "https://image.pollinations.ai/prompt/";
    const prompt = encodeURIComponent(promptText.trim() || "");
    const queryString = `model=gptimage&token=mirexa&private=true&nologo=true`;

    let fullURL = `${baseURL}${prompt}?${queryString}`;
    if (imageUrl) {
        fullURL += `&image=${encodeURIComponent(imageUrl), encodeURIComponent(imageUrl)}`;
    }

    return fullURL;
    }

    async function getImageFromPrompt() {
    try {
        const userInput = await ask("Enter prompt (you can include image URL): ");
        const urlMatch = userInput.match(/https?:\/\/[^\s]+/);
        const imageUrl = urlMatch ? urlMatch[0] : null;
        const promptText = userInput.replace(imageUrl, "").trim();

        const imageURL = generateImageURL(promptText, imageUrl);
        console.log("🧠 Generated URL:", imageURL);

        const response = await fetch(imageURL);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const buffer = await response.buffer();
        fs.writeFileSync('output.jpg', buffer);
        console.log("✅ Image saved as output.jpg");

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        rl.close();
    }
    }

    getImageFromPrompt();
