let generateURLS = [];
let enhanceMode = false;
let privateMode = false;
let isImageMode = false;
let selectedImageQuality = "SD";
let generationNumber = 1;
let imageTheme = "normal";
let ratio = "16:9";
let model = "flux";
let controller = null;
let imageTimeout = null;
let imageController = null;
let isMouseOverImageDisplay = false;
let extractedDetails = {};



async function uploadImageToUguu(file) {
    if (!file) {
        notify("No file provided for upload.", false);
        console.error("Upload Error: No file provided.");
        return null; // Indicate failure
    }


    notify("Processing Media, just a min", false);
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`https://imgelixpo.vercel.app/upload-to-uguu`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            // Attempt to read the response body, which might contain an error message from your backend
            const errorData = await res.json().catch(() => ({ error: `HTTP error: ${res.status} ${res.statusText}` }));
            const errorMessage = errorData.error || `Upload failed with status: ${res.status}`;
            console.error('Upload failed at backend endpoint:', errorMessage);
            notify(`Failed to process image!: ${errorMessage}`, false); // Notify user about the failure
            return null; // Indicate failure
        }

        // If the response status is OK, parse the JSON body
        const data = await res.json();
        console.log('Response from backend upload endpoint:', data);

        // Your backend returns { url: "..." } on success
        if (data && data.url) {
            notify("Image uploaded successfully!"); // Notify user about success
            console.log("Image uploaded via backend, Uguu URL:", data.url);
            return data.url; // Return the final Uguu URL received from your backend
        } else {
            // Handle cases where the backend returned 200 OK but the body was not as expected
            console.error('Upload succeeded according to status, but invalid response body from backend:', data);
            notify("Upload failed: Invalid response from server.", false);
            return null; // Indicate failure
        }
    } catch (e) {
        // Catch network errors (e.g., server is down) or errors during response processing (e.g., JSON parsing failed unexpectedly)
        console.error('Error during image upload process:', e);
        notify(`Failed to upload image: ${e.message || 'Network or server error'}`, false); // Notify user about the failure
        return null; // Indicate failure
    }
}
function manageTileNumbers() {
    // Only apply this logic for large screens (≥1024px)
    

    if (generationNumber == 1) {
        document.querySelector(".tile1").classList.remove("hidden");
        document.querySelector(".tile2").classList.add("hidden");
        document.querySelector(".tile3").classList.add("hidden");
        document.querySelector(".tile4").classList.add("hidden");
        if (window.innerWidth < 1024) return;
        document.querySelector(".tile1").style.cssText = `
            grid-column: span 6 / span 6;
            grid-row: span 5 / span 5;
        `;

        document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
            grid-template-columns: repeat(6, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 8px;
        `;
    }

    else if (generationNumber == 2) {
        document.querySelector(".tile1").classList.remove("hidden");
        document.querySelector(".tile2").classList.remove("hidden");
        document.querySelector(".tile3").classList.add("hidden");
        document.querySelector(".tile4").classList.add("hidden");
        if (window.innerWidth < 1024) return;
        document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
            grid-template-columns: repeat(6, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 8px;
        `;

        document.querySelector(".tile1").style.cssText = `
            grid-column: span 3 / span 3;
            grid-row: span 5 / span 5;
        `;
        document.querySelector(".tile2").style.cssText = `
            grid-column: span 3 / span 3;
            grid-row: span 5 / span 5;
            grid-column-start: 4;
        `;
    }

    else if (generationNumber == 3) {
        document.querySelector(".tile1").classList.remove("hidden");
        document.querySelector(".tile2").classList.remove("hidden");
        document.querySelector(".tile3").classList.remove("hidden");
        document.querySelector(".tile4").classList.add("hidden");
        if (window.innerWidth < 1024) return;
        document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
            grid-template-columns: repeat(6, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 8px;
        `;

        document.querySelector(".tile1").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 5 / span 5;
        `;
        document.querySelector(".tile2").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 5 / span 5;
            grid-column-start: 3;
        `;
        document.querySelector(".tile3").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 5 / span 5;
            grid-column-start: 5;
        `;
    }

    else if (generationNumber == 4) {
        document.querySelector(".tile1").classList.remove("hidden");
        document.querySelector(".tile2").classList.remove("hidden");
        document.querySelector(".tile3").classList.remove("hidden");
        document.querySelector(".tile4").classList.remove("hidden");
        if (window.innerWidth < 1024) return;
        document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
            grid-template-columns: repeat(8, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 8px;
        `;

        document.querySelector(".tile1").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 3 / span 3;
        `;
        document.querySelector(".tile2").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 3 / span 3;
            grid-column-start: 3;
            grid-row-start: 2;
        `;
        document.querySelector(".tile3").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 3 / span 3;
            grid-column-start: 5;
            grid-row-start: 2;
        `;
        document.querySelector(".tile4").style.cssText = `
            grid-column: span 2 / span 2;
            grid-row: span 3 / span 3;
            grid-column-start: 7;
            grid-row-start: 3;
        `;
    }
}


document.getElementById("generateButton").addEventListener("click", function () {
    const promptBox = document.getElementById("promptTextInput");
    const promptText = promptBox.value.trim();

    if (promptText === "") {
        notify("Wozaaa!! I see nothing, type some instructions");
        promptBox.focus();
        return;
    }

    // Improved flag extraction (non-greedy)
    const flagRegex = /--\w+(?:\s+[^-\s][^--]*)?/g;
    const flags = promptText.match(flagRegex) || [];

    const extractedDetails = {
        "Prompt": "",
        "Aspect Ratio": ratio,
        "Model": model,
        "Theme": imageTheme,
        "Definition": selectedImageQuality,
        "Enhance": enhanceMode,
        "imageMode": isImageMode,
        "Private": privateMode,
        "imageBatch": generationNumber
    };

    let usedPrompt = false;

    flags.forEach(flag => {
        const [key, ...value] = flag.trim().split(/\s+/);
        const cleanKey = key.replace("--", "").trim();
        const cleanValue = value.join(" ").trim();

        switch (cleanKey) {
            case "pr":
                extractedDetails["Prompt"] = cleanValue;
                usedPrompt = true;
                break;
            case "ar":
                extractedDetails["Aspect Ratio"] = cleanValue;
                break;
            case "md":
                extractedDetails["Model"] = cleanValue;
                break;
            case "th":
                extractedDetails["Theme"] = cleanValue;
                break;
            case "ld":
                extractedDetails["Definition"] = "LD";
                break;
            case "hd":
                extractedDetails["Definition"] = "HD";
                break;
            case "sd":
                extractedDetails["Definition"] = "SD";
                break;
            case "en":
                extractedDetails["Enhance"] = "Enabled";
                break;
            case "pv":
                extractedDetails["Private"] = "Enabled";
                break;
        }
    });

    // Remove all matched flags from the original input
    const textWithoutFlags = promptText.replace(flagRegex, "").trim();

    // Assign remaining text as prompt if no --pr was used
    if (!usedPrompt && textWithoutFlags) {
        extractedDetails["Prompt"] = textWithoutFlags;
    }

    if (!extractedDetails["Prompt"]) {
        notify("Oops! Couldn't find a prompt. Try again!");
        promptBox.focus();
        return;
    }

    console.log("Extracted Details:", extractedDetails);

    preparePromptInput(
        extractedDetails["imageBatch"],
        extractedDetails["Prompt"],
        extractedDetails["Aspect Ratio"],
        extractedDetails["Model"],
        extractedDetails["Definition"],
        extractedDetails["Theme"],
        extractedDetails["Enhance"],
        extractedDetails["Private"],
        extractedDetails["imageMode"],
        controller
    );
});


async function preparePromptInput(generationNumber, prompt, ratio, model, selectedImageQuality, imageTheme, enhanceMode, privateMode, imageMode) {
    manageTileNumbers();
    document.getElementById("generateButton").setAttribute("disabled", "true");
    controller = new AbortController();
    const { signal } = controller;

    const suffixPrompt = getSuffixPrompt(imageTheme);
    const aspectRatio = getAspectRatio(ratio);
    const imageSize = aspectRatio[selectedImageQuality];
    const [width, height] = imageSize.split("x");

    // Helper to handle prompt enhancement
    async function enhancePrompt(originalPrompt) {
        const pimpController = new AbortController();
        const timeoutId = setTimeout(() => pimpController.abort(), 60000);

        document.getElementById("promptTextInput").classList.add("blur");
        document.getElementById("generateButton").style.cssText = "opacity: 0.5; pointer-events: none;";
        document.getElementById("overlay").classList.add("display");
        notify("Enhancing your prompt...", true);

        let enhancedPrompt;
        const startTime = Date.now();

        try {
            enhancedPrompt = await promptEnhance(originalPrompt, pimpController);
        } catch (err) {
            if (err.name === "AbortError") {
                notify("Prompt enhancement took too long. Proceeding with original prompt.");
            } else {
                console.error("Enhancer Error:", err);
                notify("Enhancer crashed. Using original prompt.");
            }
            enhancedPrompt = originalPrompt;
        } finally {
            clearTimeout(timeoutId);
        }

        const elapsedTime = (Date.now() - startTime) / 1000;
        if (elapsedTime > 15 && elapsedTime <= 60) {
            notify("Taking longer than expected.");
        }

        return enhancedPrompt;
    }

    // Helper to update UI after prompt enhancement
    function finalizePromptUI(finalPrompt) {
        document.getElementById("promptTextInput").value = finalPrompt;
        document.getElementById("promptTextInput").classList.remove("blur");
        document.getElementById("overlay").classList.remove("display");
        document.getElementById("promptTextInput").focus();
        document.getElementById("overlay").innerHTML = "";
        dismissNotification();
    }

    // If image mode is enabled
    if (imageMode) {
        let finalPrompt = prompt;

        if (enhanceMode) {
            finalPrompt = await enhancePrompt(prompt);
            await new Promise(resolve => {
                typeEnhancedPrompt(finalPrompt, 0, resolve);
            });
            finalizePromptUI(finalPrompt);
        }

        const uploadedUrl = await window.showAndUploadImageIfNeeded();
        console.log("Uploaded URL:", uploadedUrl);

        if (uploadedUrl) {
            document.getElementById("imageHolder").setAttribute("data-uploaded-url", uploadedUrl);
            notify("Processing your image...", true);
            document.getElementById("overlay").classList.remove("display");
            scrollToImageGenerator();
            generateImage(generationNumber, finalPrompt, width, height, "gptimage", suffixPrompt, selectedImageQuality, enhanceMode, privateMode, imageMode, signal);
        } else {
            notify("Failed to upload image. Please try again.");
            document.getElementById("generateButton").removeAttribute("disabled");
        }

        return;
    }

    // If only enhance mode (no image mode)
    if (enhanceMode) {
        const enhancedPrompt = await enhancePrompt(prompt);

        await new Promise(resolve => {
            typeEnhancedPrompt(enhancedPrompt, 0, resolve);
        });

        finalizePromptUI(enhancedPrompt);

        setTimeout(() => {
            extractedDetails["Prompt"] = enhancedPrompt;
            scrollToImageGenerator();
            generateImage(generationNumber, enhancedPrompt, width, height, model, suffixPrompt, selectedImageQuality, enhanceMode, privateMode, imageMode, signal);
        }, 1000);

        return;
    }

    // Final fallback: basic generation
    const finalPrompt = document.getElementById("promptTextInput").value;
    scrollToImageGenerator();
    generateImage(generationNumber, finalPrompt, width, height, model, suffixPrompt, selectedImageQuality, enhanceMode, privateMode, imageMode, signal);
}


// Scroll utility
function scrollToImageGenerator() {
    hideSection("imageCustomization");
    hideSection("imageDisplay");
    showSection("imageGenerator");
    const imageGeneratorSection = document.getElementById("imageGenerator");
    const offsetTop = imageGeneratorSection.offsetTop - 60;
    const container = document.querySelector(".sectionContainer");
    container.scrollTo({ top: offsetTop, behavior: "smooth" });
  
}

// Abort button handler
document.getElementById("interruptButton").addEventListener("click", function () {
    if (controller) {
        controller.abort();
        controller = null;
        notify("Generation interrupted!");
        document.getElementById("interruptButton").classList.add("hidden");
        document.getElementById("generateButton").removeAttribute("disabled");
        resetAll(); // Cleanup visuals and state
    }
});

async function generateImage(generationNumber, prompt, width, height, model, suffixPrompt, selectedImageQuality, enhanceMode, privateMode, imageMode, signal) {
    document.getElementById("interruptButton").classList.remove("hidden");
    const promptText = `${prompt}`;
    let generateUrl;

    if (imageMode) {
        console.log("In image mode");
        const uploadedUrl = document.getElementById("imageHolder").getAttribute("data-uploaded-url");
        if (uploadedUrl) {
            model = "gptimage";
            generateUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=gptimage&nologo=true&token=xxxxxxxxxx&image=${encodeURIComponent(uploadedUrl)}`;
            notify("Remixing with your request!! Would take a minute or so, hang on buddy!");
        } else {
            notify("Image not found. Please upload a valid image.");
            return;
        }
    } else {
        generateUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=${width}&height=${height}&model=${model}&nologo=true&referrer=xxxxxxxx&token=xxxxxxx`;
        notify("Trying to paint the image!", true);
    }

    if (privateMode) {
        generateUrl += "&private=true";
    }

    const tilePromises = [];
    const generationTimes = [];

    for (let i = 1; i <= generationNumber; i++) {
        const tile = document.querySelector(`.tile${i}`);
        const loadingAnimation = tile.querySelector(".loadingAnimations");
        const downloadBtn = tile.querySelector(".inPictureControls > #downloadBtn");
        const copyBtn = tile.querySelector(".inPictureControls > #copyButton");

        tile.style.pointerEvents = "none";
        loadingAnimation.classList.remove("hidden");

        const tileSeed = Math.floor(Math.random() * 10000);
        let imageRequestUrl = `${generateUrl}&seed=${tileSeed}`;
        const tryGeneration = async (currentModel, watchdogTimeout = 60000) => {
            const controller = new AbortController();
            const watchdog = setTimeout(() => controller.abort(), watchdogTimeout);
            try {
                const response = await fetch(imageRequestUrl, { signal: controller.signal });
                clearTimeout(watchdog);
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.blob();
            } catch (error) {
                clearTimeout(watchdog);

                if (controller.signal.aborted && currentModel === "gptimage" && !imageMode) {
                    notify("gptimage model took too long. Switching to flux...");
                    const fallbackUrl = imageRequestUrl.replace("model=gptimage", "model=flux");
                    imageRequestUrl = fallbackUrl;
                    return tryGeneration("flux");
                }

                if ((error.message.includes("500") || error.message.includes("HTTP")) && currentModel !== "flux") {
                    notify("Opps my brush broke! Trying  again");
                    imageRequestUrl = imageRequestUrl.replace(`model=${currentModel}`, "model=flux");
                    return tryGeneration("flux");
                }

                throw error;
            }
        };

        const tilePromise = tryGeneration(model)
            .then(blob => {
                const endTime = performance.now();
                const generationTime = Math.round((endTime - performance.now()) / 1000);
                generationTimes.push(generationTime);

                const imageUrl = URL.createObjectURL(blob);
                tile.style.backgroundImage = `url(${imageUrl})`;
                tile.style.pointerEvents = "all";
                tile.setAttribute("data-time", generationTime);

                loadingAnimation.classList.add("hidden");
                downloadBtn.setAttribute("data-id", imageUrl);
                copyBtn.setAttribute("data-id", prompt);

                tile.addEventListener("click", () => {
                    expandImage(imageUrl, promptText, tileSeed, height, width, model, ratio, generationTime);
                });
            })
            .catch(error => {
                loadingAnimation.classList.add("hidden");
                if (error.name === "AbortError") {
                    notify("Generation aborted!");
                    console.warn(`Fetch aborted for tile${i}`);
                } else {
                    console.error(`Error generating image for tile${i}:`, error);
                    notify("Failed to generate image. Please try again.");
                }
            });

        tilePromises.push(tilePromise);
    }

    Promise.all(tilePromises).then(() => {
        if (signal.aborted) return;

        notify("Generation complete");
        dismissNotification();
        document.getElementById("acceptBtn").classList.remove("hidden");
        document.getElementById("rejectBtn").classList.remove("hidden");
        document.getElementById("acceptBtn").setAttribute("data-prompt", prompt);
        document.getElementById("interruptButton").classList.add("hidden");

        const avg = Math.round(generationTimes.reduce((a, b) => a + b, 0) / generationTimes.length);
        console.log(`Average generation time: ${avg}s`);
    });
}




document.getElementById("acceptBtn").addEventListener("click", function() {
    let specialDir = localStorage.getItem("ElixpoAIUser")+"_"+Date.now();
    handleStaticServerUpload(generateURLS, generateURLS.length, imageTheme, model, ratio, specialDir, 0, privateMode);
});

document.getElementById("rejectBtn").addEventListener("click", function() {
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("generateButton").removeAttribute("disabled");
    notify("Wowza! You didn't Like it? No worries, let's try again!");
    resetAll(preserve=true);
});

async function handleStaticServerUpload(generateURLS, imageNumber, imageTheme, model, ratio, specialDir, index, private) {
    if(!private)
    {
        notify("Just a sec! Saving...");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    var currentTotalImageOnServer = await gettotalGenOnServer();
    console.log("Current Total Image on Server:", currentTotalImageOnServer);
    var nextImageNumber = currentTotalImageOnServer + 1;
    console.log("Next Image Number:", nextImageNumber);
    let prompt = document.getElementById("acceptBtn").getAttribute("data-prompt");
    const imageGenId = generateUniqueId(localStorage.getItem("ElixpoAIUser").toLowerCase());
    const timestamp = Date.now();

    const uploadPromises = generateURLS.map(async (imageUrl, index) => {
        await db.collection("ImageGen").doc(specialDir).set({
            theme: imageTheme,
            model: model,
            timestamp: timestamp,
            user: localStorage.getItem("ElixpoAIUser"),
            prompt: prompt,
            ratio: ratio,
            ai_enhanced: enhanceMode,
            total_gen_number: generateURLS.length,
            genNum: nextImageNumber,
            date: new Date().toDateString(),
            imgId: imageGenId
        });
        await db.collection("ImageGen").doc(specialDir).update({
            [`Imgurl${index}`]: imageUrl,
        });
    });

    await Promise.all(uploadPromises);

    await db.collection("Server").doc("totalGen").update({
        value: nextImageNumber,
    });

    notify("Saved successfully!");
    resetAll();
    }
    else 
    {
        notify("Well... that's it then...");
        resetAll();
    }
    
}

function resetAll(preserve) 
{
    document.getElementById("promptTextInput").classList.remove("blur");
    document.getElementById("overlay").classList.remove("display");
    document.getElementById("overlay").innerHTML = "";
    document.querySelectorAll(".tile").forEach(tile => {
        tile.style.backgroundImage = "none";
        tile.querySelector(".loadingAnimations").classList.remove("hidden");
    });
    generateURLS = [];
    isImageMode = false;
    controller = null;
    imageController = null;
    extractedDetails = {};
    cleanImageDisplay();
    cleanImageGenerator();
    manageTileNumbers();
    cancelImageReference();
    document.getElementById("acceptBtn").classList.add("hidden");
        document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").removeAttribute("data-prompt");
    document.getElementById("generateButton").removeAttribute("disabled");
    document.getElementById("overlay").scrollTop = 0;
    document.querySelector(".imageProcessingAnimation ").classList.remove("imageMode");
    document.querySelector(".imageThemeContainer").classList.remove("imageMode");
    document.getElementById("interruptButton").classList.add("hidden");
    document.getElementById("usernameDisplay").innerHTML = "";
    hideSection("imageDisplay");
    hideSection("imageGenerator");
    showSection("imageCustomization");
    const imageCustomizationrSection = document.getElementById("imageCustomization");
    const offsetTop = imageCustomizationrSection.offsetTop - 60;
    const container = document.querySelector(".sectionContainer");
    container.scrollTo({ top: offsetTop, behavior: "smooth" });


    document.getElementById("generateButton").style.cssText = `
    opacity: 1;
    pointer-events: all;
`
    if(preserve)
    {
        notify("let's try again!");
        
    }
    else 
    {
        notify("Anything more? Let's go!");
        document.getElementById("promptTextInput").value = "";
    }
    document.getElementById("promptTextInput").focus();

}

function cleanImageDisplay() {
    document.querySelector(".imageDisplayHolder").style.backgroundImage = "none";
    document.getElementById("promptDisplay").innerHTML = "";
    document.getElementById("aspectRatioDisplay").innerHTML = "";
    document.getElementById("timeTakenDisplay").innerHTML = "";
    document.getElementById("imageSpecs").innerHTML = "";
    document.getElementById("ImageDisplayDownloadBtn").removeAttribute("data-id");
    document.getElementById("imageDisplay").style.backgroundImage = "none";
}

function cleanImageGenerator() {
    if(isImageMode)
    {
        document.getElementById("imageHolder").style.backgroundImage = "none";
        document.getElementById("imageHolder").style.background = "none";
        document.getElementById("imageThemeContainer").classList.remove("image");
        document.getElementById("imageProcessingAnimation").classList.remove("image");
        cancelImageReference();
    }
    document.getElementById("promptTextInput").classList.remove("blur");
    document.getElementById("overlay").classList.remove("display");
    document.getElementById("overlay").innerHTML = "";
    document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `none`);
    document.getElementById("promptTextInput").focus();

}


function generateUniqueId(inputString) {
    // Get the current timestamp
    const timestamp = Date.now().toString();

    // Concatenate the input string and the timestamp
    let combined = inputString + timestamp;

    // Shuffle the combined string
    combined = combined.split('').sort(() => Math.random() - 0.5).join('');

    // Generate a unique alphanumeric ID by slicing the shuffled string
    const uniqueId = combined.slice(0, 10); // You can adjust the length of the ID by changing this value

    return uniqueId;
}

async function gettotalGenOnServer() {
    try {
        const snapshot = await db.collection('Server').doc("totalGen").get();
        console.log("Total Gen:", snapshot.data().value);
        let totalGen = parseInt(snapshot.data().value);
        return totalGen;
    } catch (error) {
        console.error("Error getting total generation count:", error);
        return 0;
    }
}



function expandImage(imageUrl, prompt, seed, height, width, model, ratio, time) {
    const imageDisplayHolder = document.querySelector(".imageDisplayHolder");
    const promptDisplay = document.getElementById("promptDisplay");
    const aspectRatioDisplay = document.getElementById("aspectRatioDisplay");
    const timeTakenDisplay = document.getElementById("timeTakenDisplay");
    const imageSpecs = document.getElementById("imageSpecs");
    const downloadButton = document.getElementById("ImageDisplayDownloadBtn");
    document.getElementById("usernameDisplay").innerHTML = `<span> by ${localStorage.getItem("ElixpoAIUser").slice(0, 11)+"..."}</span>`;

    
    hideSection("imageCustomization");
    hideSection("imageGenerator");
    showSection("imageDisplay");
    const container = document.querySelector(".sectionContainer"); 
    const imageDisplaySection = document.getElementById("imageDisplay");
    const offsetTop = imageDisplaySection.offsetTop + 60;
    container.scrollTo({ top: offsetTop, behavior: "smooth" });

    imageDisplayHolder.style.backgroundImage = `url(${imageUrl})`;
    promptDisplay.innerHTML = `<span>${prompt}</span>`;
    aspectRatioDisplay.innerHTML = `<span>${ratio}</span>`;
    imageSpecs.innerHTML = `<span>${width} x ${height}</span><span>${model}</span>`;
    timeTakenDisplay.innerHTML = `<span>~${time > 60 ? "60+" : time}s</span>`;
    downloadButton.setAttribute("data-id", imageUrl);

    downloadButton.onclick = function () {
        const imageUrl = this.getAttribute("data-id");
        if (imageUrl) {
            const link = document.createElement("a");
            link.href = imageUrl;
            link.download = "Elixpo_Generated.png";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            notify("Image downloaded successfully!");
        } else {
            console.error("No image URL found for download.");
        }
    };


   
    
   
}

document.getElementById("goUpBtn").addEventListener("click", function () {
    hideSection("imageCustomization");
    hideSection("imageDisplay");
    showSection("imageGenerator");
    const imageGeneratorSection = document.getElementById("imageGenerator");
    const offsetTop = imageGeneratorSection.offsetTop - 60;
    const container = document.querySelector(".sectionContainer");
    container.scrollTo({ top: offsetTop, behavior: "smooth" });
});



const imageDisplay = document.getElementById("imageDisplay");
imageDisplay.addEventListener("mouseenter", () => {
    isMouseOverImageDisplay = true;
});
imageDisplay.addEventListener("mouseleave", () => {
    isMouseOverImageDisplay = false;
});
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isMouseOverImageDisplay) {
        hideSection("imageCustomization");
        hideSection("imageDisplay");
        showSection("imageGenerator");
        const imageGeneratorSection = document.getElementById("imageGenerator");
        const offsetTop = imageGeneratorSection.offsetTop - 20;
        const container = document.querySelector(".sectionContainer");
        container.scrollTo({ top: offsetTop, behavior: "smooth" });
    }
});


document.querySelectorAll("#downloadBtn").forEach(downloadBtn => {
    downloadBtn.addEventListener("click", function() {
        const imageUrl = downloadBtn.getAttribute("data-id");
    if (imageUrl) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = "Elixpo_Generated.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        console.error("No image URL found for download.");
    }
    });
});
document.querySelectorAll(".inPictureControls > #copyButton").forEach(copyBtn => {
    copyBtn.addEventListener("click", function() {
        const promptText = copyBtn.getAttribute("data-id");
        navigator.clipboard.writeText(promptText).then(() => {
            notify("Prompt copied to clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });
});



// generateImage(2, "a beautiful kite", "512", "512", "flux", "a realistic depiction", "SD", false, false, false, null, new AbortController());
function typeEnhancedPrompt(msg, wordIndex = 0, callback) {
    const welcomeMessage = document.getElementById("overlay");
    const message = msg;
    const words = message.split(" ");
    document.getElementById("overlay").scrollTop = document.getElementById("overlay").scrollHeight;
    if (wordIndex < words.length) {
        const span = document.createElement("span");
        span.textContent = words[wordIndex] + " ";
        span.style.opacity = 0;
        span.style.filter = "blur(10px)";
        span.style.transition = "0.5s ease-in";
        welcomeMessage.appendChild(span);

        setTimeout(() => {
            span.style.opacity = 1;
            span.style.filter = "blur(0px)";
        }, 100);

        setTimeout(() => typeEnhancedPrompt(msg, wordIndex + 1, callback), 100);
    } else if (callback) {
        callback();
        document.getElementById("overlay").scrollTop = 0;
    }
}



async function promptEnhance(userPrompt, pimpController) {
    console.log("Enhancing prompt:", userPrompt);
    const seed = Math.floor(Math.random() * 10000);     

    const response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "openai",
            seed: seed,
            messages: [
                {
                    role: "system",
                    content: "You are a professional AI prompt enhancer specialized in creating rich, vivid, and detailed prompts for AI art generation. Transform the user's input into a visually immersive and technically optimized prompt between 50 to 100 words. Include visual styles, lighting, composition, mood, and camera perspective if applicable, without changing the core idea."
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        }),
        signal: pimpController.signal,
        mode: "cors"
    });

    if (!response.ok) {
        console.error("Enhancer Error:", response.statusText);
        notify("Oppsie! My brain hurts, bruuh.... i'll generate an image directly");
        return userPrompt;
    }

    const data = await response.json();
    if (data.error) {
        console.error("Enhancer Error:", data.error);
        notify("Oppsie! My brain hurts, bruuh.... i'll generate an image directly");
        return userPrompt;
    }

    const enhanced = data.choices?.[0]?.message?.content || "";
    return enhanced.trim();
}




function getSuffixPrompt(theme)
{
    const themeSuffixMap = {
        "structure": "-- a stunning architectural masterpiece, carved from stone with intricate details and realistic textures",
        "crayon": "-- a vibrant and playful crayon-style illustration, full of bold colors and childlike charm",
        "normal": "-- a highly realistic and lifelike depiction, capturing fine details and natural tones",
        "space": "-- a mesmerizing cosmic scene, featuring stars, galaxies, and the vastness of the universe",
        "chromatic": "-- a vivid and colorful chromatic artwork, blending hues in a visually striking manner",
        "halloween": "-- a spooky and atmospheric Halloween-themed design, with eerie lighting and haunting elements",
        "cyberpunk": "-- a futuristic cyberpunk cityscape, glowing with neon lights and high-tech aesthetics",
        "anime": "-- a beautifully crafted anime-style character or scene, with expressive features and dynamic composition",
        "landscape": "-- a breathtaking natural landscape, showcasing majestic scenery and serene beauty",
        "fantasy": "-- a magical and enchanting fantasy world, filled with mythical creatures and imaginative settings",
        "ghibli": "-- a whimsical Studio Ghibli-inspired scene, brimming with charm and storytelling",
        "wpap": "-- a bold and vibrant WPAP-style geometric portrait, with sharp lines and vivid colors",
        "vintage": "-- a nostalgic vintage retro-style artwork, evoking the charm of a bygone era sepia themed browish",
        "pixel": "-- a pixelated retro game-style image, reminiscent of classic 8-bit or 16-bit graphics",
        "synthwave": "-- a neon-lit synthwave aesthetic, inspired by 80s retro-futurism and electronic music"
    };

    return themeSuffixMap[theme] || "a generic artistic creation";
}


function  getAspectRatio(aspectRatio) 
{
const aspectRatioMap = {
    "1:1": { SD: "1024x1024", HD: "1280x1280", LD: "512x512" },
    "9:16": { SD: "576x1024", HD: "720x1280", LD: "288x512" },
    "16:9": { SD: "1024x576", HD: "1280x720", LD: "512x288" },
    "4:3": { SD: "1024x768", HD: "1280x960", LD: "512x384" },
    "3:2": { SD: "1024x682", HD: "1280x854", LD: "512x341" }
};

return aspectRatioMap[aspectRatio] || { SD: "1024x768", HD: "1280x960", LD: "512x384" };
}



manageTileNumbers();