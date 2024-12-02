const icons = ["camera","earth", "locate", "apps", "basketball"];
const track = document.getElementById("image-track");



const handleOnUp = () => {
  track.dataset.mouseDownAt = "0";  
  track.dataset.prevPercentage = track.dataset.percentage;
}

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

let handleOnMoveImageTrack = e => {
  if(track.dataset.mouseDownAt === "0") return;
  
  const mouseDelta = parseFloat(track.dataset.mouseDownAt) - e.clientX,
        maxDelta = window.innerWidth / 2;
  
  const percentage = (mouseDelta / maxDelta) * -100,
        nextPercentageUnconstrained = parseFloat(track.dataset.prevPercentage) + percentage;
        // nextPercentage = Math.max(Math.min(nextPercentageUnconstrained, 0), -100);


        


}

        
setInterval(() => {
    const nextPercentage = (-randomIntFromInterval(20,90));
    track.dataset.percentage = nextPercentage;
    track.animate({
     transform: `translate(${nextPercentage/17}%, -50%)`
   }, { duration: 1200, fill: "forwards" });
     
for(const image of track.getElementsByClassName("StaticImageLoading")) {
image.animate({
objectPosition: `${100 + nextPercentage}% center`
}, { duration: 1200, fill: "forwards" });
}
 }, 2500);

/* -- Had to add extra lines for touch events -- */


window.onload = (e) => {
  handleOnMoveImageTrack();
};


window.addEventListener('load', function() {
    // Your code to be executed after all resources are fully loaded
    // console.log('Hello! All resources are loaded, and the document is ready for display.');
  
    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "100px";
    }, 500);
    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "169px";
    }, 700);

    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "253px";
    }, 900);

    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "550px";
    }, 1500);
    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "650px";
    }, 1900);
    setTimeout(() => {
      document.getElementById("timeLineSeek").style.left = "730px";
    }, 2100);

    
    document.getElementById("iconsRelay").style.opacity = "1";
    ScrollReveal().reveal('.iconsRelay', { scale: 0.25, delay: 2300});
    
    setTimeout(() => {

      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "camera");
      },300)
      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "earth");
      },600)
      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "locate");
      },900)
      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "apps");
      },1200)
      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "basketball");
      },1500)
      setTimeout(() => {
        document.getElementById("loadingAnimationIcons").setAttribute("name", "aperture");
      },1800)
     
    }, 2200);

    setTimeout(() => {
      // document.getElementById("mainContainer").style.opacity = "1";
      document.getElementById("iconsRelay").style.opacity = "0";
      document.getElementById("loadingOverlay").style.opacity = "0";
      document.getElementById("loadingOverlay").style.display = "none";
      // ScrollReveal().reveal('.ParticleContainerSlow', { delay: 200 });
      
    }, 5000);

    setTimeout(() => {
      document.getElementById("loadingOverlay").style.display = "none";
    }, 7200);


});
