let isGenerating = false;
let blobs = [];
const retryLimit = 3;
let abortController;

const fallbackImages = [
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/ServerDownFeed%2Felixpo-ai-generated-image%20(52).jpg?alt=media&token=8b18e83b-0e36-4c08-96f2-773d853eada2",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/ServerDownFeed%2Felixpo-ai-generated-image%20(53).jpg?alt=media&token=9b7e1139-64cb-4ede-a1d1-3a25c00d5ad9",
];


const firebaseConfig = {
  apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
  authDomain: "elixpoai.firebaseapp.com",
  databaseURL: "https://elixpoai-default-rtdb.firebaseio.com",
  projectId: "elixpoai",
  storageBucket: "elixpoai.appspot.com",
  messagingSenderId: "718153866206",
  appId: "1:718153866206:web:671c00aba47368b19cdb4f",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Fetching Links from Firestore
async function fetchLinksFromFirestore(docId) {
  try {
    const linkRef = db.collection("Server").doc(docId);
    const doc = await linkRef.get();

    if (doc.exists) {
      const data = doc.data();
      if (data && typeof data.download_image === "string") {
        const imageDownloadLink = data.download_image;
        sessionStorage.setItem("imageDownloadLink", imageDownloadLink); 
        // console.log("Image Download Link:", imageDownloadLink);
        return imageDownloadLink;
      } else {
        throw new Error("Invalid data structure in Firestore document.");
      }
    } else {
      throw new Error("Document not found in Firestore.");
    }
  } catch (error) {
    console.console.warn("Error fetching links:", error);
    return null;
  }
}

// Sanitize Text
function sanitizeText(input) {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML; // Returns sanitized text
}

// Create the DOM Structure
async function createDOMStructure() {
  const generatingHolder = document.createElement("div");
  generatingHolder.className = "generatingHolder";
  generatingHolder.id = "generatingHolder";

  const starIcon = document.createElement("div");
  starIcon.id = "star-icon";
  const starImage = document.createElement("img");
  starImage.src = chrome.runtime.getURL("shines.png");
  starImage.alt = "star";
  starIcon.appendChild(starImage);

  const imageGenerationHolder = document.createElement("div");
  imageGenerationHolder.className = "imageGenerationHolder hidden";
  imageGenerationHolder.id = "imageGenerationHolder";

  const imageHolder = document.createElement("div");
  imageHolder.className = "imageHolder";

  const displayedImage = document.createElement("img");
  displayedImage.className = "displayedImage";
  displayedImage.id = "displayedImage";
  imageHolder.appendChild(displayedImage);

  const imageLoadingAnimation = document.createElement("div");
  imageLoadingAnimation.className = "imageLoadingAnimation hidden";
  imageLoadingAnimation.id = "imageLoadingAnimation";
  imageHolder.appendChild(imageLoadingAnimation);

  imageGenerationHolder.appendChild(imageHolder);

  const selectedText = document.createElement("p");
  selectedText.className = "selectedText";
  selectedText.id = "selectedText";
  imageGenerationHolder.appendChild(selectedText);

  const downloadButton = document.createElement("button");
  downloadButton.className = "downloadButton";
  downloadButton.id = "downloadButton";
  downloadButton.innerHTML = `
    <div class="button-overlay"></div>
    <span>Download</span>`;
  imageGenerationHolder.appendChild(downloadButton);

  const closeButton = document.createElement("button");
  closeButton.className = "closeButton";
  closeButton.id = "closeButton";
  closeButton.innerHTML = `
    <div class="button-overlay"></div>
    <span>Close</span>`;
  imageGenerationHolder.appendChild(closeButton);

  generatingHolder.appendChild(starIcon);
  generatingHolder.appendChild(imageGenerationHolder);

  document.body.appendChild(generatingHolder);

  // Add download and close button logic
  document.getElementById("downloadButton").addEventListener("click", () => {
    if (blobs.length > 0) {
      const blob = blobs[0]; // Assuming the first blob is the one to download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "generated_image.png"; // Set the desired file name
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); // Clean up the object URL
      resetExtension();
    } else {
      console.error("No image to download.");
    }
  });

  document.getElementById("closeButton").addEventListener("click", () => {
    isGenerating = false;
    resetExtension();
  });

  return generatingHolder;
}

async function retryFetch(url, options, retries = retryLimit, delay = 1000, signal) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal });
      if (response.ok) return response;
    } catch (error) {
      if (signal.aborted) {
        console.warn("Fetch request aborted.");
        throw new Error("Aborted by user.");
      }
      console.error(`Attempt ${attempt + 1} failed:`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1))); // Exponential backoff
  }
  console.warn("Max retries reached for fetching.");
  throw new Error("Failed to fetch after retries.");
}

async function generateImage(imageUrl, downloadUrl, signal) {
  try {
    const response = await retryFetch(
      `${downloadUrl}/download-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl }),
      },
      retryLimit,
      1000,
      signal // Pass the signal
    );

    const data = await response.json();
    const base64 = data.base64;
    const url = `data:image/png;base64,${base64}`;
    const blob = await fetch(url, { signal }).then((res) => res.blob()); // Add signal to blob fetch
    blobs.push(blob);
    return blobs;
  } catch (error) {
    if (signal.aborted) {
      console.warn("Image generation request aborted.");
    } else {
      console.error("Error generating image:", error);
    }
    throw error;
  }
}


function resetExtension() {
  if (abortController) abortController.abort(); // Abort ongoing requests
  blobs = [];
  isGenerating = false;
  document.getElementById("imageLoadingAnimation").classList.add("hidden");
  document.getElementById("imageGenerationHolder").classList.add("hidden");
  document.getElementById("displayedImage").src = "";
  document.getElementById("selectedText").innerText = "";
  setTimeout(() => {
    document.getElementById("generatingHolder").style.display = "none";
    isGenerating = false;
  }, 1000);
}

// Main Event Listener
document.addEventListener("mouseup", async (event) => {
  let selectedText = "";
  if (isGenerating) return;

  const selection = window.getSelection();
  selectedText = selection?.toString().trim();
  if (selectedText) {
    const sanitizedText = sanitizeText(selectedText);
    
    const generatingHolder = document.getElementById("generatingHolder") || (await createDOMStructure());

    // Position the generating holder near the selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    generatingHolder.style.position = "absolute";
    generatingHolder.style.left = `${rect.left + window.scrollX - 20}px`;
    generatingHolder.style.top = `${rect.top + window.scrollY + 5}px`;
    generatingHolder.style.display = "block";

    const selectedTextElement = generatingHolder.querySelector(".selectedText");
    selectedTextElement.textContent = `${sanitizedText.slice(0, 40)}...`;

    // Handle Star Icon Click
    const starIcon = document.getElementById("star-icon");
    starIcon.addEventListener("click", async () => {
  if (isGenerating) return;
  isGenerating = true;
  abortController = new AbortController(); // Create a new AbortController
  const signal = abortController.signal; // Get the signal from AbortController
  document.getElementById("imageLoadingAnimation").classList.remove("hidden");
  document.getElementById("imageGenerationHolder").classList.remove("hidden");

  const model = Math.random() < 0.5 ? "flux" : "boltning";
  const seed = Math.floor(Math.random() * (1000000 - 1000 + 1)) + 1000;
  const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(
    selectedText
  )}?width=1024&height=768&seed=${seed}&model=${model}&nologo=1&enhance=false&private=false`;

  const downloadUrl =
    sessionStorage.getItem("imageDownloadLink") || (await fetchLinksFromFirestore("servers"));

  try {
    const blobs = await generateImage(imageUrl, downloadUrl, signal); // Pass the signal
    const blobUrl = URL.createObjectURL(blobs[0]);
    const displayedImage = document.getElementById("displayedImage");
    displayedImage.src = blobUrl;
    displayedImage.onload = () => URL.revokeObjectURL(blobUrl);
  } catch (error) {
    if (!signal.aborted) {
      const fallbackImage = fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
      const displayedImage = document.getElementById("displayedImage");
      displayedImage.src = fallbackImage;
      displayedImage.onload = () => document.getElementById("imageLoadingAnimation").classList.add("hidden");
    }
  } finally {
    if (!signal.aborted) {
      document.getElementById("imageLoadingAnimation").classList.add("hidden");
    }
  }
});
  }
  else 
  {
    if(isGenerating) return;
    else 
    {
      const generatingHolder = document.getElementById("generatingHolder");
      if(generatingHolder)
      {
        generatingHolder.style.display = "none";
      }
    }
    
  }
});
