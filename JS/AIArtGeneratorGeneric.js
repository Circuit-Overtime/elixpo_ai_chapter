
const promptTextInput = document.getElementById("promptTextInput");
const combinations = [
    { configuration: 1, roundness: 1 },
    { configuration: 1, roundness: 2 },
    { configuration: 1, roundness: 4 },
    { configuration: 2, roundness: 2 },
    { configuration: 2, roundness: 3 },
  
  ];
  let prev = 0; //counts iteratiuons for the boxes
  const randomTile = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

document.getElementById('enhanceSwitch').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById("textForAIPrompt").innerHTML = "AI Prompt Enhancement is Active (Slower)";
    } else {
        document.getElementById("textForAIPrompt").innerHTML = "AI Prompt Enhancement is In-active (Faster)";
    }
});


document.getElementById('privateSwitch').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById("privatePublicResultDesc").innerText = "The Image you Generate will be Displayed in the Server Gallery (Public)";
    } else {
        document.getElementById("privatePublicResultDesc").innerText = "The Image you Generate will not be Displayed in the Server Gallery (Private)";
    }
});

promptTextInput.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
    document.getElementById("samplePrompt").style.height = (this.scrollHeight + 12) + "px";
    
  });

  setInterval(() => {
      if (promptTextInput.value.length == 0)
          {
              promptTextInput.style.height = "45px";
              document.getElementById("samplePrompt").style.height = "60px";
          }
  }, 1200);



  const wrapper = document.getElementById("wrapper");

  document.getElementById("loginButton").addEventListener("click", function() {
    redirectTo("src/auth");
  });
  document.getElementById("navBarDocs").addEventListener("click", function() {
    redirectTo("src/blogs/elixpo_art");
  });

const uniqueRand = (min, max, prev) => {
  let next = prev;
  
  while(prev === next) next = randomTile(min, max);
  
  return next;
}



setInterval(() => {
  const index = uniqueRand(0, combinations.length - 1, prev),
        combination = combinations[index];
  
  wrapper.dataset.configuration = combination.configuration;
  wrapper.dataset.roundness = combination.roundness;
  
  prev = index;
},1000);



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







window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);
