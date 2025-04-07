
// makes the gsap loader active and then trigegrs the preloader and the living hsape loader 
// document.getElementById("welcomeScreen").classList.add("hidden");
// document.getElementById("preLoader").classList.remove("hidden");


document.getElementById("feedStart").addEventListener("click", function () {
    document.getElementById("preLoader").classList.add("hidden");
    setTimeout(() => {
      document.getElementById("container").classList.remove("hidden");
      document.getElementById("controls").classList.remove("hidden");
    }, 1000);

    setTimeout(() => {
        startListening();
    }, 1000);
});

window.onload = function () {
  scaleContainer();
    document.getElementById("patternContainer").classList.add("hidden");
    const hulu = new SplitText("#hulu-text"),
      originals = new SplitText("#originals-text");

      const t1 = new gsap.timeline({
        onComplete: () => {
          // This code runs after the timeline completes
          document.getElementById("bg").classList.remove("hidden");
          document.getElementById("preLoader").classList.remove("hidden");
          document.querySelector(".welcomeScreen").classList.add("hidden");
        },
      });

    t1.from(["#top-gradient", "#bottom-gradient"], 0.7, { ease: "power3.inOut", filter: "blur(0px)", opacity: 0 })
    .from("#green-filter", 0.8, { opacity: 0, scale: 3 }, "-=50%")
    .to("#green-filter", 0.25, { opacity: 0, scale: 3 })
    .to(["#top-gradient", "#bottom-gradient"], 0.3, { filter: "blur(0px)", opacity: 0 }, "-=100%")
    .set("#logo", { opacity: 1 })
    .from(hulu.chars, 0.2, { ease: "back", filter: "blur(0.3em)", opacity: 0, scale: 1.5, stagger: 0.02 })
    .from(originals.chars, 0.2, { delay: 0.25, filter: "blur(0.3em)", opacity: 0, scale: 0.5, stagger: 0.02, xPercent: -25 })
    .from("#logo-border", 0.4, { ease: "power3.out", opacity: 0, scale: 0.75 }, "-=100%")
    .from("#logo-border-inner", 0.4, { ease: "power3.out", scale: 0.75 }, "-=100%")
    .to("#logo", 1.5, { scale: 1.1 }, "-=20%")
    .to(["#logo-border", "#logo-border-inner"], 1.5, { ease: "power3.out", scale: 1.1 }, "-=100%")
    .to("#logo-border", 1.25, { ease: "power4.in", scale: 8 }, "-=50%")
    .to("#logo-border-inner", 0.5, { ease: "power4.in", scale: 8 }, "-=60%")
    .to("#logo", 0.25, { opacity: 0, scale: 1.2 }, "-=50%");

}



function scaleContainer() {
  if((!window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
  {

  const container = document.querySelector('.mainContainer');
  const containerWidth = 1519;
  const containerHeight = 730;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  // Calculate scale factors for both width and height
  const scaleWidth = windowWidth / containerWidth;
  const scaleHeight = windowHeight / containerHeight;

  // Use the smaller scale factor to ensure the container fits in the viewport
  const scale = Math.min(scaleWidth, scaleHeight);

  // Apply the scale transform
  container.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
}

window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);









// EXAMPLES IMG TO CHECK ASPECT RATION ISSUE ---- SOLVED U CAN REMOVE IT

// // Initial setup to scale the container and set up listeners
// window.onload = function () {
//   scaleContainer();
//   document.getElementById("patternContainer").classList.add("hidden");
//   const hulu = new SplitText("#hulu-text"),
//       originals = new SplitText("#originals-text");

//   const t1 = new gsap.timeline({
//       onComplete: () => {
//           document.getElementById("bg").classList.remove("hidden");
//           document.getElementById("preLoader").classList.remove("hidden");
//           document.querySelector(".welcomeScreen").classList.add("hidden");
//       },
//   });

//   t1.from(["#top-gradient", "#bottom-gradient"], 0.7, {
//       ease: "power3.inOut",
//       filter: "blur(0px)",
//       opacity: 0,
//   })
//       .from("#green-filter", 0.8, { opacity: 0, scale: 3 }, "-=50%")
//       .to("#green-filter", 0.25, { opacity: 0, scale: 3 })
//       .to(["#top-gradient", "#bottom-gradient"], 0.3, { filter: "blur(0px)", opacity: 0 }, "-=100%")
//       .set("#logo", { opacity: 1 })
//       .from(hulu.chars, 0.2, {
//           ease: "back",
//           filter: "blur(0.3em)",
//           opacity: 0,
//           scale: 1.5,
//           stagger: 0.02,
//       })
//       .from(originals.chars, 0.2, {
//           delay: 0.25,
//           filter: "blur(0.3em)",
//           opacity: 0,
//           scale: 0.5,
//           stagger: 0.02,
//           xPercent: -25,
//       });
// };

// // Function to scale the container based on window size
// function scaleContainer() {
//   if (!window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches) {
//       const container = document.querySelector(".mainContainer");
//       const containerWidth = 1519;
//       const containerHeight = 730;
//       const windowWidth = window.innerWidth;
//       const windowHeight = window.innerHeight;

//       const scaleWidth = windowWidth / containerWidth;
//       const scaleHeight = windowHeight / containerHeight;

//       const scale = Math.min(scaleWidth, scaleHeight);
//       container.style.transform = `translate(-50%, -50%) scale(${scale})`;
//   }
// }

// // Dynamic image loading from Unsplash
// const feedWrapper = document.getElementById("feedImageWrapper");

// // Predefined Unsplash images with various aspect ratios
// const imageUrls = [
//   "https://images.unsplash.com/photo-1729731322082-c0a7c32229aa?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHw0fHx8ZW58MHx8fHx8",       
//   "https://images.unsplash.com/photo-1683491753112-604719ba1797?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHw4fHx8ZW58MHx8fHx8", 
//   "https://images.unsplash.com/photo-1726266852957-b1549c5c9fcb?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHwxNHx8fGVufDB8fHx8fA%3D%3D", 
//   "https://images.unsplash.com/photo-1729717069574-e25f4bb69d87?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHwxNnx8fGVufDB8fHx8fA%3D%3D",
// ];

// // Append predefined images to the grid
// function loadImages() {
//   imageUrls.forEach((url) => {
//       const img = document.createElement("img");
//       img.src = url;
//       img.alt = "Unsplash Image";
//       img.classList.add("loading");
//       img.onload = () => {
//           img.classList.add("loaded");
//       };
//       feedWrapper.appendChild(img);
//   });
// }

// // Trigger image loading when the feed starts or "Load More" is clicked
// document.getElementById("feedStart").addEventListener("click", function () {
//   document.getElementById("preLoader").classList.add("hidden");
//   setTimeout(() => {
//       document.getElementById("container").classList.remove("hidden");
//       document.getElementById("controls").classList.remove("hidden");
//       loadImages(); // Load images on feed start
//   }, 1000);
// });

// document.getElementById("loadMore").addEventListener("click", loadImages);

// // Scale container on window resize
// window.addEventListener("resize", scaleContainer);
