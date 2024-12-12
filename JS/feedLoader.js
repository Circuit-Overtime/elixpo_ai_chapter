let imageCount = 0; // Counter for the number of images received

// Function to append new images
function appendImage(imageData) {
  const feedImageWrapper = document.getElementById('feedImageWrapper');
  let node = `
    <div class="feedContent">
    <img src = "${imageData.imageURL}" class="loaded" />
    <div class = "prompt">${imageData.prompt}</div>
    </div>
    `;
  feedImageWrapper.innerHTML += (node);
}

// Function to start listening for 10 images
function startListening() {
    console.log("loading")
     document.getElementById("loadMore").classList.add("hidden");
const eventSource = new EventSource('https://image.pollinations.ai/feed');
   
  imageCount = 0; // Reset counter when the button is clicked

  eventSource.onmessage = function(event) {
    const imageData = JSON.parse(event.data);

    // Append the image to the container
    appendImage(imageData);

    // Increment the image counter
    imageCount++;

    // Stop listening after 10 images
    if (imageCount >= 20) {
      eventSource.close();
      document.getElementById("loadMore").classList.remove("hidden");
    }
  };

  document.getElementById('feedImageWrapper').scrollTo({
    top: document.getElementById('feedImageWrapper').scrollHeight,
    behavior: 'smooth'
});
}

// Attach the event listener to the button
document.getElementById('loadMore').addEventListener('click', startListening);
startListening();



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