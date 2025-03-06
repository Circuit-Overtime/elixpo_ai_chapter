function generateImage() {
    // console.log("generate button has been clicked");
    // console.log(selectedText);
    document.getElementById("loader").style.opacity = "1";
    pimpPrompt(selectedText);
    document.getElementById("generateImage").style.opacity = "0";
    document.getElementById("generateImage").style.pointerEvents = "none";
}

async function pimpPrompt(text) 
{   
    let height = 1024;
    let width = 1024;
    let seed = Math.floor(Math.random() * 1000000);
    type("Trying to imagine something better.... what can I do?");
    var inst = "You are a prompt stylist specialized in enhancing user-provided inputs for AI-generated art. Your task is to refine and enrich the input text, making it more vivid, detailed, and optimized for an AI art generator. Ensure the output is a single, well-structured sentence without markdown formatting."
                const url = `https://txtelixpo.vercel.app/t/ ${inst} ${encodeURIComponent(text)} in 20 words`;
                try {
                    const response = await fetch(url, { method: "GET" });
                    if (!response.ok) throw new Error("Failed to fetch chain-of-thought");
                    let pimpText = await response.text();
                    const unwanted = `\n\n`;
                    pimpText = pimpText.replace(unwanted, "").trim();
                    // console.log(pimpText);
                    type(pimpText);
                    // console.log("selected aspect ratio = ", selectedAspectRatio);
                    if(selectedAspectRatio == "1:1")
                    {
                        height = 1024;
                        width = 1024;
                    }
                    else if(selectedAspectRatio == "4:3")
                    {
                        height = 1536;
                        width = 768;
                    }
                    else if(selectedAspectRatio == "16:9")
                    {
                        height = 1024;
                        width = 576;
                    }
                    else if(selectedAspectRatio == "9:16")
                    {
                        height = 576;
                        width = 1024;
                    }
                    
                    createImage(pimpText, height, width, seed);
            } 
            catch(e)
            {
                // console.log("Error occured", e);
                type("Well, Falling back to the original sequel of text!");
                let height = 1024;
                let width = 1024;
                let seed = Math.floor(Math.random() * 1000000);
                createImage(text, height, width, seed);
            }

}


function getSuffix() {
    const suffixes = {
        "Chromatic": "in a chromatic style with vibrant, shifting colors and gradients",
        "Anime": "in the style of anime, with detailed character designs and dynamic poses",
        "Landscape": "depicting a breathtaking landscape with natural scenery and serene views",
        "Wpap": "in the WPAP style with geometric shapes and vibrant pop-art colors",
        "Pixel": "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics",
        "Normal": "in a realistic and natural style with minimal artistic exaggeration",
    };
    return suffixes[selectedTheme] || "in a realistic and natural style";
}


async function createImage(prompt, h, w, s) 
{
    let suffixPrompt = "";
    let customInst = document.getElementById("promptInstruction").value.trim();
    try {
    if(customInst)
    {
        suffixPrompt = customInst;
    }
    else 
    {
        suffixPrompt = getSuffix();
    }
    const fullPrompt = `${prompt} -- rendered in vibrant, whimsical storybook style with warm colors and playful details ${suffixPrompt}`;
    type(`Trying to generate an image with the specs ${fullPrompt}`);
    
        const url = `https://imgelixpo.vercel.app/c/${encodeURIComponent(fullPrompt)}&height=${h}&width=${w}$seed=${s}`;
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) throw new Error(`Failed to fetch image ${idx + 1}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        document.getElementById("picContainer").style.backgroundImage = `url('${objectUrl}')`;
        document.getElementById("picContainer").style.backgroundSize = "cover";
        document.getElementById("loader").style.opacity = "0";
        document.getElementById("downloadBtn").style.opacity = "1";
        document.getElementById("downloadBtn").style.pointerEvents = "all";
        type("Well, here's the image you had requesteed for! You can download it now from the green button, Thank you for choosing Elixpo.");
    } catch (error) {
        // console.error(`Error fetching image`, error);
        type("There was an error generating the picture, please try once again, selecting the same text")
        setTimeout(() => {
            node.remove();
        }, 5000)
    }
}




function downloadImage()
{
    const picContainer = document.getElementById("picContainer");
    const backgroundImage = picContainer.style.backgroundImage;
    const imageUrl = backgroundImage.slice(5, -2);

    fetch(imageUrl)
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Elipo_Generated";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        // .catch(error => console.error("Error downloading the image", error));
}