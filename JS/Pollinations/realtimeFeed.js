let displayMode = "image"; // Default display mode
let eventSourceImage = null;
let eventSourceText = null;
let isDisplayingImage = false;
let isDisplayingText = false;
let typingSpeed = 50;


function connectToServer(mode) {
    const feedUrlImage = "https://image.pollinations.ai/feed";
    const feedUrlText = "https://text.pollinations.ai/feed";

    let imageHolder = document.getElementById("displayImage");
    let imagePromptHolder = document.getElementById("imagePrompt");
    let modelUsed = document.getElementById("modelused");
    let referrerMentioned = document.getElementById("referrerMentioned");

    let userTextPrompt = document.getElementById("userPromptServer");
    let aiTextResponse = document.getElementById("aiRespondServer");
    if (mode === "image") {
        if (eventSourceText) {
            eventSourceText.close();
            console.log("Text Feed connection closed.");
            eventSourceText = null;
        }

        if (!eventSourceImage) {
            eventSourceImage = new EventSource(feedUrlImage);
            console.log("Connecting to Image Feed:", feedUrlImage);

            eventSourceImage.onmessage = function (event) {
                if (isDisplayingImage) return;

                try {
                    const imageData = JSON.parse(event.data);
                    console.log("New Image (Queued):", imageData);

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

                            imagePromptHolder.innerHTML = ""; 
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
                                }, index * 100); 
                            });
                            modelUsed.innerHTML = imageData.model;
                            referrerMentioned.innerHTML = imageData.referrer || "Unknown";

                            // Animate fade in
                            imageHolder.style.opacity = "1";

                            setTimeout(() => {
                                isDisplayingImage = false;
                            }, 3000); // 3 seconds delay per image
                        }, 500); // wait for fade-out to finish
                    };

                    newImg.onerror = () => {
                        console.error("Failed to preload image.");
                        isDisplayingImage = false;
                    };

                } catch (error) {
                    console.error("Error parsing image data:", error);
                }
            };

            eventSourceImage.onopen = function () {
                console.log("Image Feed connection opened.");
            };

            eventSourceImage.onerror = function () {
                console.error("Error with Image Feed connection.");
                eventSourceImage.close();
                eventSourceImage = null;
            };
        }
    } else if (mode === "text") {
        if (eventSourceImage) {
            eventSourceImage.close();
            console.log("Image Feed connection closed.");
            eventSourceImage = null;
        }

        if (!eventSourceText) {
            eventSourceText = new EventSource(feedUrlText);
            console.log("Connecting to Text Feed:", feedUrlText);
            eventSourceText.onmessage = function (event) {
                if (isDisplayingText) return; // Prevent overlap
            
                try {
                    const textData = JSON.parse(event.data);
                    console.log("New Text (Queued):", textData);
                    isDisplayingText = true;
                    modelUsed.innerHTML = textData.parameters.model;
                    referrerMentioned.innerHTML = textData.parameters.referrer || "Unknown";
            
                    // Clear old content
                    userTextPrompt.innerHTML = "";
                    aiTextResponse.innerHTML = "";
                    let userWords = [];
                    let aiWords = [];
            
                    try {
                        userWords = textData.parameters.messages[0].content.split(/\s+/).slice(0,20);
                        aiWords = textData.response.split(/\s+/).slice(0, 20);
                    } catch (error) {
                        console.error("Error splitting text data:", error);
                        userWords = ["Error", "loading", "user", "text"];
                        aiWords = ["Error", "loading", "AI", "response"];
                    }
                    
                    // Typing animation for userTextPrompt
                    userWords.forEach((word, index) => {
                        const span = document.createElement("span");
                        span.innerHTML = word + " ";
                        span.style.filter = "blur(5px)"; 
                        span.style.opacity = "0";
                        span.style.transition = "opacity 0.4s ease-in-out, filter 0.4s ease-in-out";
                        userTextPrompt.appendChild(span);
            
                        setTimeout(() => {
                            span.style.opacity = "1";
                            span.style.filter = "blur(0px)"; 
                        }, index * typingSpeed); // Slow typing
                    });
            
                    // Typing animation for aiTextResponse
                    aiWords.forEach((word, index) => {
                        const span = document.createElement("span");
                        span.innerHTML = word + " "; // Ensure space
                        span.style.opacity = "0";
                        span.style.filter = "blur(5px)";
                        span.style.transition = "opacity 0.4s ease-in-out, filter 0.4s ease-in-out";
                        aiTextResponse.appendChild(span);
            
                        setTimeout(() => {
                            span.style.opacity = "1";
                            span.style.filter = "blur(0)";
                            void span.offsetHeight;
                        }, index * typingSpeed); // After user text
                    });
            
                    // Total animation time before accepting next message
                    const totalDelay = (userWords.length + aiWords.length) * typingSpeed + 800;
                    setTimeout(() => {
                        isDisplayingText = false;
                    }, totalDelay);
            
                } catch (error) {
                    console.error("Error parsing text data:", error);
                }
            };
            
        }
            }
}