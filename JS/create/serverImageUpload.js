
document.getElementById("acceptBtn").addEventListener("click", () => {
    handleStaticServerUpload(blobs, blobs.length, imageVarType, modelType, specialDir ,0);
});

async function handleStaticServerUpload(blobs, imageNumber, imgTheme, model, specialDir, progress = 0) {
    generating = false;
    document.getElementById("NotifTxt").innerText = "Uploading Images...";
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("progressBar").classList.remove("zeroProgress");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("enhancedPrompt").innerHTML = "";

    
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

            if (enhanceMode) {
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
                                model : model,
                                timestamp: timestamp,
                                user: localStorage.getItem("ElixpoAIUser"),
                                prompt: promptTextInput.value,
                                ratio: RatioValue,
                                ai_enhanced: enhanceMode,
                                total_gen_number: blobs.length,
                                genNum: nextImageNumber,
                                formatted_prompt: "",
                                tags: "",
                                hashtags: "",
                                date : new Date().toDateString(),
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
                                cancelImageReference();
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
                                handleStaticMode(imageNumber);
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

async function gettotalGenOnServer() {
    try {
        const snapshot = await db.collection('Server').doc("totalGen").get();
        console.log("Total Gen:", snapshot.data().value);
        let totalGen = parseInt(snapshot.data().value);
        return totalGen;
    } catch (error) {
        console.error("Error getting total generation count:", error);
        return 0;
    }
}

