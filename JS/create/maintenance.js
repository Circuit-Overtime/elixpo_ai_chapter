const scene = document.getElementById("scene");
const sceneValue = document.getElementById("scene-value");

let cameraX = 80;
const panSpeed = 0.15;
const panRange = 100;
let panDirection = 1;

function updateScene() {
  cameraX += panSpeed * panDirection;

  // Reverse direction when hitting the limits
  if (cameraX > panRange) {  // Changed >= to >
    panDirection = -1;
    cameraX = panRange;
  } else if (cameraX < 80) {  // Changed <= to < and -panRange to 0
    panDirection = 1;
    cameraX = 80;
  }

  scene.style.setProperty("--camera-x", cameraX - (panRange/2)); // Shift to center on zero
  

  requestAnimationFrame(updateScene);
}
const model = document.getElementById("wobbly-model");
let angleX = 45, angleY = 75, distance = 3; // Initial values

function updateWobble() {
    angleX += (Math.random() * 4 - 2); // Small random tilt in X-axis
    angleY += (Math.random() * 4 - 2); // Small random tilt in Y-axis
    distance += (Math.random() * 0.1 - 0.05); // Slight zoom in and out

    model.setAttribute("camera-orbit", `${angleX}deg ${angleY}deg ${distance}m`);
    requestAnimationFrame(updateWobble); // Smooth looping
}

function applyGlitchEffect() {
  angleX += (Math.random() * 6 - 3); // Small random X-axis shake
  angleY += (Math.random() * 6 - 3); // Small random Y-axis shake
  distance += (Math.random() * 0.2 - 0.1); // Slight zoom effect

  model.setAttribute("camera-orbit", `${angleX}deg ${angleY}deg ${distance}m`);

  if (Math.random() > 0.95) { // Random chance for strong glitch
      model.style.filter = "brightness(1.5) contrast(1.5) hue-rotate(90deg)";
      setTimeout(() => model.style.filter = "", 100);
  }

  requestAnimationFrame(applyGlitchEffect);
}

// applyGlitchEffect();
// updateWobble();
updateScene();

document.getElementById("visitCreateArt").addEventListener("click", () => {4
  redirectTo("");
});



document.addEventListener('DOMContentLoaded', () => {
    // GSAP Timeline
    const tl = gsap.timeline();

    // Animation for the Maintenance Text
    tl.fromTo(".maintenanceTextContainer", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" });

    // Animation for the Maintenance Description
    tl.fromTo(".maintenanceDescription", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.3"); // Slightly overlap with the previous animation

    // Animation for the Button
    tl.fromTo(".redirectBtn", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }, "-=0.2");

    // Animation for the 3D Model (Model Viewer)
    tl.fromTo("#wobbly-model", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, "-=0.4");

    // Animation for the Shapes (Symbols)
    tl.fromTo(".shape", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.05, ease: "back.out(1.3)" }, "-=0.3");

    // Animation for the Columns
    tl.fromTo(".column", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.03, ease: "power1.out" }, "-=0.2");


});