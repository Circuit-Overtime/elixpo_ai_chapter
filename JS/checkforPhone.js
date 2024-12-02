

function checkforPhone() {
  var isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile) {
    document.body.insertAdjacentHTML('beforeend', '<div class="mobileViewport"></div>');
document.querySelector(".mobileViewport").style.cssText = " position: absolute; pointer-events: none; height: 100%; top: 0; left: 0; width: 100%; z-index: 1000; transition: 0.5s; opacity: 1; background: #161616; background: url(https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mobileUIguide.png?alt=media&token=123d6afa-ebab-48e5-a39f-9b52d0ab0099); background-size: 100%; background-repeat: no-repeat; backdrop-filter: blur(25px);"
  } else {
    document.querySelectorAll(".mobileViewport").forEach((elm) => {
      elm.remove();
    })
  }
}

window.addEventListener('resize', checkforPhone);
window.addEventListener('load', checkforPhone);
