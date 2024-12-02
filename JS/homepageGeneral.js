
const firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const storage = firebase.storage();

const prompts = [
    "a cute crystal dog fakemon with glowing eyes",
    "a dragon breathing fire in the night sky",
    "a magical forest with glowing mushrooms",
    "a cyberpunk city with flying cars",
    "a samurai standing on a hill with cherry blossoms",
    "a spaceship traveling through a wormhole",
    "a robot with a holographic interface",
    "a fantasy castle surrounded by waterfalls",
    "a superhero flying over a futuristic city",
    "a beach at sunset with bioluminescent waves",
    "a mystical mountain with a dragon's lair",
    "a steampunk airship sailing through the clouds",
    "a witch casting a spell in a dark forest",
    "a knight in shining armor riding a horse",
    "a unicorn prancing in a magical meadow"
];

let promptIndex = 0;
const typewriterElement = document.getElementById('searchText');

window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);



function typeWriterEffect(text, i, callback) {
    if (i < text.length) {
        typewriterElement.innerHTML = text.substring(0, i + 1);
        setTimeout(function() {
            typeWriterEffect(text, i + 1, callback);
        }, 20);
    } else if (typeof callback === 'function') {
        setTimeout(callback, 1200); // Wait 1200ms before clearing and moving to next prompt
    }
}

function startTypewriterAnimation() {
    typeWriterEffect(prompts[promptIndex], 0, function() {
        setTimeout(function() {
            typewriterElement.innerHTML = '';
            promptIndex = (promptIndex + 1) % prompts.length;
            startTypewriterAnimation();
        }, 500); // Delay before erasing and starting next prompt
    });
}

document.getElementById("sitecontent").scrollTop = 0;


document.getElementById("sitecontent").addEventListener("scroll", function() {
    scrollAmt = document.getElementById("sitecontent").scrollTop;
    // console.log(scrollAmt)
    if(scrollAmt >= 472)
    {
            document.getElementById("upperNavBar").classList.remove("hidden");
            document.getElementById("aiArtCreate").classList.add("blur");
            document.getElementById("aiArtDocs").classList.add("blur");
            document.getElementById("elixpoOfficialLogoBacklit").classList.remove("hidden");
            document.getElementById("elixpoOfficialLogoMask").classList.remove("hidden");
    }
    else if(scrollAmt <= 472)
    {
        document.getElementById("upperNavBar").classList.add("hidden");
        document.getElementById("aiArtCreate").classList.remove("blur");
        document.getElementById("aiArtDocs").classList.remove("blur");
        document.getElementById("elixpoOfficialLogoBacklit").classList.add("hidden");
        document.getElementById("elixpoOfficialLogoMask").classList.add("hidden");
    }
})

startTypewriterAnimation();


const scrollContent_right = document.getElementById('sampleImage_content_right');
const images_right = scrollContent.children;
const imageWidth_right = 200;
const spacing_right = 20;
const totalWidth_right = (imageWidth + spacing) * images.length;

function scrollImages_right() {
    scrollContent.style.transition = 'transform 1s linear';
    scrollContent.style.transform = `translateX(${imageWidth + spacing}px)`;
    
    setTimeout(() => {
        scrollContent.style.transition = 'none';
        scrollContent.style.transform = 'translateX(0)';
        const firstImage = scrollContent.firstElementChild;
        scrollContent.appendChild(firstImage.cloneNode(true));
        scrollContent.removeChild(firstImage);
    }, 1000);
}

setInterval(scrollImages_right, 1000);


const scrollContent_left = document.getElementById('sampleImage_content_left');
const images_left = scrollContent.children;
const imageWidth_left = 200;
const spacing_left = 20;
const totalWidth_left = (imageWidth + spacing) * images.length;

function scrollImages_right() {
    scrollContent.style.transition = 'transform 1s linear';
    scrollContent.style.transform = `translateX(${imageWidth + spacing}px)`;
    
    setTimeout(() => {
        scrollContent.style.transition = 'none';
        scrollContent.style.transform = 'translateX(0)';
        const firstImage = scrollContent.firstElementChild;
        scrollContent.appendChild(firstImage.cloneNode(true));
        scrollContent.removeChild(firstImage);
    }, 1000);
}

setInterval(scrollImages_right, 1000);




function scaleContainer() {
    if((!window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
    {
 
    const container = document.querySelector('.container');
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

