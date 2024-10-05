 firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let images = [];
const texts = [];
const aspectRatios = ['aspect-9-16', 'aspect-4-3', 'aspect-16-9', 'aspect-3-2', 'aspect-1-1'];
const displayedImages = new Set();
let batchSize = 20; // Set a valid batch size greater than 0

let segmentSize;
let availableBatches = [];
let fetchedBatches = new Set();
let isFetching = false;
let imageLatch = [];
let rgbKineticSliderInstance = null;
let loadedImages = 0;
let fetchingSize = 0;

let metadataCache = {};
let cachedBatches = 0;
const maxCachedBatches = 2; // Only cache the first two batches

// let details = navigator.userAgent; 
// let regexp = /android|iphone|kindle|ipad/i;
// let isMobileDevice = regexp.test(details);

async function initialize() {
    globalThis.userName = localStorage.getItem('ElixpoAIUser');
    segmentSize = await getTotalGenOnServer();
    fetchImagesConcurrently();
    setInterval(async () => {
        segmentSize = await getTotalGenOnServer();
    }, 60000);
    
}

async function getTotalGenOnServer() {
    const snapshot = await db.collection('Server').doc("totalGen").get();
    const totalGen = parseInt(snapshot.data().value);
    segmentSize = totalGen;
    initializeBatches();
    return totalGen;
}

function initializeBatches() {
    if (segmentSize && batchSize > 0) {
        availableBatches = shuffle(Array.from({ length: Math.ceil(segmentSize / batchSize) }, (_, i) => i));
    } else {
        console.error("segmentSize or batchSize is not properly initialized.");
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function applyDominantColor(imgUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imgUrl;

        img.onload = () => {
            const colorThief = new ColorThief();
            const [r, g, b] = colorThief.getColor(img);
            resolve(`rgb(${r}, ${g}, ${b})`);
        };

        img.onerror = () => {
            console.error("Failed to load image for dominant color extraction");
            resolve(""); // or a fallback color
        };
    });
}

async function fetchImages(startAt = 0) {
    if (isFetching) return;
    isFetching = true;
    document.getElementById("loadMoreBtn").classList.remove("visible")
    const batchIndex = availableBatches.pop();
    const calculatedStartAt = startAt || (batchIndex * batchSize);
    
    // Load existing metadataCache from local storage
    let metadataCache = JSON.parse(localStorage.getItem("metadataCache")) || {};
    
    // Create an array of keys to check for cached images
    const keysToCheck = Array.from({ length: 20 }, (_, i) => calculatedStartAt + i);
    const cachedImages = keysToCheck.map(key => metadataCache[key]).filter(Boolean);

    if (cachedImages.length === 20) {
        console.log("local cache full, nothing more to store");
        cachedImages.forEach(data => imageLatch.push(data));
        await loadImagesFromLatch();
        isFetching = false;
        return;
    }

    // Determine the last fetched image number to adjust query
    const lastFetchedGenNum = cachedImages.length > 0 
        ? cachedImages[cachedImages.length - 1].genNum 
        : (calculatedStartAt > 0 ? calculatedStartAt - 1 : 0);

    // Check if lastFetchedGenNum is defined and valid
    if (lastFetchedGenNum === undefined || lastFetchedGenNum === null) {
        console.error("lastFetchedGenNum is invalid:", lastFetchedGenNum);
        isFetching = false;
        fetchImages();
        return;
    }

    console.log(lastFetchedGenNum);
    try {
        const querySnapshot = await db.collection("ImageGen")
            .where("genNum", ">", lastFetchedGenNum)  // Ensure this is a valid number
            .orderBy("genNum")
            .limit(batchSize)
            .get();

        if (querySnapshot.empty) {
            isFetching = false;
            return;
        }

        fetchingSize = querySnapshot.size;
        querySnapshot.docs.forEach(doc => {
            const data = doc.data();
            // Cache the metadata
            metadataCache[data.genNum] = {
                ratio: data.ratio,
                theme: data.theme,
                formatted_prompt: data.formatted_prompt,
                user: data.user,
                Imgurl0: data.Imgurl0,
                hashtags: data.hashtags,
                hq: data.hq,
                imgId: data.imgId
            };

            // Store the updated cache back to local storage only if it has less than 20 items
            if (Object.keys(metadataCache).length < 20) {
                localStorage.setItem("metadataCache", JSON.stringify(metadataCache));
            }

            // Add image to be displayed if not already displayed
            if (!displayedImages.has(data.Imgurl0)) {
                displayedImages.add(data.Imgurl0);
                imageLatch.push(data);
            }
        });

        // Load images from the latch
        await loadImagesFromLatch();

    } catch (error) {
        console.error("Error fetching images: ", error);
        loadedImages++;
    } finally {
        isFetching = false;
    }
}


async function loadImagesFromLatch() {
    const promises = [];
    while (imageLatch.length > 0) {
        const data = imageLatch.shift();
        
        try {
            document.getElementById("progressBar").classList.add("progressShow");
            const aspectRatio = aspectRatios[["9:16", "4:3", "16:9", "3:2", "1:1"].indexOf(data.ratio)];
            const majorityColor = await applyDominantColor(data.Imgurl0);  
            const imageBlobUrl = await convertToBlob(data.Imgurl0);
            const itemHtml = `
                <div class="masonry-item ${aspectRatio} expanded" id="masonryTile${data.genNum}" 
                    onclick="imageDetails(this)" 
                    data-id="${data.likes}###${data.ratio}###${data.theme}###${data.prompt}###${data.user}###${imageBlobUrl}###${data.hashtags}###${data.hq}###${data.imgId}" 
                    style="background: ${majorityColor}; background-size: cover; background-position: center center;">
                </div>
            `;
            masonry.innerHTML += itemHtml;

            const masonryTile = document.getElementById("masonryTile"+data.genNum);
            masonryTile.classList.add("loaded");
            if((localStorage.getItem("currWidth") == 50) && !isMobileDevice && (window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
            {
                spanAdjust(50);
            }
            // Try loading the image, skip if failed
            promises.push(loadImage(data.Imgurl0, masonryTile));
        } catch (error) {
            console.error("Error processing image: ", error);
            loadedImages++;
            console.log("Skipping image due to error.");
        }
        
        if (promises.length >= 5) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    // Handle any remaining promises
    if (promises.length > 0) {
        await Promise.all(promises);
    }

    // Log when all images have been loaded
    console.log("All images have been loaded successfully.");
    if(document.getElementById("MaskdisplayImage").classList.contains("displayInfo"))
    {
        spanAdjust(50);
    }
    else
    {
        spanAdjust(90);
    }
    
    
    
    setTimeout(() => document.getElementById("progressBar").classList.remove("progressShow"), 1500);
    isFetching = false;
    updateButtonVisibility();
    document.getElementById("loader").style.width = "0%";
    loadedImages = 0;
    fetchingSize = 0;
}




function loadImage(imageUrl, masonryTile, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const imgElement = new Image();
        imgElement.src = imageUrl;

        let imageLoaded = false; // Flag to track if the image has loaded or errored

        const timer = setTimeout(() => {
            if (!imageLoaded) {
                console.warn(`Image load timed out: ${imageUrl}`);
                masonryTile.classList.remove("loading");
                masonryTile.remove();
                loadedImages++;
                console.log("percentage: ", Math.round((loadedImages / fetchingSize) * 100));
                resolve(); // Treat as success to move on
            }
        }, timeout);

        imgElement.onload = () => {
            if (!imageLoaded) {
                clearTimeout(timer);  // Clear timeout if the image loads
                masonryTile.classList.remove("loading");
                masonryTile.classList.add("loaded");
                loadedImages++;
                logProgress(loadedImages, fetchingSize);
                
                imageLoaded = true;
                resolve();
            }
        };

        imgElement.onerror = () => {
            if (!imageLoaded) {
                clearTimeout(timer);  // Clear timeout if the image errors
                console.error(`Failed to load image: ${imageUrl}`);
                masonryTile.classList.remove("loading");
                masonryTile.remove();
                loadedImages++; // Increment for skipped image
                imageLoaded = true;
                resolve();  // Treat as success to move on
            }
        };

        masonryTile.appendChild(imgElement);
    });
}


async function convertToBlob(imageUrl) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}


function logProgress(loadedImages, fetchingSize)
{
    document.getElementById("loader").style.width = `${Math.round((loadedImages / fetchingSize) * 100)}%`;
}
async function fetchImagesConcurrently() {
    const firstStartAt = 0;
    const secondStartAt = batchSize;

    await Promise.all([
        fetchImages(firstStartAt),
        fetchImages(secondStartAt)
    ]);
}

function disposeSlider() {
    if (rgbKineticSliderInstance && typeof rgbKineticSliderInstance.dispose === 'function') {
        rgbKineticSliderInstance.dispose();
    }
}



async function imageDetails(self) {
    // Cache DOM element references
    const tagElement = document.getElementById("tag");
    const maskDisplayImage = document.getElementById("MaskdisplayImage");
    const rgbKineticSlider = document.getElementById("rgbKineticSlider");
    const promptDisplay = document.getElementById("PromptDisplay");
    const generationAspectRatio = document.getElementById("generationAspectRatio");
    const aspectRatioTileText = document.getElementById("aspectRatioTileText");
    const themeViewerText = document.getElementById("themeViewerText");
    const userCreditsName = document.getElementById("userCreditsName");
    const themeViewer = document.getElementById("themeViewer");
    const displayImageContainer = document.getElementById("galleryDisplayImage");
    const qualityOfImage = document.getElementById("generationQualityText");
    const postShare =  document.getElementById("postShare")
    displayImageContainer.style.filter = "blur(2px)";
    displayImageContainer.style.opacity = "0";
    aspectRatioTileText.style.filter = "blur(2px)";
    userCreditsName.style.filter = "blur(2px)";
    postShare.style.filter = "blur(2px)";
    postShare.style.opacity = "0";
    if((isMobileDevice == false) && ((window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches) == false))
    {
        spanAdjust(50);
    }
    
    maskDisplayImage.classList.add("displayInfo");
    document.getElementById("promptEngineering").style.display = "none";
    maskDisplayImage.classList.add("displayinfo");
    console.log("Image Clicked");
    
    // Get and parse data
    const data = self.getAttribute("data-id").split("###");
    const [likes, ratio, theme, formatted_prompt, user, link, hashtags, hq, id] = data;
    document.getElementById("downloadGalleryImage").setAttribute("data-id", link);
    // Apply dominant color
    const majorityColor = await applyDominantColor(link);
    
    // Batch DOM updates
    displayImageContainer.src = link;
    postShare.setAttribute("data-id", id);
    displayImageContainer.addEventListener("load", () => {
        setTimeout(() => { 
            displayImageContainer.style.filter = "blur(0px)";
            displayImageContainer.style.opacity = "1";
            aspectRatioTileText.style.filter = "blur(0px)";
            userCreditsName.style.filter = "blur(0px)";
            postShare.style.filter = "blur(0px)";
            postShare.style.opacity = "1";
        },1300);
    })
    tagElement.innerHTML = hashtags.split(",").map(tag => `<span>${tag}</span>`).join('');
    generationAspectRatio.innerHTML = ratio;
    aspectRatioTileText.innerHTML = ratio;
    promptDisplay.innerHTML = marked.parse(formatted_prompt);
    themeViewerText.innerHTML = theme;
    userCreditsName.innerHTML = user;
    themeViewer.style.background = `url("./CSS/IMAGES/THEMES/${theme.toLowerCase()}.jpeg")`;
    qualityOfImage.innerHTML = hq ? "HQ" : "LQ";

    images.push(link);
   
}




async function getQueryParam() {
    const urlParams = new URLSearchParams(window.location.search);
    let imageId = urlParams.get("id");

    // Basic sanitization: Ensure that imageId contains only alphanumeric characters
    const isValidId = /^[a-zA-Z0-9_-]+$/.test(imageId);  // Allows letters, numbers, hyphens, and underscores

    if (imageId && isValidId) {
        // Query Firestore for the document with imgId equal to the provided id
        await db.collection('ImageGen')
        .where('imgId', '==', imageId)
        .get()
        .then((querySnapshot) => {
            if (!querySnapshot.empty) {
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const imgUrl = data.Imgurl0; 
                    console.log(imgUrl)
                    if((!isMobileDevice) && (window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
                    {
                        spanAdjust(50);
                    }
                    
                    batchSize = 4;
                    imageDetailsParameters(data.ratio, data.theme, data.prompt, data.user, imgUrl, data.hashtags, data.hq, data.imgId);

                });
            } else {
                console.log('No document found with the provided imgId');
                spanAdjust(90);
            }
        })
        .catch((error) => {
            console.error('Error fetching document:', error);
        });
    } else {
        console.log('Invalid or missing id parameter in the URL');
    }
}






//   const [likes, ratio, theme, formatted_prompt, user, link, hashtags] = data;
async function imageDetailsParameters(ratio, theme, formatted_prompt, user, link, hashtags, hq, id) {
    
    
    const tagElement = document.getElementById("tag");
    const maskDisplayImage = document.getElementById("MaskdisplayImage");
    const rgbKineticSlider = document.getElementById("rgbKineticSlider");
    const promptDisplay = document.getElementById("PromptDisplay");
    const generationAspectRatio = document.getElementById("generationAspectRatio");
    const aspectRatioTileText = document.getElementById("aspectRatioTileText");
    const themeViewerText = document.getElementById("themeViewerText");
    const userCreditsName = document.getElementById("userCreditsName");
    const themeViewer = document.getElementById("themeViewer");
    const displayImageContainer = document.getElementById("galleryDisplayImage");
    const masonryContainer = document.getElementById("masonry");
    let masonryElement = document.querySelectorAll(".masonry-item");
    const qualityOfImage = document.getElementById("generationQualityText");
    displayImageContainer.style.filter = "blur(2px)";
    displayImageContainer.style.opacity = "0";
    aspectRatioTileText.style.filter = "blur(2px)";
    userCreditsName.style.filter = "blur(2px)";
    document.getElementById("downloadGalleryImage").setAttribute("data-id", link);
    document.getElementById("postShare").setAttribute("data-id", id);
    
    // Declare images array if needed
    let images = [];
    
    // Await color extraction from image link
    const majorityColor = await applyDominantColor(link);
    
    // Batch DOM updates to prevent layout thrashing
    tagElement.innerHTML = hashtags.map(tag => `<span>${tag}</span>`).join('');
    generationAspectRatio.innerHTML = ratio;
    aspectRatioTileText.innerHTML = ratio;
    promptDisplay.innerHTML = marked.parse(formatted_prompt); // Be careful with `marked.parse` to avoid XSS
    themeViewerText.innerHTML = theme;
    userCreditsName.innerHTML = user;
    themeViewer.style.background = `url("./CSS/IMAGES/THEMES/${theme.toLowerCase()}.jpeg")`;
    displayImageContainer.src = link;
    
    displayImageContainer.addEventListener("load", () => {
        setTimeout(() => { 
            displayImageContainer.style.filter = "blur(0px)";
            displayImageContainer.style.opacity = "1";
            aspectRatioTileText.style.filter = "blur(0px)";
            userCreditsName.style.filter = "blur(0px)";
        },1300);
    })
    qualityOfImage.innerHTML = hq ? "HQ" : "LQ";
    
            if((isMobileDevice == false) && ((window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches) == false))
                {    
                // Use MutationObserver to monitor the masonry container for changes
            const observer = new MutationObserver((mutationsList) => {
                for (let mutation of mutationsList) {
                    if (mutation.type === "childList" && masonryContainer.childElementCount > 0) {
                        // When child elements are added, apply class changes
                        masonryElement = document.querySelectorAll(".masonry-item");
                        masonryElement.forEach(element => {
                            element.classList.remove("expanded");
                            element.classList.add("contracted");
                        });
                    spanAdjust(50);
                    masonryContainer.style.width = "50%";
                    document.getElementById("samplePrompt").classList.add("contracted");
                    document.getElementById("progressBar").classList.add("contracted");
                
                
            }
        }
    });
}

    // Observe the masonry container for added child elements
    observer.observe(masonryContainer, { childList: true, subtree: true });

    // Update display classes
    maskDisplayImage.classList.add("displayInfo"); // Add only once
    document.getElementById("promptEngineering").style.display = "none";

}
function checkForParams()
{
    const urlParams = new URLSearchParams(window.location.search);
    const imageId = urlParams.get("id");
    if(imageId)
    {
        return true;
    }
}

document.getElementById("promtEngineeringSection").addEventListener("click", () => {
    document.getElementById("promptEngineering").style.display = "block";
});

document.getElementById("promptSectionBackButton").addEventListener("click", () => {
    document.getElementById("promptEngineering").style.display = "none";
})

document.getElementById("imageSectionBackButton").addEventListener("click", () => {
    if(document.getElementById("MaskdisplayImage").classList.contains("displayInfo"))
        {
            document.getElementById("MaskdisplayImage").classList.remove("displayInfo");
            document.getElementById("promptEngineering").style.display = "none";
            spanAdjust(90);
            updateButtonVisibility();
        }
})







// Add scroll event listener
masonry.addEventListener('scroll', () => {
    const scrollTop = masonry.scrollTop;
    const scrollHeight = masonry.scrollHeight;
    // Check if the user has scrolled to the bottom minus the 250px margin
    if ((scrollTop + masonry.clientHeight >= scrollHeight - 250) && !isFetching && availableBatches.length > 0) {
        console.log('User has reached the bottom of the masonry element (with 250px margin)');
        LoadButton.style.display = "block";
        LoadButton.classList.add("visible")
    }
    else 
    {
        LoadButton.classList.remove("visible")
    }
});

// Also check when the content changes (if applicable)
const observer = new MutationObserver(updateButtonVisibility);
observer.observe(masonry, { childList: true, subtree: true });
document.getElementById("loadMoreBtn").addEventListener("click", () => {
    batchSize = 20;
    fetchImages();
});

document.getElementById("downloadGalleryImage").addEventListener("click", () => {
    const link = document.getElementById("downloadGalleryImage").getAttribute("data-id");
    downloadBlob(link);
})
function downloadBlob(url) {
    fetch(url)
    .then(response => response.blob()) // Convert the response to a Blob
    .then(blob => {
        const blobUrl = URL.createObjectURL(blob); // Create an object URL from the blob
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = "elixpo-ai-generated-image.jpg"; // Set the file name
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl); // Revoke the object URL to free memory
        document.getElementById("NotifTxt").innerText = "Downloaded!";
        document.getElementById("savedMsg").classList.add("display");
        setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
        document.getElementById("NotifTxt").innerText = "Greetings!";
        }, 1500);
    })
    .catch(error => console.error('Download failed:', error));

}

document.getElementById("postShare").addEventListener("click", () => {
    const id = document.getElementById("postShare").getAttribute("data-id");
    let fullLink = (`https://circuit-overtime.github.io/Elixpo_ai_pollinations/gallery.html?id=${id}`);
    navigator.clipboard.writeText(fullLink).then(() => {
        console.log('Link copied to clipboard:', fullLink);
    }).catch(err => {
        console.error('Failed to copy link:', err);
    });
    document.getElementById("NotifTxt").innerText = "Link copied to clipboard";
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
        document.getElementById("NotifTxt").innerText = "Greetings!";
    }, 1500);
});

getQueryParam();
updateButtonVisibility();
initialize();
