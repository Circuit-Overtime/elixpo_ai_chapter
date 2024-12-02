import { GoogleGenerativeAI } from "@google/generative-ai";
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
  let generating = false;
//   let tokens = 0;
  let imageUrl = '';
  let formatted_prompt = "";
  let hashtags = "";
  let tags = "";
  let enhanceUrl = '';
  let downloadUrl = '';
  let pingUrl = '';
  let tagUrl = '';
  let ai_enhanced_prompt = '';
  let suffixPrompt = "";
  let serverReturnStatus = true;

  
let originalTitle = document.title;
let timeoutId;

  const randomLogos = 
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
//new commit

window.onload = function() {
    document.querySelector(".patternContainer").classList.remove("hidden");
    globalThis.imageVarType = "Fantasy";
    globalThis.RatioValue = "1:1";
    document.getElementById("imageTiles").classList.contains("hidden") ? document.querySelector("."+imageVarType).style.opacity = "1" : document.querySelector("."+imageVarType).style.opacity = "0";
    globalThis.width = 2048;
    globalThis.height = 2048;
    globalThis.encodedPrompt = "";
    globalThis.currentIndex = 0;
    globalThis.websiteStaticMode = "Static";
    globalThis.controller;
    globalThis.blobs = [];
    // localStorage.setItem("ElixpoAIUser", "circuit overtime");
    globalThis.imgProg = 0;
    globalThis.fileName = "ElixpoAI-Generated-Image.jpeg";
    globalThis.specialDir = "";
    document.getElementById("logoutPopUpUsername").innerText = localStorage.getItem("ElixpoAIUser");


    document.getElementById("promptTextInput").focus();
    setInterval(() => {
        if (localStorage.getItem("ElixpoAIUser") == null) {
            location.href = "elixpo_homepage.html";
        } else {
            document.querySelector(".patternContainer").classList.add("hidden");
        }
    }, 1000);


    
    globalThis.serverRef = db.collection('Server').doc('servers');

   
 function getServerURLs() {
        serverRef.get().then(async (doc) => {
            if (doc.exists) {
                downloadUrl = await doc.data().download_image;
                pingUrl = await doc.data().get_ping;


                console.log(`Server1 URL: ${downloadUrl}`);
                console.log(`Server3 URL: ${pingUrl}`);

                // Schedule pingServer after URLs are retrieved
                checkNetwork();
                setInterval(() => checkNetwork(), 5000);
            } else {
                console.log("No such document!");
            }
        }).catch((error) => {
            console.log("Error getting document:", error);
        });
}

function checkNetwork()
{
    if (navigator.onLine) {
        document.getElementById("serverStatus").classList.remove("offline");
      } else {
        document.getElementById("serverStatus").classList.add("offline");
      }
}

async function pingServer() {
    try {
        const response = await fetch(`${pingUrl}/ping`, {
            method: "POST", // Use POST if you prefer to simulate heartbeat requests
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: 'heartbeat' }) // Send a heartbeat signal
        });

        if (response.ok) {
            console.log(`${pingUrl} is up`);
            document.getElementById("serverStatus").classList.remove("offline");
        } else {
            console.log(`${pingUrl} is down`);
            document.getElementById("serverStatus").classList.add("offline");
        }
    } catch (error) {
        console.log(`${pingUrl} is down`);
        document.getElementById("serverStatus").classList.add("offline");
    }
}

    getServerURLs();
    setInterval(getServerURLs, 30000);
};

if(localStorage.getItem("guestLogin") == true)
{
    db.collection("users").doc(localStorage.getItem("ElixpoAIUser").toLowerCase()).get().then((doc) => {
        if (doc.exists) {
            // console.log("Document data:", doc.data());
            document.getElementById("userLogo").style.backgroundImage = `url(${doc.data().user_logo})`;
        } else {
           console.log("No such document!");
        }
    }).catch((error) => {
       location.reload();
    });
}
else 
{
const randomIndex = Math.floor(Math.random() * randomLogos.length);
const randomLogo = randomLogos[randomIndex];
document.getElementById("userLogo").style.backgroundImage = `url(${randomLogo})`;
}





const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];
const promptTextInput = document.getElementById("promptTextInput");
let controller;

        async function generateImageAsync(prompt, width, height, seed, aspectRatio, theme, genNumber, controller) {
            document.getElementById("NotifTxt").innerText = "Generating Images...";
            document.getElementById("savedMsg").classList.add("display");
            const model = Math.random() < 0.5 ? "flux" : "boltning";
            var enhanceSwitch = document.getElementById("enhanceSwitch");
            var privateImage = document.getElementById("privateSwitch").checked ? "false" : "true";
            
            if(enhanceSwitch.checked)
            {
                imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=1&enhance=true&private=${privateImage}`;
            }
            else 
            {
                imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=1&enhance=false&private=${privateImage}`;
            }
            
         //x
            const imageTile = document.querySelector(".imageTile" + genNumber);
            imageTile.classList.add("generating");
            specialDir = localStorage.getItem("ElixpoAIUser") + "_" + Date.now();
            document.getElementById("generationTimeMask" + genNumber).style.animation = "loadingFlash 2s linear infinite";
            document.getElementById("generatedSeedIcon" + genNumber).style.animation = "loadingFlash 2s linear infinite";
            document.getElementById("generatedSeedIcon" + genNumber).style.color = "#00ff73";
        
            const startTime = Date.now();
        
            try {
                return new Promise(async (resolve, reject) => { 
                    const imgElement = document.getElementById("imageRecieve" + genNumber);
        
                    if (!imgElement) {
                        reject(`Element with ID "imageRecieve${genNumber}" not found.`);
                        return;
                    }
                    console.log(downloadUrl);
                    try {
                        serverReturnStatus = true;
                        const response = await fetch(`${downloadUrl}/download-image`, {  //get image
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ imageUrl }),
                            signal: controller.signal
                        });
        
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
                        else if(response.status == 202)
                        {
                            serverReturnStatus = false;
                            document.getElementById("acceptBtn").classList.add("hidden");
                        }
        
                        const data = await response.json();
                        const base64 = data.base64;
                        const url = `data:image/png;base64,${base64}`;
                        const blob = await fetch(url).then(res => res.blob());
                        blobs.push(blob);
        
                        imgElement.onload = () => {
                            const endTime = Date.now();
                            const generationTime = Math.round((endTime - startTime) / 1000);
                            if (generationTime > 9) {
                                document.querySelector(".imageTiles .maskImageTile" + genNumber + " .creationStats .generationTime").style.fontSize = "1.5em";
                                document.querySelector(".imageTiles .maskImageTile" + genNumber + " .creationStats .generationAspectRatio").style.fontSize = "1.5em";
                                document.getElementById("expansionIcon" + genNumber).classList.remove("hidden");
                            }
                            document.getElementById("generationTime" + genNumber).innerText = `${generationTime}s`;
                            document.getElementById("generationAspectRatio" + genNumber).innerText = `${aspectRatio}`;
                            document.getElementById("generatedSeed" + genNumber).innerText = seed;
                            document.getElementById("generationTheme" + genNumber).innerText = theme;
                            const encodedData = url + "###" + prompt + "###" + localStorage.getItem("ElixpoAIUser") + "###" + genNumber;
                            document.getElementById("maskImageTile" + genNumber).setAttribute("data-id", encodedData);
        
                            if (imageTile) {
                                imageTile.classList.remove("generating");
                                imageTile.classList.add("generated");
                                document.getElementById("generationTimeMask" + genNumber).style.animation = "none";
                                document.getElementById("generatedSeedIcon" + genNumber).style.animation = "none";
                                document.getElementById("generatedSeedIcon" + genNumber).style.color = "#fff";
                                document.getElementById("expansionIcon" + genNumber).classList.add("shrink");
                                document.getElementById("maskImageTile" + genNumber).classList.add("expand");
                            }
        
                            // Remove blur effect
                            imgElement.style.filter = 'blur(0)';
                            resolve();
                        };
        
                        // Add blur effect initially
                        imgElement.style.filter = 'blur(10px)';
                        imgElement.src = url;
        
                        controller.signal.addEventListener('abort', () => {
                            imgElement.src = '';
                            reject(new Error('Image generation aborted.'));
                            handleStaticModeExclusive(currentIndex + 1);
                        });
                    } catch (error) {
                        console.error('Error fetching image:', error);
                        if (error.message.includes('Failed to fetch')) {
                            document.getElementById("NotifTxt").innerText = "Server Offline!";
                            document.getElementById("savedMsg").classList.add("display");
                            setTimeout(() => {
                                document.getElementById("savedMsg").classList.remove("display");
                            }, 1500);
                            document.getElementById("NotifTxt").innerText = "Greetings";
                            handleStaticModeExclusive(currentIndex + 1);
                            reject(new Error('Node.js server is not running.'));
                        } else {
                            reject(error);
                        }
                    }
                });
            } catch (error) {
                console.error('Error fetching server URL:', error);
                document.getElementById("NotifTxt").innerText = "Error fetching server URL";
                document.getElementById("savedMsg").classList.add("display");
                setTimeout(() => {
                    document.getElementById("savedMsg").classList.remove("display");
                }, 1500);
                document.getElementById("NotifTxt").innerText = "Greetings";
            }
        }
        



        



       
        
        
        // Example usage

        
// Function to generate multiple images in parallel
async function generateMultipleImages(encodedPrompt, width, height, seeds, aspectRatio, theme, numberOfImages, controller) {
    const promises = [];

    for (let i = 0; i < numberOfImages; i++) {
        const genNumber = (i + 1).toString();
        promises.push(generateImageAsync(encodedPrompt, width, height, seeds[i], aspectRatio, theme, genNumber, controller));
    }

    try {
        await Promise.all(promises);
        console.log("All images generated successfully.");
        generating = false;
        // tokenDeduct(aspectRatio, theme, numberOfImages);
        document.getElementById("rejectBtn").classList.remove("hidden");
        if ((document.getElementById("privateSwitch").checked == false) || !serverReturnStatus) {
            document.getElementById("acceptBtn").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings - (Private Result)";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display"); 
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings!";
        } 
        else if ((document.getElementById("privateSwitch").checked == true) && serverReturnStatus) {
            document.getElementById("acceptBtn").classList.remove("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display");
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
        } 
        else{
            document.getElementById("acceptBtn").classList.remove("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display");
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
        }
    } catch (error) {
        if (controller.signal.aborted) {
            console.log("Image generation stopped.");
        } else {
            console.error("Error generating images:", error);
            document.getElementById("NotifTxt").innerText = "Server Offline!";
            document.getElementById("savedMsg").classList.add("display"); 
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display"); 
            }, 1500);
            document.getElementById("NotifTxt").innerText = "Greetings";
            handleStaticModeExclusive(currentIndex + 1);
        }
    }
}


document.getElementById("stopGeneration").addEventListener("click", () => {
    if (controller) {
        controller.abort();
        // Clear the src attribute of all img elements
        handleStaticMode(currentIndex+1);
    }
});

function handleStaticMode(numberOfImages) {
    generating = false;
    blobs = [];
    for (let i = 1; i <= numberOfImages; i++) {
        const imgElement = document.getElementById("imageRecieve" + i.toString());

        if (imgElement) {
            imgElement.src = '';
            document.getElementById("generationTime"+i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generated");
            document.getElementById("generationAspectRatio"+i).innerText = "";
            document.getElementById("generatedSeed"+i).innerText = "";
            document.getElementById("generationTheme" + i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generating");
            document.getElementById("expansionIcon"+i).classList.add("hidden");
            document.getElementById("expansionIcon"+i).classList.remove("shrink");
            document.getElementById("maskImageTile"+i).classList.remove("expand");
        }
    }
    document.getElementById("samplePrompt").classList.remove("generating");
    if (document.getElementById("samplePrompt").classList.contains("generated")) {
        document.getElementById("samplePrompt").classList.remove("generated");
    }
    document.getElementById("imageTiles").classList.add("hidden");
    setTimeout(() => {
        document.getElementById("stopGeneration").classList.add("hidden");
    document.getElementById("typeOfImageTile").classList.remove("hidden");
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("privateResultSection").classList.remove("hidden");
    document.getElementById("enhanceButton").classList.remove("hidden");
    document.getElementById("enhancingMessage").classList.remove("noEnhancement");
    document.getElementById("enhancedPrompt").innerText = "";
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("enhancementAI").classList.add("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("promptTextInput").value = "";
    document.querySelector(".progressBar").classList.add("zeroProgress");
    document.querySelector("."+imageVarType).style.opacity = "1";
    document.getElementById("savedMsg").classList.remove("display");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("hqlqcontainer").classList.remove("hidden");
    document.getElementById("statusImage1").innerHTML = "";
    document.getElementById("statusImage2").innerHTML = "";
    document.getElementById("statusImage3").innerHTML = "";
    document.getElementById("statusImage4").innerHTML = "";
    
    specialDir = "";
    encodedPrompt = "";
    },1500)
    
}


document.getElementById("rejectBtn").addEventListener("click", () => {
    handleStaticModeExclusive(currentIndex+1);
});

document.getElementById("acceptBtn").addEventListener("click", () => {
    handleStaticServerUpload(blobs, blobs.length, imageVarType, specialDir ,0);
});



async function gettotalGenOnServer() {
    const snapshot = await db.collection('Server').doc("totalGen").get();
    console.log("Total Gen:", snapshot.data().value);
    let totalGen = parseInt(snapshot.data().value);
    return totalGen;
}

// async function fetchFormattedPrompt(prompt) {
//      formatted_prompt = "";
//      hashtags = "";
//      tags = "";
//     try {
//         const response = await fetch(`${tagUrl}/tag_gen`, { //python endpoint -- tags generator
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({ prompt: prompt }),
//         });
  
//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }
  
//         const data = await response.json();
//         formatted_prompt = data.formatted_prompt;
//         hashtags = data.hashtags
//         tags = data.tags;
//         console.log(formatted_prompt, hashtags, tags);

//         return [data.formatted_prompt, data.hashtags, data.tags];  // Return the markdown formatted prompt
//     } catch (error) {
//         console.error("Error fetching formatted prompt:", error);
//         return "";
//     }
    
// }


function generateUniqueId(inputString) {
    // Get the current timestamp
    const timestamp = Date.now().toString();

    // Concatenate the input string and the timestamp
    let combined = inputString + timestamp;

    // Shuffle the combined string
    combined = combined.split('').sort(() => Math.random() - 0.5).join('');

    // Generate a unique alphanumeric ID by slicing the shuffled string
    const uniqueId = combined.slice(0, 10); // You can adjust the length of the ID by changing this value

    return uniqueId;
}


async function handleStaticServerUpload(blobs, imageNumber, imgTheme, specialDir, progress = 0) {
    generating = false;
    document.getElementById("NotifTxt").innerText = "Uploading Images...";
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("samplePrompt").classList.add("generated");
    document.getElementById("progressBar").classList.remove("zeroProgress");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("hqlqcontainer").classList.add("hidden");
    
    var currentTotalImageOnServer = await gettotalGenOnServer();
    console.log("Current Total Image on Server:", currentTotalImageOnServer);
    var nextImageNumber = currentTotalImageOnServer + 1;
    console.log("Next Image Number:", nextImageNumber);
    
    return new Promise(async (resolve, reject) => {
        try {
            const imageGenId = generateUniqueId(localStorage.getItem("ElixpoAIUser").toLowerCase());
            const storageRef = firebase.storage().ref();
            const timestamp = Date.now();
            const uploadPromises = [];
            let imageUrls = [];  // To store image URLs for Instagram upload

            if (enhanceSwitch.checked) {
                ai_enhanced_prompt = document.getElementById("enhancedPrompt").innerText;
            }

            // Prepare upload tasks for each blob
            blobs.forEach((blob, index) => {
                const imageRef = storageRef.child(`generatedImages/${imgTheme}/image_${timestamp}_${index}.png`);
                const uploadTask = imageRef.put(blob);

                // Track upload progress
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Image ${index + 1} upload is ${currentProgress}% done`);
                    },
                    (error) => {
                        console.error(`Error during upload of image ${index + 1}:`, error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const url = await imageRef.getDownloadURL();
                            console.log(`Download URL for image ${index + 1}:`, url);
                            imageUrls.push(url);  // Add URL to array for Instagram upload
                            
                            // Update Firestore with image metadata
                            await db.collection("ImageGen").doc(specialDir).set({
                                theme: imgTheme,
                                timestamp: timestamp,
                                user: localStorage.getItem("ElixpoAIUser"),
                                prompt: promptTextInput.value,
                                ratio: RatioValue,
                                ai_enhanced: enhanceSwitch.checked,
                                likes: 0,
                                total_gen_number: blobs.length,
                                genNum: nextImageNumber,
                                hq: document.getElementById("hqlqParent").checked,
                                formatted_prompt: "",
                                tags: "",
                                hashtags: "",
                                imgId: imageGenId
                            });
                            await db.collection("ImageGen").doc(specialDir).update({
                                [`Imgurl${index}`]: url,
                            });

                            progress += 1;
                            let prog = Math.round((progress / imageNumber) * 100);
                            document.getElementById("progressBarAccept").style.width = prog + "%";

                            // Check if all uploads are complete
                            if (progress === blobs.length) {
                                console.log("All images uploaded successfully.");
                                generating = false;
                                setTimeout(() => {
                                    document.getElementById("NotifTxt").innerText = "Uploading to Instagram @elixpo_ai";
                                }, 1500);
                                document.getElementById("progressBarAccept").style.width = 0 + "%";
                                document.getElementById("savedMsg").classList.add("display");

                                // Update total generated images on server
                                await db.collection("Server").doc("totalGen").update({
                                    value: nextImageNumber,
                                });

                                // Trigger static mode without waiting for Instagram upload
                                handleStaticMode(imageNumber);

                                // Send images to the Instagram upload sequence in background
                                fetch(`${downloadUrl}/instagram-upload`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        imageUrls: imageUrls,
                                        caption: `✨Read More for Details✨\n 💬Prompt: ${promptTextInput.value}\n 🖼️Theme: ${imgTheme}\n 📐Ratio: ${RatioValue}\n 🧪AI Enhanced: ${enhanceSwitch.checked ? 'Yes' : 'No'}\n 🤝Generated by: ${localStorage.getItem("ElixpoAIUser")}\n\n ⭐Generated by Elixpo.ai - The AI Art Generator dated ${new Date().toDateString()}`
                                    })
                                })
                                .then(response => {
                                    if (response.ok) {
                                        return response.text();
                                    } else {
                                        throw new Error('Failed to send Instagram upload request.');
                                    }
                                })
                                .then(responseData => {
                                    console.log('Instagram upload request sent successfully.', responseData);
                                    document.getElementById("NotifTxt").innerText = "Greetings!";
                                    document.getElementById("progressBarAccept").style.width = 0 + "%";
                                    document.getElementById("savedMsg").classList.remove("display");
                                })
                                .catch(err => {
                                    console.error('Error sending request to Instagram:', err);
                                });

                                resolve(uploadPromises);
                            }
                        } catch (error) {
                            console.error(`Error getting download URL or updating database for image ${index + 1}:`, error);
                            document.getElementById("NotifTxt").innerText = "Upload Failed!";
                            document.getElementById("savedMsg").classList.add("display");
                            setTimeout(() => {
                                document.getElementById("savedMsg").classList.remove("display");
                            }, 1500);
                            document.getElementById("NotifTxt").innerText = "Greetings";
                            handleStaticMode(currentIndex + 1);
                            reject(error);
                        }
                    }
                );

                // Store the promise for this upload
                uploadPromises.push(uploadTask);
            });

            // Wait for all upload tasks to complete
            await Promise.all(uploadPromises.map(task => task));

        } catch (error) {
            console.error("Error uploading images:", error);
            reject(error);
        }
    });
}



function handleStaticModeExclusive(numberOfImages) {
    blobs = [];
    for (let i = 1; i <= numberOfImages; i++) {
        const imgElement = document.getElementById("imageRecieve" + i.toString());

        if (imgElement) {
            imgElement.src = '';
            document.getElementById("generationTime"+i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generated");
            document.getElementById("generationAspectRatio"+i).innerText = "";
            document.getElementById("generatedSeed"+i).innerText = "";
            document.getElementById("generationTheme" + i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generating");
            document.getElementById("expansionIcon"+i).classList.add("hidden");
            document.getElementById("expansionIcon"+i).classList.remove("shrink");
            document.getElementById("maskImageTile"+i).classList.remove("expand");

        }
    }
    document.getElementById("samplePrompt").classList.remove("generating");

    if (document.getElementById("samplePrompt").classList.contains("generated")) {
        document.getElementById("samplePrompt").classList.remove("generated");
    }

    document.getElementById("imageTiles").classList.add("hidden");

    setTimeout(() => {
    document.getElementById("stopGeneration").classList.add("hidden");
    document.getElementById("typeOfImageTile").classList.remove("hidden");
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("privateResultSection").classList.remove("hidden");
    document.getElementById("enhanceButton").classList.remove("hidden");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("enhancingMessage").classList.remove("noEnhancement");
    document.getElementById("enhancedPrompt").innerText = "";
    document.getElementById("enhancementAI").classList.add("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.querySelector(".progressBar").classList.add("zeroProgress");
    document.querySelector("."+imageVarType).style.opacity = "1";
    document.getElementById("hqlqcontainer").classList.remove("hidden");
    document.getElementById("statusImage1").innerHTML = "";
    document.getElementById("statusImage2").innerHTML = "";
    document.getElementById("statusImage3").innerHTML = "";
    document.getElementById("statusImage4").innerHTML = "";
    encodedPrompt = "";
    specialDir = "";
    },1500)
    
}


// Example of event listener setup (assuming it's triggered on button click)
document.getElementById("searchButtonText").addEventListener("click", async () => {
    console.log("Search Button Clicked");
    const promptTextInput = document.getElementById("promptTextInput");
    if (promptTextInput.value.trim() !== "") {
        // websiteStaticMode = "Generating";
        generatingModeHandle();
    } else {
        // Handle case when prompt input is empty
        document.getElementById("promptTextInput").setAttribute("placeholder", "Please Enter a Prompt to Generate an Image");
        setTimeout(() => {
            document.getElementById("promptTextInput").setAttribute("placeholder", "Type in Your Prompt for Elixpo to Imagine");
        }, 3000);
        document.getElementById("promptTextInput").focus();
    }
});

async function enhance(prompt) {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";

    try {
        const model = await genAI.getGenerativeModel(modelConfig);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text(); // Await the text extraction

        setTimeout(() => {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";
        }, 1200);
        return text;
    } catch (error) {
        document.getElementById("textLoadingAnim").style.opacity = "1"; // Ensure the loading animation is hidden in case of error
        setTimeout(() => {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";
        }, 1200);
        return prompt;
    }
}
 
async function generatingModeHandle() {
    generating = true;
    suffixPrompt = "";
    document.getElementById("samplePrompt").classList.add("generating");
    document.getElementById("samplePrompt").style.height = "60px";
    document.getElementById("typeOfImageTile").classList.add("hidden");
    document.getElementById("aspectRatioControls").classList.add("hidden");
    document.getElementById("imageTiles").classList.remove("hidden");
    document.getElementById("stopGeneration").classList.remove("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");

    const enhanceSwitch = document.getElementById("enhanceSwitch");

    if (!enhanceSwitch.checked) {
        document.getElementById("aiEnhancementDesc").classList.add("hidden");
        document.getElementById("privatePublicResultDesc").classList.add("hidden");
        document.getElementById("privateResultSection").classList.add("hidden");
        document.getElementById("enhanceButton").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.contains("hidden") ? null : document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancementAI").classList.remove("hidden");
        document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.add("noEnhancement");
        document.getElementById("enhancedPrompt").innerText = " Image(s) are being Generated -- Pls StandBy! ";
        document.getElementById("hqlqcontainer").classList.add("hidden");
    } else {
        document.getElementById("aiEnhancementDesc").classList.add("hidden");   
        document.getElementById("privatePublicResultDesc").classList.add("hidden");
        document.getElementById("privateResultSection").classList.add("hidden");
        document.getElementById("enhanceButton").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.contains("hidden") ? null : document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.add("noEnhancement");
        document.getElementById("enhancementAI").classList.remove("hidden");
        document.getElementById("hqlqcontainer").classList.add("hidden");
        document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancedPrompt").innerText = " Image(s) are being Generated -- Pls StandBy! ";
    }

    const promptTextInput = document.getElementById("promptTextInput");
    if(imageVarType == "Fantasy")
        {
            suffixPrompt = "in a magical fantasy setting, with mythical creatures and surreal landscapes";
        }
        else if(imageVarType == "Halloween")
        {
            suffixPrompt = "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
        }
        else if(imageVarType == "Structure")
        {
            suffixPrompt = "in the style of monumental architecture, statues, or structural art";
        }
        else if(imageVarType == "Crayon")
        {
            suffixPrompt = "in the style of colorful crayon art with vibrant, childlike strokes";
        }
        else if(imageVarType == "Space")
        {
            suffixPrompt = "in a vast, cosmic space setting with stars, planets, and nebulae";
        }
        else if(imageVarType == "Chromatic")
        {
            suffixPrompt = "in a chromatic style with vibrant, shifting colors and gradients";
        }
        else if(imageVarType == "Cyberpunk")
        {
            suffixPrompt = "in a futuristic cyberpunk setting with neon lights and dystopian vibes";
        }
        else if(imageVarType == "Anime")
        {
            suffixPrompt = "in the style of anime, with detailed character designs and dynamic poses";
        }
        else if(imageVarType == "Landscape")
        {
            suffixPrompt = "depicting a breathtaking landscape with natural scenery and serene views";
        }
        else if(imageVarType == "Samurai")
        {
            suffixPrompt = "featuring a traditional samurai theme with warriors and ancient Japan";
        }
        else if(imageVarType == "Wpap")
        {
            suffixPrompt = "in the WPAP style with geometric shapes and vibrant pop-art colors";
        }
        else if(imageVarType == "Vintage")
        {
            suffixPrompt = "in a vintage, old-fashioned style with sepia tones and retro aesthetics";
        }
        else if(imageVarType == "Pixel")
        {
            suffixPrompt = "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics";
        }
        else if(imageVarType == "Normal")
        {
            suffixPrompt = "in a realistic and natural style with minimal artistic exaggeration";
        }
        else if(imageVarType == "Synthwave")
        {
            suffixPrompt = "in a retro-futuristic synthwave style with neon colors and 80s vibes";
        }
        
    let encodedPrompt = promptTextInput.value.trim() + " " + suffixPrompt;
    let width, height;

    const isHQorLQ = document.getElementById("hqlqParent").checked;
    console.log("image is being generated under " + isHQorLQ)
switch (RatioValue) {
    case "1:1":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 2048 : 1024;
        break;
    case "9:16":
        width = isHQorLQ ? 1152 : 576;
        height = isHQorLQ ? 2048 : 1024;
        break;
    case "16:9":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1152 : 576;
        break;
    case "4:3":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1536 : 768;
        break;
    case "3:2":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1365 : 683;
        break;
    default:
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 2048 : 1024;
        break;
}


    const numberOfImages = currentIndex + 1;
    const seeds = generateSeeds(numberOfImages, 4, 6);
    for(let i = 1; i <= numberOfImages; i++)
    {
        document.getElementById("statusImage"+i).innerText = isHQorLQ ? "In Progress" : "Generating";
    }
    
    controller = new AbortController();

    try {
        await generateMultipleImages(encodedPrompt, width, height, seeds, RatioValue, imageVarType, numberOfImages, controller);
    } catch (error) {
        console.error('Error fetching server URL:', error);
        document.getElementById("NotifTxt").innerText = "Error fetching server URL";
        document.getElementById("savedMsg").classList.add("display");
        setTimeout(() => {
            document.getElementById("savedMsg").classList.remove("display");
        }, 1500);
        document.getElementById("NotifTxt").innerText = "Greetings";
    }
}





document.addEventListener('DOMContentLoaded', (event) => {
    const typeOfImageTile = document.getElementById('typeOfImageTile');
    const children = typeOfImageTile.getElementsByTagName('span');

    Array.from(children).forEach(child => {
        child.addEventListener('click', () => {
            imageVarType = child.className;
            console.log(imageVarType);
            Array.from(children).forEach(c => {
                c.style.opacity = ".25";
            });
            child.style.opacity = "1";
            document.getElementById("isoImageType").style.background = 'url("./CSS/IMAGES/THEMES/'+imageVarType.toLowerCase().trim()+'.jpeg")';
            document.getElementById("isoImageType").style.backgroundSize = "cover";
            document.getElementById("isoImageType").style.backgroundPosition = "50% 30%";
            document.getElementById("themeNameIcon").innerHTML = imageVarType;
          
        });
        
    });
});


document.addEventListener('DOMContentLoaded', (event) => {
    const aspectRatioControls = document.getElementById('aspectRatioControls');
    const tiles = aspectRatioControls.getElementsByClassName('aspectRatioTile');
    
    // Set initial state
    const defaultTile = document.getElementById('aspectRatioTile1_1');
    defaultTile.classList.add('active');

    Array.from(tiles).forEach(tile => {
        tile.addEventListener('click', () => {
            // Remove active class from all tiles
            Array.from(tiles).forEach(t => {
                t.classList.remove('active');
                t.style.opacity = "0.25";
            });

            // Add active class to the clicked tile
            tile.classList.add('active');
            tile.style.opacity = "1";

            RatioValue = tile.querySelector('p').innerText;
            document.getElementById("selectedAspectRatio").innerText = RatioValue;
        });
    });
}); 



        diceIcon.addEventListener('click', () => {
            diceIcon.classList.add('click-effect');
            setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

            diceIcon.classList.remove(diceClasses[currentIndex]);
            currentIndex = (currentIndex + 1) % diceClasses.length;
            diceIcon.classList.add(diceClasses[currentIndex]);
        });


        function generateSeeds(numSeeds = 6, minDigits = 4, maxDigits = 6) {
            const seeds = [];
            
            for (let i = 0; i < numSeeds; i++) {
                const numDigits = Math.floor(Math.random() * (maxDigits - minDigits + 1)) + minDigits;
                const min = Math.pow(10, numDigits - 1);
                const max = Math.pow(10, numDigits) - 1;
                const seed = Math.floor(Math.random() * (max - min + 1)) + min;
                seeds.push(seed);   
            }
            
            return seeds;
        }


        document.querySelectorAll(".tile").forEach((tile, index) => {
            tile.addEventListener("click", () => {
                if (tile.classList.contains("expand")) {
                    document.getElementById("showImage").classList.remove("hidden");
                    const whichClick = index + 1;
                    expandImage(document.getElementById("maskImageTile" + whichClick).getAttribute("data-id"));
                }
            });
        })


document.getElementById("backButton").addEventListener("click" , () => {
    document.getElementById("showImage").classList.add("hidden");
})


function expandImage(enc) {
    document.getElementById("PromptDisplay").innerHTML = "";
   let encodedEnteries = enc.split("###");
    document.getElementById("showImage").classList.remove("hidden");
    document.getElementById("showImage").querySelector("img").src = encodedEnteries[0];
    // console.log(encodedEnteries[0]);
    document.getElementById("downloadBox").setAttribute("data-id", encodedEnteries[0]);
    setTimeout(() => {
        document.getElementById("imgDisp").classList.add("loaded");
    }, 1200);
    document.getElementById("PromptDisplay").innerHTML = `<pre><code>${encodedEnteries[1]}</code></pre>`;
    const user = encodedEnteries[2];
    const genNumber = encodedEnteries[3];
    // document.getElementById("singAcceptBtn").setAttribute("data-id", genNumber);
    document.getElementById("genUserName").innerText = user;
}


document.getElementById("downloadBox").addEventListener("click", (e) => {
    const downloadUrl = document.getElementById("downloadBox").getAttribute("data-id");
    downloadBlobWatermark(downloadUrl, fileName);
})


function downloadBlob(blob, fileName) {
    const url = blob;
    const a = document.createElement('a');
    a.href = url;
    a.download = "elixpo-ai-generated-image.jpg"; // Set the file name to "elixpo-ai-generated-image.jpg"
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}
//added the change to allow watermarkes here
function downloadBlobWatermark(blob) {
    const watermarkImage = new Image();
    const watermarkImageInverted = new Image();
    watermarkImage.crossOrigin = "Anonymous";
    watermarkImageInverted.crossOrigin = "Anonymous";
    watermarkImage.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20final.png?alt=media&token=4bdf46cb-c851-4638-a0ea-a2723c8d4038"
    watermarkImageInverted.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20inverted%20final.png?alt=media&token=4a7b007d-e5dc-4b56-aa7f-acc6446b1bbe"

    const mainImage = new Image();
    const url = blob;
    mainImage.crossOrigin = "Anonymous";
    mainImage.src = url;
    mainImage.onload = () => {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match the main image
        canvas.width = mainImage.width;
        canvas.height = mainImage.height;

        // Draw the main image onto the canvas
        ctx.drawImage(mainImage, 0, 0);

        // Detect brightness in the bottom left corner
        const sampleSize = 10; // Size of the sample area
        const imageData = ctx.getImageData(0, canvas.height - sampleSize, sampleSize, sampleSize);
        let totalBrightness = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            // Calculate brightness using the formula
            totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const averageBrightness = totalBrightness / (imageData.data.length / 4);

        // Choose the watermark based on the brightness
        const selectedWatermark = averageBrightness < 128 ? watermarkImageInverted : watermarkImage;

        selectedWatermark.onload = () => {
            // Define the position for the watermark
            const watermarkX = 10;
            const watermarkY = canvas.height - selectedWatermark.height - 10;

            const watermarkX_right = canvas.width - selectedWatermark.width - 10;
            const watermarkY_right = 10;

            // Draw the watermark onto the canvas
            ctx.drawImage(selectedWatermark, watermarkX, watermarkY);
            ctx.drawImage(selectedWatermark, watermarkX_right, watermarkY_right);
            console.log("modified");

            // Convert the canvas to a Blob and download it
            canvas.toBlob(function(modifiedBlob) {
                const downloadUrl = URL.createObjectURL(modifiedBlob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = "elixpo-ai-generated-image.jpg"; // Set the file name to "elixpo-ai-generated-image.jpg"
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
            });
        };
    };

    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}




function copyTextFromDiv() {
    // Get the div element
    const div = document.getElementById('PromptDisplay');

    // Create a temporary textarea element to use for copying
    const textarea = document.createElement('textarea');
    textarea.value = div.innerText; // Get the inner text of the div
    document.body.appendChild(textarea);

    // Select and copy the text
    textarea.select();
    textarea.setSelectionRange(0, 99999); // For mobile devices
    document.execCommand('copy');

    // Remove the temporary textarea
    document.body.removeChild(textarea);

    // Optionally, give user feedback
    document.getElementById("NotifTxt").innerText = "Prompt Copied!";
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
    document.getElementById("NotifTxt").innerText = "Greetings!";
} 
document.getElementById('copyPrompt').addEventListener('click', copyTextFromDiv);

document.getElementById("GalleryImageIcon").addEventListener("click", () => {
    if (generating) {
        alert("Image generating alredy, progress will  be lost")
        redirectTo("src/homepage");
            
    }
    else 
    {
        redirectTo("src/homepage");
    }
});


document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        timeoutId = setTimeout(() => {
            document.title = "We miss you! Come back soon!";
        }, 800);
    } else {
        clearTimeout(timeoutId);
        document.title = originalTitle;
    }
});