const regex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
var emailSignUp = document.getElementById("signupEmail").value;
var passwordSignUp = document.getElementById("signupPsswd").value;
var ConfpasswordSignUp = document.getElementById("signupPsswdConf").value;
var userSignUp = document.getElementById("signupName").value;

var emailSignIn = document.getElementById("signInEmail").value.toLowerCase().trim();
var usernameSignIn = document.getElementById("signInName").value.toLowerCase().trim();
var passwordSignIn = document.getElementById("signInPassword").value.toLowerCase().trim();



document.getElementById("signupBtnDB").addEventListener("click", () => { //when the signup button is clicked
    emailSignUp = document.getElementById("signupEmail").value.trim();
    passwordSignUp = document.getElementById("signupPsswd").value.trim();
    ConfpasswordSignUp = document.getElementById("signupPsswdConf").value.trim();
    userSignUp = document.getElementById("signupName").value.trim();

    if(emailSignUp == "" || passwordSignUp == "" || ConfpasswordSignUp == "" || userSignUp == "")
    {
        RegisterError("Please Fill All Fields!");
    }
    else if(!regex.test(emailSignUp))
    {
        RegisterError("Invalid Email!");
    }
    else if(passwordSignUp.length < 6)
    {
        RegisterError("Password Must be 6 Characters Long!");
    }
    else if(passwordSignUp != ConfpasswordSignUp)
    {
        RegisterError("Password Doesn't Match!");
    }
    else
    {
        registerUser();
    }
});

document.getElementById("signinBtnDB").addEventListener("click", () => { //when the signin button is clicked
    
    emailSignIn = document.getElementById("signInEmail").value.toLowerCase().trim();
    usernameSignIn = document.getElementById("signInName").value.toLowerCase().trim();
    passwordSignIn = document.getElementById("signInPassword").value.toLowerCase().trim();

    if(emailSignIn == "" || passwordSignIn == "" || usernameSignIn == "")
    {
        LoginError("Please Fill All Fields!");
    }
    else if(!regex.test(emailSignIn))
    {
        LoginError("Invalid Email!");
    }
    else if(passwordSignIn.length < 6)
    {
        LoginError("Password Must be 6 Characters Long!");
    }
    else
    {
        loginUser();
    }
});

function registerUser() {

    emailSignUp = document.getElementById("signupEmail").value;
    passwordSignUp = document.getElementById("signupPsswd").value;
    ConfpasswordSignUp = document.getElementById("signupPsswdConf").value;
    userSignUp = document.getElementById("signupName").value;
    docRef = db.collection("users").doc(userSignUp.toLowerCase());
    
    // Check if the username already exists
    docRef.get().then((doc) => {
        if(doc.exists) {
            notify("Username Already Exists!");
        }
    })

    document.getElementById("form_register").style.pointerEvents = "none";

    var today  = new Date();
    var date = today.getDate() + "/" + (today.getMonth()+1) + "/" + today.getFullYear(); // Get the current date

    // Firebase sign up process
    firebase.auth().createUserWithEmailAndPassword(emailSignUp, passwordSignUp)
    .then(function(userCredential) {
        var user = userCredential.user; // Contains the user credentials

        tileFlash();

        // Store user data in the Firestore database
        db.collection('users').doc(userSignUp.toLowerCase()).set({
            xxxuser: "[ENCRYPTED USERNAME]", // Placeholder for username (should be encrypted)
            xxxemail: "[ENCRYPTED EMAIL]", // Placeholder for email (should be encrypted)
            xxxuid: user.uid, // UID remains the same
            xxxdisplayName: userSignUp, // Display name (same as username)
            xxxdateCreated: date, // Date of account creation
            xxxisDev: "NotDev", // Flag indicating developer status
            xxxprovider: "Firebase", // Provider info
            xxxplan: "lix", // User plan
            xxxcoins: 1000000, // Default coin balance
            xxxuserLogo: "https://example.com/user-logo.png", // Placeholder for user logo URL
            xxxpassword: "[ENCRYPTED PASSWORD]" // Placeholder for password (should be encrypted)
        }).then(() => {
            RemovetileFlash();
            localStorage.setItem("--key for the username goes here", userSignUp.toLowerCase());
            notify("Account Created Successfully!");
            setTimeout(() => {
                resetRegisterForm();
                document.getElementById("form_register").classList.add("hidden");
                document.getElementById("form_login").classList.remove("hidden");

                document.getElementById("form_register").style.pointerEvents = "all";
                notify("Please Re Login!");
                RemovetileFlash();
            }, 2200);
        })
        .catch((err) => {
            RemovetileFlash();
            console.error("Error adding document: ", err);
            RegisterError("Some Error Occurred!");
            setTimeout(() => {
                RemovetileFlash();
            }, 500);
        });
    })
    .catch((err) => {
        console.error("Error during signInWithPopup:", err.message);
        tileFlash();
        if(err.message == "The email address is already in use by another account.") {
            RegisterError("Email already registered");
            RemovetileFlash();
        } else {
            RegisterError("Some Error Occurred!");
            RemovetileFlash();
        }
        RemovetileFlash();
    });
    RemovetileFlash();
}

function loginUser() {
    emailSignIn = document.getElementById("signInEmail").value.toLowerCase().trim();
    usernameSignIn = document.getElementById("signInName").value.toLowerCase().trim();
    passwordSignIn = document.getElementById("signInPassword").value.toLowerCase().trim();
    tileFlash();
    var docRef = db.collection("users").doc(usernameSignIn.toLowerCase());
    docRef.get().then((doc) => {
        if(doc.exists)
        {
            console.log(usernameSignIn, emailSignIn, passwordSignIn);   
            if (doc.data().username == usernameSignIn && doc.data().email == emailSignIn && doc.data().password == passwordSignIn) {
                    notify("Login Successful!");
                    localStorage.setItem("--key for the username goes here", usernameSignIn);
                    setTimeout(() => {
                        localStorage.setItem("key to detect the guest login", "false");
                        location.replace("elixpoArtGenerator.html");
                        
                    }, 2000);
                
 
            } else {
                LoginError("Invalid Credentials!");
                RemovetileFlash();
            }
        }
})
}





function RegisterError(err) {
    document.getElementById("RegisterError").innerText = err;
    setTimeout(() => {
        document.getElementById("RegisterError").innerText = "";
    }, 3500);
}


function LoginError(err) {
    document.getElementById("LoginError").innerText = err;
    setTimeout(() => {
        document.getElementById("LoginError").innerText = "";
    }, 3500);
}


function resetRegisterForm() {
    document.getElementById("signupEmail").value = "";
    document.getElementById("signupPsswd").value = "";
    document.getElementById("signupPsswdConf").value = "";
    document.getElementById("signupName").value = "";
}

function notify(msg) {
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("NotifTxt").innerText = msg;
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
        document.getElementById("NotifTxt").innerText = "";
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

function RemovetileFlash() {

    const tiles = document.querySelectorAll('.tile');
    tiles.forEach((tile) => {
        tile.classList.remove('flash');
    });
    setTimeout(() => {
        tiles.forEach((tile) => {
            tile.classList.remove('flash');
        }); 
    }, 2200);
}

