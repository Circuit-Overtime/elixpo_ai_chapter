const firebaseConfig = {
  apiKey: "AIzaSyAlwbxxxxxxxxx",
  authDomain: "elixxxxxxx",
  projectId: "elixpxxxx",
  storageBucket: "elixpxxxxxx",
  messagingSenderId: "718153xxxxxxx",
  appId: "1:71815386620xxxx"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let lastPromptText = "";

window.onload = function() {
  setInterval(() => {
    if (localStorage.getItem("ElixpoAIUser") == null) {
        redirectTo("src/auth/?notify=true"); //root hompage redirect
    }
  }, 1000);
}


let randomLogos = 
[
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F1.jpeg?alt=media&token=01b96c7a-2ff4-4f7b-99e4-80f510315bb2",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F2.jpeg?alt=media&token=ace5b321-0c49-4b8c-912e-3d51ceb81545",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F3.jpeg?alt=media&token=41f1a76b-c1fc-476e-9156-570a8165d2c0",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F4.jpeg?alt=media&token=94e0f9b5-a1c3-4aa3-9fa7-239c1b08f983",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F5.jpeg?alt=media&token=d363bee4-01bc-4b8d-b90d-6e31a98c2bad",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F6.jpeg?alt=media&token=50c05867-0050-4d89-9c27-cb5040605d6d",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F7.jpeg?alt=media&token=4884744b-1c4d-46de-a245-5f96f344e268",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F8.jpeg?alt=media&token=6c50ad97-63ac-4bf8-9ac0-acf9c5ba0ca8",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F9.jpeg?alt=media&token=47923f1f-516a-4263-a613-d144e3ef6eb9",
  "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F10.jpeg?alt=media&token=88686e4f-c02c-4937-af00-3a471b7cf574"
]

const userInfo = document.getElementById('userInfo');
const randomLogo = randomLogos[Math.floor(Math.random() * randomLogos.length)];
userInfo.style.backgroundImage = `url(${randomLogo})`;
document.getElementById("username").innerText = localStorage.getItem("ElixpoAIUser").slice(0, 6)+".." || "Guest";

const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];


diceIcon.addEventListener('click', () => {
  diceIcon.classList.add('click-effect');
  setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

  diceIcon.classList.remove(diceClasses[generationNumber - 1]);
  generationNumber = (generationNumber % diceClasses.length) + 1;
  diceIcon.classList.add(diceClasses[generationNumber - 1]);
});


document.getElementById("privateBtn").addEventListener("click", function() 
{
  privateMode = !privateMode;
  if (privateMode) {
    document.getElementById("privateBtn").classList.add("selected");
    notify("Images will be now private! No Server Inference");
  }
  else 
  {
    document.getElementById("privateBtn").classList.remove("selected");
  }
});
document.getElementById("pimpPrompt").addEventListener("click", function()
{
  enhanceMode = !enhanceMode;
  if (enhanceMode) {
    document.getElementById("pimpPrompt").classList.add("selected");
    notify("Pimped prompt mode enabled");
  }
  else 
  {
    document.getElementById("pimpPrompt").classList.remove("selected");
  }
});

document.querySelectorAll(".qualitySelection > .imageQuality").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".imageQuality").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    selectedImageQuality = this.getAttribute("data-quality");
  });
});

document.getElementById("promptIdea").addEventListener("click", function() {
  const randomIndex = Math.floor(Math.random() * prompts.length);
  document.getElementById("promptTextInput").value = prompts[randomIndex];
  const event = new Event("input", {bubbles: true});
  document.getElementById("promptTextInput").dispatchEvent(event);
  
});


// let imageGeneratorTop = document.getElementById("imageDisplay").getBoundingClientRect().top - 60;
// document.querySelector(".sectionContainer").scrollTo({ top: imageGeneratorTop});


document.querySelector(".sectionContainer").addEventListener("scroll", function(e) {
  e.preventDefault();
});

document.getElementById("redirectHome").addEventListener("click", function() {
  redirectTo("");
});
document.getElementById("redirectBlogs").addEventListener("click", function() {
  redirectTo("blogs/elixpo_art");
});
document.getElementById("redirectGitHub").addEventListener("click", function() {
  location.href = ("https://github.com/Circuit-Overtime/elixpo_ai_chapter")
});
document.getElementById("userCell").addEventListener("click", function() {
  redirectTo("src/auth");
});
document.getElementById("appName").addEventListener("click", function() {
  location.reload();
});

function notify(msg, persist = false) {
  const notif = document.getElementById("notification");
  const notifText = document.getElementById("notifText");

  notifText.innerText = msg;
  notif.classList.add("display");

  // If not persistent, auto-remove after 3 seconds
  if (!persist) {
      setTimeout(() => {
          notif.classList.remove("display");
      }, 3000);
  }
}
function dismissNotification() {
  document.getElementById("notification").classList.remove("display");
}



document.querySelectorAll(".themes").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".themes").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    imageTheme = this.getAttribute("data-theme");
    document.getElementById("themeShowCaseHolder").style.background = `url(../../CSS/IMAGES/PREVIEW_IMAGES/${this.getAttribute("data-theme")}_preview.JPG)`;
    document.getElementById("themeShowCaseHolder").style.backgroundSize = "cover";
  });
});

document.querySelectorAll(".ratios").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".ratios").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    ratio = this.getAttribute("data-ratio");
  });
});


document.querySelectorAll(".models").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".models").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    model = this.getAttribute("data-model");
  });
});




document.getElementById("promptTextInput").addEventListener("input", debounce(handleInput, 100));
document.getElementById("promptTextInput").addEventListener("keydown", debounce(handleInput, 100));

function handleInput() {
    const promptText = document.getElementById("promptTextInput").value;

    // Check --en flag
    if (promptText.includes("--en") || lastPromptText.includes("--en")) {
        const isEnabled = promptText.includes("--en");
        toggleClass(isEnabled, "pimpPrompt", "selected");
        enhanceMode = isEnabled;
    }

    // Check --pv flag
    if (promptText.includes("--pv") || lastPromptText.includes("--pv")) {
        const isPrivate = promptText.includes("--pv");
        toggleClass(isPrivate, "privateBtn", "selected");
        privateMode = isPrivate;
    }

    // Quality flags: only update if any is present or was present
    const qualityFlags = ["--ld", "--sd", "--hd"];
    if (qualityFlags.some(flag => promptText.includes(flag)) || qualityFlags.some(flag => lastPromptText.includes(flag))) {
        const qualityMap = {
            "--ld": "qualitySelection_LD",
            "--sd": "qualitySelection_SD",
            "--hd": "qualitySelection_HD"
        };
        let selectedQuality = Object.keys(qualityMap).find(flag => promptText.includes(flag)) || "--sd";
        updateSelection(".imageQuality", qualityMap[selectedQuality]);
    }

    // Aspect ratio
    handleSelectiveFlagUpdate("--ar", ".aspectRatioTiles", "ratio", "4:3");

    // Theme
    handleSelectiveFlagUpdate("--th", ".themes", "theme", "normal");

    // Model
    handleSelectiveFlagUpdate("--md", ".modelsTiles", "model", "core");

    // Update last prompt
    lastPromptText = promptText;
}

// Only update if new flag is added or removed
function handleSelectiveFlagUpdate(flag, selector, dataAttr, defaultValue) {
    const currentText = document.getElementById("promptTextInput").value;
    const lastText = lastPromptText;

    if (currentText.includes(flag) || lastText.includes(flag)) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.classList.remove("selected"));

        const match = currentText.match(new RegExp(`${flag}\\s([\\w-:]+)`));
        const selectedValue = match ? match[1] : defaultValue;

        const element = [...elements].find(el => el.dataset[dataAttr] === selectedValue);
        if (element) element.classList.add("selected");
    }
}

// Toggle helper
function toggleClass(condition, elementId, className) {
    const element = document.getElementById(elementId);
    if (element) element.classList.toggle(className, condition);
}

// Selection update
function updateSelection(selector, selectedId) {
    document.querySelectorAll(selector).forEach(el => el.classList.remove("selected"));
    const element = document.getElementById(selectedId);
    if (element) element.classList.add("selected");
}

// Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const container = document.querySelector(".sectionContainer");

// Prevent scroll via wheel (mouse wheel, trackpad, etc.)
container.addEventListener("wheel", function (e) {
  e.preventDefault();
}, { passive: false }); // ⚠️ important: passive must be false to allow preventDefault

// Prevent middle mouse button scroll
container.addEventListener("mousedown", function (e) {
  if (e.button === 1) { // Middle mouse button
    e.preventDefault();
    return false; // Just in case
  }
});
