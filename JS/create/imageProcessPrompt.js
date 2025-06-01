let extractedBase64Data = null;
let selectedImageFile = null; 

document.getElementById("inputImage").addEventListener("click", function () {
    document.getElementById("generateButton").classList.add("disabled");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async function (event) {
        selectedImageFile = event.target.files[0] || null;
        if (!selectedImageFile) return;
        if (selectedImageFile.size >= 10 * 1024 * 1024) {
            notify("Please select an image file smaller than 10 MB.");
            selectedImageFile = null;
            return;
        }
        // Extract base64 and show image in imageHolder
        const reader = new FileReader();
        reader.onload = function () {
            extractedBase64Data = reader.result.split(",")[1];
            // Show preview in imageHolder immediately
            const imageDataUrl = reader.result;
            isImageMode = true;
            document.getElementById("promptBox").classList.add("image");
            document.getElementById("imageHolder").style.background = `url(${imageDataUrl})`;
            document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `url(${imageDataUrl})`);
            document.getElementById("imageHolder").style.backgroundSize = "cover";
            document.getElementById("imageHolder").style.backgroundPosition = "center center";
            handleFlagUpdateAuto(".models", "model", "gptimage");
            handleFlagUpdateAuto(".themes", "theme", "normal");
            document.querySelectorAll(".modelsTiles").forEach(tile => {
                tile.style.pointerEvents = "none";
            });
            document.getElementById("OneImage").style.pointerEvents = "none";
            document.getElementById("OneImage").className = "fa-solid fa-dice-one";
            generationNumber = 1;

        };
        reader.readAsDataURL(selectedImageFile);
        document.getElementById("generateButton").classList.remove("disabled");
    };

    input.oncancel = function () {
        cancelImageReference();
        selectedImageFile = null;
    };

    input.click();
});

// Only show image and upload when preparePromptInput is called and isImageMode is true
async function showAndUploadImageIfNeeded() {
    if (!selectedImageFile) return null;
    // Show preview
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.onload = async function () {
            const imageDataUrl = reader.result;
            extractedBase64Data = imageDataUrl.split(",")[1];
            document.getElementById("promptBox").classList.add("image");
            document.getElementById("imageHolder").style.background = `url(${imageDataUrl})`;
            document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `url(${imageDataUrl})`);
            document.getElementById("imageHolder").style.backgroundSize = "cover";
            document.getElementById("imageHolder").style.backgroundPosition = "center center";
            document.getElementById("overlay").classList.add("display");
            const uploadedUrl = await uploadImageToUguu(selectedImageFile);
            document.getElementById("overlay").classList.remove("display");
            if (uploadedUrl) {
                document.getElementById("imageHolder").setAttribute("data-uploaded-url", uploadedUrl);
                resolve(uploadedUrl);
            } else {
                document.getElementById("imageHolder").removeAttribute("data-uploaded-url");
                resolve(null);
            }
        };
        reader.readAsDataURL(selectedImageFile);
    });
}

// Remove old handleImageFile, only use for paste/hardcoded
async function handleImageFile(file) {
    if (!file) return;
    if (file.size >= 10 * 1024 * 1024) {
        notify("Please select an image file smaller than 10 MB.");
        return;
    }
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = function () {
        extractedBase64Data = reader.result.split(",")[1];
    };
    reader.readAsDataURL(file);
    document.getElementById("generateButton").classList.remove("disabled");
}

function cancelImageReference() {
    document.getElementById("promptBox").classList.remove("image");
    document.getElementById("imageHolder").style.background = "none";
    document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `none`);
    isImageMode = false;
    selectedImageFile = null;
    extractedBase64Data = null;
    handleFlagUpdateAuto(".models", "model", "flux");
    document.getElementById("generateButton").classList.remove("disabled");
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
    document.querySelectorAll(".modelsTiles").forEach(tile => {
        tile.style.pointerEvents = "all";
    });
    dismissNotification();
    document.getElementById("OneImage").style.pointerEvents = "all"
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

// Paste handler (for clipboard images)
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
        event.preventDefault();
        if (blob.size >= 10 * 1024 * 1024) {
            alert("Please paste an image smaller than 10 MB.");
            return;
        }
        await handleImageFile(blob);
    }
});

// For hardcoded image loading (dev/test)
async function loadHardcodedImage() {
    const imageUrl = "../../CSS/IMAGES/testImg.jpg";
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

// Export for use in imageGeneration.js
window.showAndUploadImageIfNeeded = showAndUploadImageIfNeeded;
window.cancelImageReference = cancelImageReference;
window.handleImageFile = handleImageFile;