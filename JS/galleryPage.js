
let details = navigator.userAgent; 
let regexp = /android|iphone|kindle|ipad/i;
let isMobileDevice = regexp.test(details);

const masonry = document.getElementById('masonry'); // Replace with your element's ID
const LoadButton = document.getElementById('loadMoreBtn'); // Replace with your button's ID

function updateButtonVisibility() {
    const scrollHeight = masonry.scrollHeight;
    const clientHeight = masonry.clientHeight;

    // Check if the DOM is overflowing
    if ((scrollHeight <= clientHeight) && !isFetching && availableBatches.length > 0) {
        console.log("no overflow")
        LoadButton.style.display = "block";
        LoadButton.classList.add("visible")
    } else {
        // Overflow exists, hide the button
        LoadButton.style.display = 'none';
        LoadButton.classList.remove("visible");
    }
}


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
    updateButtonVisibility();

}

function spanAdjust(span = 90)
{
// Get the masonry element by its ID

let masonryElement = document.querySelectorAll(".masonry-item");
let currWidth = span || 90;

if(!isMobileDevice)
{
    if(currWidth == 90)
        {
            masonryElement.forEach(element => {
                element.classList.add("expanded");
                element.classList.remove("contracted");
                document.getElementById("masonry").style.width = "90%";
                document.getElementById("samplePrompt").classList.remove("contracted");
                document.getElementById("progressBar").classList.remove("contracted");
                localStorage.setItem("currWidth", 90);
            });
        
        }
        else if(currWidth == 50)
            {
                masonryElement.forEach(element => {
                    element.classList.remove("expanded");
                    element.classList.add("contracted");
                    document.getElementById("masonry").style.width = "50%";
                    document.getElementById("samplePrompt").classList.add("contracted");
                    document.getElementById("progressBar").classList.add("contracted");
                    localStorage.setItem("currWidth", 50);
                });
            }
}


}
setTimeout(() => {
    spanAdjust(90);
}, 3500);


const pressEsc = (event) => {
	if(event.key === "Escape"){
    	console.log("You pressed Esc button");
        if(document.getElementById("MaskdisplayImage").classList.contains("displayInfo"))
        {
            document.getElementById("MaskdisplayImage").classList.remove("displayInfo");
            document.getElementById("promptEngineering").style.display = "none";
            spanAdjust(90);
            updateButtonVisibility();
            
        }
    }
}



window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);
window.addEventListener("keydown", pressEsc)



// document.getElementById("aiArtCreate").addEventListener("click", () => {
//     location.replace("elixpoArtGenerator.html");
// });