

document.getElementById("signin_with_google").addEventListener("click", () => {
    var provider = new firebase.auth.GoogleAuthProvider();

    firebase.auth().signInWithPopup(provider)
    .then(function(result) {
        var token = result.credential.accessToken;
        var user = result.user;
        var today  = new Date();
        var date = today.getDate() + "/" + (today.getMonth()+1) + "/" + today.getFullYear() ; //gives the  current date to the system
        var docRef = db.collection("users").doc(user.displayName);

        docRef.get().then((doc) => { // gets the whole data against the entered email address
            if (doc.exists) {
                tileFlash();
                        notify("Login Successful!");
                        localStorage.setItem("ElixpoAIUser", usernameSignIn);
                        setTimeout(() => {
                            localStorage.setItem("guestLogin", "false");
                        const urlParams = new URLSearchParams(window.location.search);
                        if(urlParams.get('cmp'))
                        {
                            console.log(urlParams.get('cmp'));
                            redirectTo(`blogs/elixpo_art/?cmp=${urlParams.get('cmp')}`);
                            return;
                        }
                
                            redirectTo("src/create");
                        }, 2000);

            } else {
           
                tileFlash();
                db.collection('users').doc(user.displayName.toLowerCase()).set({
                    username: user.displayName.toLowerCase(),
                    email: user.email,
                    uid: user.uid,
                    displayName: user.displayName,
                    dateCreated: date,
                    isDev: "NotDev",
                    provider: "Google",
                    plan : "lix",
                    token : token,
                    coins : 1000000,
                    user_logo: user.photoURL,
                }).then(() => {
                    
                    localStorage.setItem("ElixpoAIUser", user.displayName);
                    localStorage.setItem("guestLogin", "false");
                    redirectTo("src/create");
                })
                .catch((err) => {
                    
                    console.error("Error adding document: ", err);
                    RegisterError("Some Error Occured!");
                });
            }
        }).catch((err) => {
            
            console.error("Error getting document:", err);
        });
    })
    
    .catch((err) => {
        console.error("Error during signInWithPopup:", err.message);
        tileFlash();
        if(err.message == "An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.")
        {
            RegisterError("Email Associated with Different Account/Service");
        }
        else 
        {
            RegisterError("Some Error Occured!");
        }
        
    });
    
});

function RegisterError(err) {
    document.getElementById("RegisterError").innerText = err;
    setTimeout(() => {
        document.getElementById("RegisterError").innerText = "";
    }, 3500);
}

function tileFlash() {

    const tiles = document.querySelectorAll('.tile');
    const baseDelay = 90; // Base delay in milliseconds
    const delayIncrement = 50; // Increment delay for each subsequent tile

    tiles.forEach((tile, index) => {
        const delay = baseDelay + (index * delayIncrement);
        setTimeout(() => {
            tile.classList.add('flash');
        }, delay);
    });

}

