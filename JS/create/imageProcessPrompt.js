let extractedBase64Data = null;




document.getElementById("inputImage").addEventListener("click", function () {
    document.getElementById("generateButton").classList.add("disabled");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async function (event) {
        await handleImageFile(event.target.files[0]);
    };

    input.oncancel = function (event) { // Add oncancel handler
        cancelImageReference();
    };

    input.click();
});


async function handleImageFile(file) {
    if (!file) return;

    if (file.size >= 10 * 1024 * 1024) {
        alert("Please select an image file smaller than 10 MB.");
        return;
    }

    console.log("File accepted:", file.name);

    const reader = new FileReader();

    reader.onprogress = function (event) {
        if (event.lengthComputable) {
            const percentLoaded = Math.round((event.loaded / event.total) * 100);
            console.log(`Loading: ${percentLoaded}%`);
        }
    };
    document.getElementById("cancelImageMode").classList.remove("hidden");
    document.getElementById("pimpPrompt").style.opacity = "0.5";
    document.getElementById("pimpPrompt").style.pointerEvents = "none";
    reader.onload = async function () {
        console.log("File loaded successfully.");
        imageDataUrl = reader.result;
        extractedBase64Data = imageDataUrl.split(",")[1]; // ✅ Save just the base64 part

        document.getElementById("promptBox").classList.add("image");
        document.getElementById("imageHolder").style.background = `url(${imageDataUrl})`;
        document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `url(${imageDataUrl})`);
        document.getElementById("imageHolder").style.backgroundSize = "cover";
        document.getElementById("imageHolder").style.backgroundPosition = "center center";
        document.getElementById("generateButton").classList.remove("disabled");
        isImageMode = true;
    };

    reader.readAsDataURL(file);
}

function cancelImageReference() {
    document.getElementById("promptBox").classList.remove("image");
    document.getElementById("imageHolder").style.background = "none";
    document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `none`);
    isImageMode = false;
    document.getElementById("generateButton").classList.remove("disabled"); // Re-enable if disabled
    document.getElementById("pimpPrompt").style.opacity = "1";
    document.getElementById("pimpPrompt").style.pointerEvents = "all";
    document.getElementById("imageHolder").style.opacity = "1";
    document.getElementById("imageHolder").style.pointerEvents = "all";
    document.querySelector(".imageProcessingAnimation ").classList.remove("imageMode");
    document.querySelector(".imageThemeContainer").classList.remove("imageMode");
    document.getElementById("cancelImageMode").classList.add("hidden");
    document.getElementById("promptTextInput").classList.remove("blur");
    document.getElementById("overlay").classList.remove("display");
    document.getElementById("overlay").innerHTML = "";
    document.getElementById("promptTextInput").value = "";
    dismissNotification();
    notify("Image reference removed.");
    if (imageController) {
        imageController.abort(); 
        imageController = null;
    }
    if (imageTimeout) {
        clearTimeout(imageTimeout); 
        imageTimeout = null;
    }
    return;
}

document.getElementById("cancelImageMode").addEventListener("click", () => {
    cancelImageReference();
});

// Function to generate prompt from image
async function generatePromptFromImage(imageUrl, userGivenprompt, controller) {
    console.log(userGivenprompt);
    const systemInstructions = `
You are an expert AI art prompt engineer.

Your task is to deeply analyze a visual image and generate a high-quality, natural language prompt that would allow an AI art generator to accurately reconstruct it. Additionally, **blend in** the user’s creative request to enrich the final output.

### Instructions:
1. Study the image carefully and describe:
   - Human presence (how many, gender, appearance, expressions, clothing, ethnicity if relevant)
   - **Age estimate** (child, teenager, adult, elderly)
   - Camera angle (close-up, wide shot, aerial, etc.)
   - Environment, setting, background elements
   - Mood/emotion (from posture, color palette, lighting)
   - Style (realism, anime, digital painting, 3D, etc.)
   - Lighting (natural, cinematic, neon, golden hour, etc.)
   - Composition (rule of thirds, depth, focus, framing)

2. **Preserve facial details**, accessories, gender identity, pose, and clothing if visible.

3. After analyzing the image, **thoughtfully incorporate the user's request**  into the prompt — altering or enriching the environment, character, or details accordingly, while still preserving the image’s core.
The user request is :- "${userGivenprompt}"
Study the image and blend in the user request to create a unique, high-quality prompt.
4. Merge all of the above into a single detailed AI prompt (50–100 words). Avoid lists or explanation.


`;

    try {
        const base64Image = imageUrl.split(",")[1];

        const response = await fetch("https://text.pollinations.ai/openai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai",
                messages: [
                    {
                        role: "system",
                        content: systemInstructions.trim()
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze this image and build a refined generation prompt."
                            },
                            {
                                type: "image_url",
                                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                            }
                        ]
                    }
                ],
                max_tokens: 250 // Slightly increased to fit the merged prompt better
            })
        });

        const data = await response.json();

        if (!response.ok) {
            notify("Failed to reach the prompt server.");
            console.error("HTTP error:", response.status, await response.text());
            return false;
        }
        
        // Check for valid structure
        if (data?.choices?.length > 0 && data.choices[0]?.message?.content) {
            return data.choices[0].message.content.trim();
        } else {
            notify("Invalid response format from server.");
            console.error("Unexpected API response structure:", data);
            return false;
        }
        

    } catch (error) {
        if (controller.signal.aborted) {
            console.log("Generation was aborted.");
            notify("Generation was aborted.");
            return false;
        }
        console.error("Error generating prompt:", error);
        notify("Generation failed.");
        return false;
    }
}




document.getElementById("promptTextInput").addEventListener("paste", async (event) => {
    const items = (event.clipboardData || event.clipboardData).items;
    let blob = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
            blob = items[i].getAsFile();
            break;
        }
    }

    if (blob !== null) {
        event.preventDefault(); // Prevent default paste behavior
        if (blob.size >= 10 * 1024 * 1024) {
            alert("Please paste an image smaller than 10 MB.");
            return;
        }
        await handleImageFile(blob);
    }
});


async function loadHardcodedImage() {
    const imageUrl = "../../CSS/IMAGES/normalBG.png";
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "hardcoded_image.jpg", { type: "image/jpeg" });
        await handleImageFile(file);
        const reader = new FileReader();

        reader.onload = async function () {
            extractedBase64Data = reader.result.split(",")[1];
        };

        reader.readAsDataURL(file);
    } catch (error) {
        console.error("Error loading hardcoded image:", error);
        notify("Failed to load hardcoded image.");
    }
}

// window.onload = loadHardcodedImage;

//image mode bug

