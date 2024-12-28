let imageCount = 0; // Counter for the number of images received
let imagesData = []; // Array to store all image data
const VISIBLE_IMAGE_COUNT = 50; // Number of images to keep in the DOM at any time
let isLoading = false; // Flag to prevent multiple simultaneous loads

// Function to render visible images only
function renderVisibleImages() {
  const feedImageWrapper = document.getElementById('feedImageWrapper');

  // Render only the most recent VISIBLE_IMAGE_COUNT images
  const startIndex = Math.max(0, imagesData.length - VISIBLE_IMAGE_COUNT);

  for (let i = startIndex; i < imagesData.length; i++) {
    const imageData = imagesData[i];

    // Skip images already rendered (use a unique identifier to check)
    if (document.querySelector(`[data-id="${imageData.id}"]`)) continue;

    let node = document.createElement('div');
    node.className = 'feedContent';
    node.setAttribute('data-id', imageData.id); // Assign a unique ID
    node.innerHTML = `
      <img src="${imageData.imageURL}" class="loaded" />
      <div class="prompt">${imageData.prompt}</div>
    `;

    feedImageWrapper.appendChild(node);

    // Apply GSAP animation to the image
    const image = node.querySelector('img');
    gsap.from(image, {
      opacity: 0,
      filter: 'blur(10px)',
      duration: 0.8,
      ease: 'power3.out',
      onUpdate: function () {
        image.style.filter = `blur(${10 - 10 * this.progress()}px)`;
      },
    });

    // Apply GSAP animation to the prompt
    const prompt = node.querySelector('.prompt');
    gsap.from(prompt, {
      y: 20, // Slide up effect
      opacity: 0,
      duration: 0.6,
      delay: 0.5, // Start after the image animation begins
      ease: 'power3.out',
    });
  }
}

// Function to append new images to the data array
function appendImage(imageData) {
  // Ensure every image has a unique ID (if not already provided)
  if (!imageData.id) {
    imageData.id = `${Date.now()}-${Math.random()}`; // Generate a unique ID
  }

  imagesData.push(imageData);
  renderVisibleImages(); // Re-render to include new images
}

// Function to start listening for images
function startListening() {
  if (isLoading) return; // Prevent multiple simultaneous loads
  isLoading = true; // Set loading flag
  document.getElementById("loadMore").classList.add("hidden");

  const eventSource = new EventSource('https://image.pollinations.ai/feed');

  eventSource.onmessage = function (event) {
    const imageData = JSON.parse(event.data);
      appendImage(imageData);
      imageCount++;
  


    // Stop listening after 30 images
    if (imageCount >= 30) {
      eventSource.close();
      document.getElementById("loadMore").classList.remove("hidden");
      isLoading = false; // Reset loading flag
      imageCount = 0;
    }
  };

  // Handle connection errors (optional)
  eventSource.onerror = function () {
    eventSource.close();
    isLoading = false; // Reset loading flag
    document.getElementById("loadMore").classList.remove("hidden");
  };
}

// Attach the button click event listener
document.getElementById('loadMore').addEventListener('click', function (event) {
  event.preventDefault();
  startListening();
});

// Initial image load when the page loads
// startListening();

document.getElementById("homePage").addEventListener("click", function () {
  redirectTo("");
});

document.getElementById("visitGallery").addEventListener("click", function () {
  redirectTo("src/gallery");
});

document.getElementById("createArt").addEventListener("click", function () {
  redirectTo("src/create");
});

document.getElementById("closeStream").addEventListener("click", function () {
  redirectTo("src/feed");
});
