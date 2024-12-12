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
 const db = firebase.firestore();

 function typeWriterHTML(idOfTextHolder, textToType, speed, callback) {
   var i = 0;
   var speed = speed || 25; // Default speed if not provided
   document.getElementById(idOfTextHolder).innerText = "";
   
   function type() {
       if (i < textToType.length) {
           document.getElementById(idOfTextHolder).innerHTML += textToType.charAt(i);
           i++;
           setTimeout(type, speed);
       } else if (i === textToType.length) {
           if (typeof callback === 'function') {
               callback(); // Call the callback when typing is done
           }
       }
   }
   
   type(); // Start the typing effect
}



function notify(msg) {
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("NotifTxt").innerText = msg;
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
        document.getElementById("NotifTxt").innerText = "";
    }, 3500);
}




 window.onload = () => {

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('notify') === "true") {
        notify("Sign-in as Guest/GitHub/Google to Continue!");
    }


      if(localStorage.getItem("ElixpoAIUser") !== null) {
         document.getElementById("form_logout").classList.remove("hidden");
         document.getElementById("form_login").classList.add("hidden");
         document.getElementById("form_register").classList.add("hidden");
      }
      else
      {

        
         document.getElementById("form_logout").classList.add("hidden");
         document.getElementById("form_login").classList.remove("hidden");
         document.getElementById("form_register").classList.add("hidden");
      }
}






document.getElementById("terminalClose").addEventListener("click", () => {
   document.getElementById("userNameGuest").style.display = "none";
   document.getElementById("usernameGuestInput").value = "";
   
})

document.querySelectorAll("img").forEach((img) => { 
   img.addEventListener("load", () => { 
      img.classList.remove("blur");
   });
});

document.getElementById("signUpFormBtn").addEventListener("click", () => {
  document.getElementById("form_register").classList.add("hidden");
   document.getElementById("form_login").classList.remove("hidden"); 
})

document.getElementById("signInFormBtn").addEventListener("click", () => {
   document.getElementById("form_login").classList.add("hidden");
    document.getElementById("form_register").classList.remove("hidden"); 
 })



document.getElementById("logoutBtn").addEventListener("click", () => {
   localStorage.removeItem("ElixpoAIUser");
   localStorage.removeItem("metadataCache");
   localStorage.removeItem("currWidth");
   localStorage.removeItem("guestLogin");
   
   document.getElementById("form_logout").classList.add("hidden");
   document.getElementById("form_register").classList.add("hidden");
   document.getElementById("form_login").classList.remove("hidden");
})

document.getElementById("readDocs").addEventListener("click", () => {
   redirectTo("");
});

document.getElementById("visitGallery").addEventListener("click", () => {
    redirectTo("src/gallery");
});
document.getElementById("reDirectPage").addEventListener("click", () => {
    redirectTo("src/create");
});


document.getElementById("passwordShowHideSignInPassword").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signInPassword");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
});


document.getElementById("passwordShowHideSignUpPassword").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signupPsswd");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
});



document.getElementById("passwordShowHideSignUpPasswordConf").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signupPsswdConf");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
});



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

document.getElementById("usernameGuestInput").addEventListener("keypress", function(event) {
    if(event.key == "Enter")
    {
        event.preventDefault();
        var today  = new Date();
        var date = today.getDate() + "/" + (today.getMonth()+1) + "/" + today.getFullYear() ; //gives the  current date to the system
        let timestamp = new Date().getTime();
        if((this.value.trim() !== "") && this.value.length >= 3 && (/^[a-zA-Z]+$/g).test(this.value))
        {
            
            document.getElementById("userAcceptance").style.color = "white";
            typeWriterHTML("userAcceptance", "namespace --accepted", 50, function() {
                console.log("fifth typing complete!");
            });
            document.getElementById("usernameGuestInput").style.pointerEvents = "none";
            document.getElementById("usernameGuestInput").style.color = "#555";
            db.collection('guests').doc(this.value.toLowerCase()+timestamp).set({
                username: this.value,
                date: date
            })
            .then(() => {
                localStorage.setItem("ElixpoAIUser", this.value);
                localStorage.setItem("guestLogin", "true");
                var nameSelected = "[" + this.value + "]";
                typeWriterHTML("userSavedName", nameSelected, 50, function() {
                    console.log("fifth typing complete!");
                });
                typeWriterHTML("userSaved", "name --saved True;", 50, function() {
                    console.log("fifth typing complete!");
                });
                document.getElementById("userNameGuest").style.display = "none";
                document.getElementById("usernameGuestInput").style.pointerEvents = "none";
                 redirectTo("src/create");
            })
           
        }
        else 
        {
            document.getElementById("userAcceptance").style.color = "red";
            typeWriterHTML("userAcceptance", "namespace --rejected !! Length must be more than 3 characters, less than 20 characters and consisting of only alphabets (a-z)", 50, function() {
                console.log("fifth typing complete!");
            });
            document.getElementById("usernameGuestInput").style.pointerEvents = "all";
            document.getElementById("userAcceptance").style.color = "red";
        }
    }
    
 });

document.getElementById("guestAuth").addEventListener("click", () => {
    document.getElementById("userNameGuest").style.display = "block";
    document.getElementById("initializeText1").innerText = "";
    document.getElementById("initializeText2").innerText = "";
    document.getElementById("initializeText3").innerText = "";
    document.getElementById("initializeText4").innerText = "";
    document.getElementById("initializeText4_config").innerText = "";
    document.getElementById("initializeText4_message").innerText = "";
    document.getElementById("userSavedName").innerText = "";
    document.getElementById("userSaved").innerText = "";
    document.getElementById("usernameGuestInput").style.pointerEvents = "none";
    document.getElementById("usernameGuestInput").setAttribute("placeholder", "")
    setTimeout(() => {


       typeWriterHTML("initializeText1", "elixpo loading recipes", 50, function() {
           console.log("First typing complete!");
       
           typeWriterHTML("initializeText2", "loaded 1258 recipies in 5s", 50, function() {
               console.log("Second typing complete!");
    
           typeWriterHTML("initializeText3", "elixpo init", 50, function() {
               console.log("Second typing complete!");
           })
               
               // Add more calls if needed
               typeWriterHTML("initializeText4", "elixpo", 50, function() {
                   console.log("Third typing complete!");
               });
    
               typeWriterHTML("initializeText4_config", "--configure ", 50, function() {
                   console.log("Third typing complete!");
               });
               typeWriterHTML("initializeText4_message", "__", 50, function() {
                   console.log("fourth typing complete!");
                   document.getElementById("usernameGuestInput").focus();
                   document.getElementById("usernameGuestInput").style.pointerEvents = "all";
                   document.getElementById("usernameGuestInput").setAttribute("placeholder", "Type in an Username Here Buddy .. and Hit Enter")
               });
           });
       });
    
    }, 1300);
});


window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);