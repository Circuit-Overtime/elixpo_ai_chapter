let enhanceImage = false;
let privateImage = false;
let logoImage = true;
let modelIndexImage = 0;
let modelsImage = ["Flux", "Turbo", "gptImage"];
let modelsText = [
    "openai",
    "openai-fast",
    "openai-large",
    "openai-roblox",
    "qwen-coder",
    "llama",
    "llamascout",
    "mistral",
    "unity",
    "mirexa",
    "midijourney",
    "rtist",
    "searchgpt",
    "evil",
    "deepseek-reasoning",
    "phi",
    "hormoz",
    "hypnosis-tracy",
    "deepseek",
    "grok",
    "sur",
    "bidara",
    "openai-audio"
];
let modelIndexText = 0;
let currentMode = "watchMode"; // Start in watch mode by default

// EventSource variables
let eventSourceImage = null;
let eventSourceText = null;
let isDisplayingImage = false; // Flag to prevent overlapping image feed updates
let isDisplayingText = false;   // Flag to prevent overlapping text feed updates
let typingSpeed = 50; // Speed for text typing animation

document.getElementById("tryItBtn").addEventListener("click", function(e) {
    // Toggle the overall mode state
    if (currentMode === "watchMode") {
        currentMode = "tryMode";
        document.getElementById("tryItBtnText").innerText = "Watch Feed?";
        document.getElementById("imageFeedSectionDescriptionLeft").innerText = "Try generating images";
        document.getElementById("imageFeedSectionDescriptionRight").innerText = "texts using pollinations";
    } else {
        currentMode = "watchMode";
        document.getElementById("tryItBtnText").innerText = "Try Now?";
        document.getElementById("imageFeedSectionDescriptionLeft").innerText = "This is the realtime image";
        document.getElementById("imageFeedSectionDescriptionRight").innerText = "text feed of pollinations  ";
    }
    // Update the UI and feed state based on the new mode and current checkbox state
    updateUIMode();
});

document.getElementById("imageOrTextCheckBox").addEventListener("change", function() {
    // Update the UI and feed state based on the current mode and the new checkbox state
    updateUIMode();
});

document.addEventListener("DOMContentLoaded", function() {
    // Initial UI and feed setup based on default mode and checkbox state
    updateUIMode();
});

// This function handles the core display elements (output areas)
// and the generationInfo textMode class. It does NOT control prompt inputs.
function toggleOutputDisplay() {
    if (document.getElementById("imageOrTextCheckBox").checked) {
        // Text output mode
        document.getElementById("displayImage").classList.add("hidden"); 
        document.getElementById("aiRespondServer").classList.remove("hidden"); 
        document.getElementById("userPromptServer").classList.remove("hidden"); 
        document.getElementById("generationInfo").classList.add("textMode"); 
        // imagePrompt is controlled in updateUIMode now, not here
        document.getElementById("imagePrompt").classList.add("hidden");
    } else {
        // Image output mode
        document.getElementById("displayImage").classList.remove("hidden"); // Show image output area
        document.getElementById("aiRespondServer").classList.add("hidden"); // Hide text response area
        document.getElementById("userPromptServer").classList.add("hidden"); // Hide text user prompt echo area
        document.getElementById("generationInfo").classList.remove("textMode"); // Remove text mode styling
        // imagePrompt is controlled in updateUIMode now, not here
        document.getElementById("imagePrompt").classList.remove("hidden");
    }
}

// Central function to update ALL UI and manage feed connections
function updateUIMode() {
    const isTextMode = document.getElementById("imageOrTextCheckBox").checked;
    const imagePromptEl = document.getElementById("imagePrompt");
    const ImagePromptSection = document.getElementById("ImagePromptSection"); // Assuming ImagePromptSection is a parent
    const textPromptSectionEl = document.getElementById("textPromptSection");

    // 1. Reset 'tryitMode' class on all affected elements
    const tryitElements = document.querySelectorAll(".tryit-target");
    tryitElements.forEach(el => el.classList.remove("tryitMode"));

    // 2. Reset buttons and generation listeners
    resetButtonsAndListeners();

    // 3. Manage EventSource Feed Connections
    if (currentMode === "watchMode") {
        // In watch mode, connect to the appropriate feed and close the other
        if (isTextMode) {
            connectToServer("text");
        } else {
            connectToServer("image");
        }
    } else { // tryMode
        // In try mode, close both feed connections to save resources
        if (eventSourceImage) {
            eventSourceImage.close();
            // console.log("Image Feed connection closed (Try Mode).");
            eventSourceImage = null;
        }
        if (eventSourceText) {
            eventSourceText.close();
            // console.log("Text Feed connection closed (Try Mode).");
            eventSourceText = null;
        }
        // Reset displaying flags when closing feeds
        isDisplayingImage = false;
        isDisplayingText = false;
        // Clear feed content when entering try mode
        document.getElementById("displayImage").style.backgroundImage = '';
        document.getElementById("imagePrompt").innerHTML = '';
        document.getElementById("aiRespondServer").innerHTML = '';
        document.getElementById("userPromptServer").innerHTML = '';

    }


    // 4. Handle prompt section visibility, button setup, and applying 'tryitMode'
    // Use direct style manipulation for prompt sections for robustness
    if (currentMode === "tryMode") {
        // Apply 'tryitMode' to the general elements that are part of the try mode UI
        tryitElements.forEach(el => el.classList.add("tryitMode"));

        if (isTextMode) {
            // Try Mode: Text Generation UI (Show text input, hide image input)
            imagePromptEl.style.display = "none";
            imagePromptEl.classList.remove("tryitMode"); // Ensure tryitMode is off
            // Assuming ImagePromptSection might also have tryitMode - remove it
            if (ImagePromptSection) ImagePromptSection.classList.remove("tryitMode");

            textPromptSectionEl.style.display = "block"; // Or 'flex', 'grid'
            textPromptSectionEl.classList.add("tryitMode");

            settleButtonsText(true); // Activate text-specific buttons
            // Add text generation listener
            document.getElementById("generateText").addEventListener("click", handleTextGeneration);
        } else {
            // Try Mode: Image Generation UI (Show image input, hide text input)
            imagePromptEl.style.display = "block"; // Or 'flex', 'grid'
            imagePromptEl.classList.add("tryitMode");
             // Assuming ImagePromptSection might also have tryitMode - add it
            if (ImagePromptSection) ImagePromptSection.classList.add("tryitMode");

            textPromptSectionEl.style.display = "none";
            textPromptSectionEl.classList.remove("tryitMode"); // Ensure tryitMode is off

            settleButtonsImage(true); // Activate image-specific buttons
            // Add image generation listener
            document.getElementById("generateImage").addEventListener("click", handleImageGeneration);
        }
    } else { // watchMode
        // Watch Mode: Prompt input sections are hidden
        imagePromptEl.style.display = "block"; // Hide the input prompt area
        imagePromptEl.classList.remove("tryitMode");
        // Assuming ImagePromptSection might have tryitMode - remove it
        if (ImagePromptSection) ImagePromptSection.classList.remove("tryitMode");

        textPromptSectionEl.style.display = "none"; // Hide the input prompt area
        textPromptSectionEl.classList.remove("tryitMode");
        // Buttons should already be reset by resetButtonsAndListeners()
        // No generation listeners are active in watch mode
        // Feed connections are handled in step 3
    }

    // 5. Handle the core display elements (image/text output area)
    // This function correctly uses the checkbox state to show the right output area
    toggleOutputDisplay();
}

// Helper function to remove all generation and button listeners
function resetButtonsAndListeners() {
    document.getElementById("generateImage").removeEventListener("click", handleImageGeneration);
    document.getElementById("generateText").removeEventListener("click", handleTextGeneration);
    // Remove specific button listeners managed by settleButtons
    document.getElementById("modelImage").removeEventListener("click", handleModelImageClick);
    document.getElementById("modelText").removeEventListener("click", handleModelTextClick);
    document.getElementById("enhanceButton").removeEventListener("click", handleEnhanceClick);
    document.getElementById("privateButton").removeEventListener("click", handlePrivateClick);
    document.getElementById("logoButton").removeEventListener("click", handleLogoClick);

    // Reset internal state for clarity (visual reset depends on CSS)
    enhanceImage = false;
    privateImage = false;
    logoImage = true; // Assuming default is logo ON

    // Reset visual states of buttons that might be active in try mode
    // This relies on your CSS removing these classes when not in .tryitMode
    // but explicitly removing them here ensures they are clean when listeners are gone.
    document.getElementById("enhanceButton").classList.remove("enhance");
    document.getElementById("privateButton").classList.remove("private");
    document.getElementById("logoButton").classList.add("logo"); // Re-apply default logo state
}


// Handlers for button clicks (moved to separate functions for clarity)
function handleModelTextClick() {
    modelIndexText = (modelIndexText + 1) % modelsText.length;
    document.getElementById("modelText").innerHTML = `<ion-icon name="shuffle"></ion-icon> ${modelsText[modelIndexText]}` ;
}

function handleModelImageClick() {
    modelIndexImage = (modelIndexImage + 1) % modelsImage.length;
    document.getElementById("modelImage").innerHTML = `<ion-icon name="shuffle"></ion-icon> ${modelsImage[modelIndexImage]}` ;
}

function handleEnhanceClick() {
    enhanceImage = !enhanceImage;
    if (enhanceImage) {
        createToastNotification("AI enhancement active");
        document.getElementById("enhanceButton").classList.add("enhance");
    } else {
        document.getElementById("enhanceButton").classList.remove("enhance");
    }
}

function handlePrivateClick() {
    privateImage = !privateImage;
    if (privateImage) {
        document.getElementById("privateButton").classList.add("private");
        createToastNotification("Woossh!! Generates images will not show up in the feed anymore");
    } else {
        document.getElementById("privateButton").classList.remove("private");
    }
}

function handleLogoClick() {
    logoImage = !logoImage;
    if (logoImage) {
        document.getElementById("logoButton").classList.add("logo");
    } else {
        createToastNotification("Watermark will no longer appear on your images");
        document.getElementById("logoButton").classList.remove("logo");
    }
}


// Functions to add/remove specific button listeners
function settleButtonsText(set) {
    // Ensure previous listener is removed before potentially adding a new one
    document.getElementById("modelText").removeEventListener("click", handleModelTextClick);

    if (set) {
        document.getElementById("modelText").innerHTML = `<ion-icon name="shuffle"></ion-icon> ${modelsText[modelIndexText]}`;
        document.getElementById("modelText").addEventListener("click", handleModelTextClick);
    }
    // When set is false, the listener is already removed above
}

function settleButtonsImage(set) {
     // Ensure previous listeners are removed before potentially adding new ones
    document.getElementById("modelImage").removeEventListener("click", handleModelImageClick);
    document.getElementById("enhanceButton").removeEventListener("click", handleEnhanceClick);
    document.getElementById("privateButton").removeEventListener("click", handlePrivateClick);
    document.getElementById("logoButton").removeEventListener("click", handleLogoClick);

    if (set) {
        document.getElementById("modelImage").innerHTML = `<ion-icon name="shuffle"></ion-icon> ${modelsImage[modelIndexImage]}`;
        document.getElementById("modelImage").addEventListener("click", handleModelImageClick);
        document.getElementById("enhanceButton").addEventListener("click", handleEnhanceClick);
        document.getElementById("privateButton").addEventListener("click", handlePrivateClick);
        document.getElementById("logoButton").addEventListener("click", handleLogoClick);

        // Set initial state of buttons visually when activated
        if (enhanceImage) document.getElementById("enhanceButton").classList.add("enhance");
        else document.getElementById("enhanceButton").classList.remove("enhance");

        if (privateImage) document.getElementById("privateButton").classList.add("private");
        else document.getElementById("privateButton").classList.remove("private");

        if (logoImage) document.getElementById("logoButton").classList.add("logo");
        else document.getElementById("logoButton").classList.remove("logo");

    }
    // When set is false, the listeners are already removed above
}


// --- Generation Functions ---

async function generateImage(prompt, height, width, seed, modelIndexImage, enhanceImage, privateImage, logoImage) {
    const displayElement = document.getElementById("displayImage");
    if (!displayElement) {
        // console.error("Element with ID 'displayImage' not found.");
        return; // Don't proceed if the display element is missing
    }
    // Assuming createToastNotification and anime exist elsewhere
    document.getElementById("generateImage").classList.add("generating");
     // Add the 'generating' class to the animation element here
     document.getElementById("imageGenerationAnimation").classList.add("generating");
    createToastNotification("Generating image...");

    const model = modelsImage[modelIndexImage] || "Flux"; // Use default "Flux" if index is bad
    const params = {
        width,
        height,
        seed,
        model,
        enhance: enhanceImage ? "true" : "false",
        private: privateImage ? "true" : "false",
        nologo: logoImage ? "true" : "false", // Parameter name is usually 'nologo'
        referrer: "elixpoart",
        token: "elixpoart" // Assuming a token is needed and valid
    };

    const queryParams = new URLSearchParams(params);
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${queryParams.toString()}`;

    // console.log("Fetching image from:", url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
             // Attempt to parse JSON error if applicable
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(`API Error: ${errorJson.message || errorText}`);
            } catch (e) {
                 throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
        }
        const imageBlob = await response.blob();
        const imageUrl = URL.createObjectURL(imageBlob);
        return imageUrl; // Return the URL
    } catch (error) {
        // console.error("Error fetching image:", error);
        createToastNotification(`Error generating image: ${error.message}`); // Show specific error
        throw error; // Re-throw to be caught by the click handler's .catch
    } finally {
        // Ensure generating state is removed even on error or success
        document.getElementById("generateImage").classList.remove("generating");
        // Remove the 'generating' class from the animation element here
        document.getElementById("imageGenerationAnimation").classList.remove("generating");
    }
}

// Handler for the image generation button click
async function handleImageGeneration() {
    let prompt = document.getElementById("promptInputImage").value;
    if (prompt.trim() === "") {
        createToastNotification("Please enter a prompt");
        return;
    }
    let height = document.getElementById("heightImage").value ? parseInt(document.getElementById("heightImage").value) : 1024;
    let width = document.getElementById("widthImage").value ? parseInt(document.getElementById("widthImage").value) : 1024;
    let seed = document.getElementById("seedImage").value ? parseInt(document.getElementById("seedImage").value) : Math.floor(Math.random() * 1000000);

    try {
        const imageUrl = await generateImage(prompt, height, width, seed, modelIndexImage, enhanceImage, privateImage, logoImage);
        if (imageUrl) {
            createToastNotification("Image generated successfully");
            const displayElement = document.getElementById("displayImage");

             // Clear previous styles before applying new background for smoother update
            displayElement.style.background = ''; // Clear all background properties
            displayElement.style.backgroundImage = `url(${imageUrl})`;
            displayElement.style.backgroundRepeat = 'no-repeat';
            displayElement.style.backgroundPosition = 'center';
            displayElement.style.backgroundSize = "contain"; // Or 'cover' depending on desired fill

            // Clear input fields after successful generation
            document.getElementById("heightImage").value = "";
            document.getElementById("widthImage").value = "";
            document.getElementById("seedImage").value = "";
            document.getElementById("promptInputImage").value = "";
        }
    } catch (error) {
        // Error handling is done inside generateImage, toast is shown there.
        // We just catch here to prevent unhandled promise rejection.
        // console.error("Image generation failed:", error);
    }
}


async function generateText(prompt, modelIndexText, asJson = false) {
      // Assuming createToastNotification and anime exist elsewhere
     const model = modelsText[modelIndexText] || "mistral";
      const params = {
        model,
        json: asJson ? "true" : "false"
      };

      const queryParams = new URLSearchParams(params);
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `https://text.pollinations.ai/${encodedPrompt}?${queryParams.toString()}`;

    //   console.log("Fetching text from:", url);

      try {
        const response = await fetch(url);
        if (!response.ok) {
             const errorText = await response.text();
             // Attempt to parse JSON error if applicable
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(`API Error: ${errorJson.message || errorText}`);
            } catch (e) {
                 throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
        }

        const responseText = await response.text();

        if (asJson) {
          try {
            const parsed = JSON.parse(responseText);
            return parsed; // Return the parsed JSON
          } catch (e) {
            // console.error("Failed to parse JSON:", e);
            throw new Error("Failed to parse JSON response"); // Throw a specific error
          }
        } else {
          return responseText; // Return plain text
        }
      } catch (error) {
        // console.error("Error in generateText:", error);
        createToastNotification(`Error generating text: ${error.message}`); // Show specific error
        throw error; // Re-throw to be caught by the click handler's .catch
      }
}

// Handler for the text generation button click
async function handleTextGeneration() {
    let prompt = document.getElementById("promptInputText").value;
    if (prompt.trim() === "") {
        createToastNotification("Please enter a prompt");
        return;
    }
    document.getElementById("generateText").classList.add("generating");
    createToastNotification("Generating text...");

    let aiResponseElement = document.getElementById("aiRespondServer");
    // Clear previous response immediately
    aiResponseElement.innerHTML = "";
    // Optionally, show user's prompt in the userPromptServer area
     document.getElementById("userPromptServer").innerHTML = `<strong>You:</strong> ${prompt}`;


    try {
        const textResponse = await generateText(prompt, modelIndexText);

        // Animation for text response
        anime({
            targets: aiResponseElement,
            innerHTML: [""], // Start from empty
            round: 1,
            duration: Math.min(2000, textResponse.length * 30), // Adjust duration based on text length, max 2 sec
            easing: "linear",
            update: function(anim) {
                 // Ensure we don't go past the actual text length
                let currentLength = Math.floor(anim.progress / 100 * textResponse.length);
                 // Handle potential issues if update runs after complete
                 if (currentLength <= textResponse.length) {
                    aiResponseElement.innerHTML = textResponse.substring(0, currentLength);
                 }
            },
            complete: function() {
                 aiResponseElement.innerHTML = textResponse; // Ensure full text is shown at the end
            }
        });
        // Clear input field after successful generation
         document.getElementById("promptInputText").value = "";

    } catch (error) {
         // Error handling is done inside generateText, toast is shown there.
         // We just catch here to prevent unhandled promise rejection.
        //  console.error("Text generation failed:", error);
         // Optionally clear the user prompt echo on error
         document.getElementById("userPromptServer").innerHTML = "";
    } finally {
        // Ensure generating state is removed even on error or success
        document.getElementById("generateText").classList.remove("generating");
    }
}

// EventSource Feed Handling
function connectToServer(mode) {
    const feedUrlImage = "https://image.pollinations.ai/feed";
    const feedUrlText = "https://text.pollinations.ai/feed";

    let imageHolder = document.getElementById("displayImage");
    let imagePromptHolder = document.getElementById("imagePrompt");
    let modelUsed = document.getElementById("modelused");
    let referrerMentioned = document.getElementById("referrerMentioned");

    let userTextPrompt = document.getElementById("userPromptServer");
    let aiTextResponse = document.getElementById("aiRespondServer");

    // Close any existing connections first
    if (eventSourceImage) {
        eventSourceImage.close();
        eventSourceImage = null;
    }
    if (eventSourceText) {
        eventSourceText.close();
        eventSourceText = null;
    }

    // Reset display flags
    isDisplayingImage = false;
    isDisplayingText = false;

    if (mode === "image") {
        eventSourceImage = new EventSource(feedUrlImage);
        // console.log("Connecting to Image Feed:", feedUrlImage);

        eventSourceImage.onmessage = function (event) {
            // *** NEW CHECK ***: Only process if in watch mode and image feed is selected
            if (currentMode !== "watchMode" || document.getElementById("imageOrTextCheckBox").checked) {
                // console.log("Ignoring image feed update: not in watch mode or text mode active");
                return;
            }
             if (isDisplayingImage) return; // Prevent overlap

            try {
                const imageData = JSON.parse(event.data);
                // console.log("New Image (Queued):", imageData);

                isDisplayingImage = true;

                const newImg = new Image();
                newImg.src = imageData.imageURL;
                newImg.onload = () => {
                    // Animate fade out
                    imageHolder.style.transition = "opacity 0.5s ease-in-out";
                    imageHolder.style.opacity = "0";

                    setTimeout(() => {
                        // Update background
                        imageHolder.style.backgroundImage = `url(${imageData.imageURL})`;
                        imageHolder.style.backgroundSize = "contain";
                        imageHolder.style.backgroundRepeat = "no-repeat";
                        imageHolder.style.backgroundPosition = "center";

                        // Update prompt text with typing animation
                        imagePromptHolder.innerHTML = ""; // Clear previous
                        const words = imageData.prompt.split(" ");
                        words.forEach((word, index) => {
                            const span = document.createElement("span");
                            span.textContent = word + " ";
                            span.style.opacity = "0";
                            span.style.filter = "blur(5px)";
                            span.style.transition = "all 0.5s ease-in-out";
                            imagePromptHolder.appendChild(span);

                            setTimeout(() => {
                                span.style.opacity = "1";
                                span.style.filter = "blur(0)";
                            }, index * 60); // Typing speed for image prompt
                        });

                        modelUsed.innerHTML = imageData.model;
                        referrerMentioned.innerHTML = imageData.referrer || "Unknown";

                        // Animate fade in
                        imageHolder.style.opacity = "1";

                        setTimeout(() => {
                             // Allow next image after fade-in and maybe a small delay
                            isDisplayingImage = false;
                        }, 1000); // Example delay after fade-in
                    }, 500); // wait for fade-out to finish
                };

                newImg.onerror = () => {
                    // console.error("Failed to preload image.");
                    isDisplayingImage = false;
                };

            } catch (error) {
                // console.error("Error parsing image data:", error);
            }
        };

        eventSourceImage.onopen = function () {
            // console.log("Image Feed connection opened.");
        };

        eventSourceImage.onerror = function () {
            // console.error("Error with Image Feed connection.", eventSourceImage.readyState);
            // Attempt to reconnect on error
            eventSourceImage.close();
            eventSourceImage = null;
            setTimeout(() => connectToServer("image"), 5000); // Attempt to reconnect after 5 seconds
        };

    } else if (mode === "text") {
        eventSourceText = new EventSource(feedUrlText);
        // console.log("Connecting to Text Feed:", feedUrlText);

        eventSourceText.onmessage = function (event) {
             // *** NEW CHECK ***: Only process if in watch mode and text feed is selected
            if (currentMode !== "watchMode" || !document.getElementById("imageOrTextCheckBox").checked) {
                 // console.log("Ignoring text feed update: not in watch mode or image mode active");
                return;
            }
            if (isDisplayingText) return; // Prevent overlap

            try {
                const textData = JSON.parse(event.data);
                // console.log("New Text (Queued):", textData);
                isDisplayingText = true;

                modelUsed.innerHTML = textData.parameters.model;
                referrerMentioned.innerHTML = textData.parameters.referrer || "Unknown";

                // Clear old content immediately for typing animation
                userTextPrompt.innerHTML = "";
                aiTextResponse.innerHTML = "";

                let userWords = [];
                let aiWords = [];

                try {
                     // Handle potential undefined messages array or content
                    userWords = textData.parameters.messages?.[0]?.content?.split(/\s+/)?.slice(0, 30) || ["User", "prompt", "unavailable"]; // Limit user prompt words
                    aiWords = textData.response?.split(/\s+/)?.slice(0, 50) || ["AI", "response", "unavailable"]; // Limit AI response words
                } catch (error) {
                    // console.error("Error splitting text data:", error);
                    userWords = ["Error", "loading", "user", "text"];
                    aiWords = ["Error", "loading", "AI", "response"];
                }

                // Typing animation for userTextPrompt
                 // Clear existing user prompt first to ensure clean animation
                 userTextPrompt.innerHTML = "<strong>You:</strong> ";
                userWords.forEach((word, index) => {
                    const span = document.createElement("span");
                    span.innerHTML = word + " ";
                    span.style.filter = "blur(5px)";
                    span.style.opacity = "0";
                    span.style.transition = "opacity 0.3s ease-in-out, filter 0.3s ease-in-out";
                    userTextPrompt.appendChild(span);

                    setTimeout(() => {
                        span.style.opacity = "1";
                        span.style.filter = "blur(0px)";
                    }, index * typingSpeed);
                });

                // Typing animation for aiTextResponse - start after user prompt animation is roughly done
                const userPromptAnimationDelay = userWords.length * typingSpeed;
                setTimeout(() => {
                     // Add 'AI:' prefix before AI response animation
                    aiTextResponse.innerHTML = "<strong>AI:</strong> ";
                    aiWords.forEach((word, index) => {
                        const span = document.createElement("span");
                        span.innerHTML = word + " ";
                        span.style.opacity = "0";
                        span.style.filter = "blur(5px)";
                        span.style.transition = "opacity 0.3s ease-in-out, filter 0.3s ease-in-out";
                        aiTextResponse.appendChild(span);

                        setTimeout(() => {
                            span.style.opacity = "1";
                            span.style.filter = "blur(0)";
                             // Trigger reflow for smooth transition (optional, but can help)
                             void span.offsetHeight;
                        }, index * typingSpeed);
                    });

                     // Total animation time before accepting next message
                    const totalDelay = aiWords.length * typingSpeed + 800; // Delay based on AI words + buffer
                    setTimeout(() => {
                        isDisplayingText = false;
                    }, totalDelay);

                }, userPromptAnimationDelay + 200); // Start AI animation slightly after user prompt finishes


            } catch (error) {
                // console.error("Error parsing text data:", error);
                isDisplayingText = false; // Allow next message on error
            }
        };

        eventSourceText.onopen = function () {
            // console.log("Text Feed connection opened.");
        };

        eventSourceText.onerror = function (event) {
            // console.error("Error with Text Feed connection.", event.target.readyState);
            // Attempt to reconnect on error
            eventSourceText.close();
            eventSourceText = null;
            setTimeout(() => connectToServer("text"), 5000); // Attempt to reconnect after 5 seconds
        };
    }
}


// --- Initialize ---
// The DOMContentLoaded listener already calls updateUIMode()
// This ensures the initial state is set correctly and connects to the watch feed.