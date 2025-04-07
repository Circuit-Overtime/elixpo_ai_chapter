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

document.addEventListener('DOMContentLoaded', async () => {
    const voiceTiles = document.querySelectorAll('.voice-tile');
    let currentlyPlaying = null;

    // Get the user's IP address (using a third-party service)
    let userIP = localStorage.getItem('userIP');
    if (!userIP) {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            userIP = data.ip;
            localStorage.setItem('userIP', userIP); // Store in localStorage
        } catch (error) {
            console.error("Error getting IP address:", error);
            userIP = 'unknown'; // Use a default value if IP retrieval fails
        }
    }

    voiceTiles.forEach(async tile => {
        const voiceName = tile.dataset.voiceId;
        const playButton = tile.querySelector('.play-button');
        const audio = tile.querySelector('audio');
        const upvoteButton = tile.querySelector('.upvote-button');
        const voteCountSpan = tile.querySelector('.vote-count'); // Get the vote count span
        let isLiked = false;

        // Load the initial vote count from Firebase
        const initialLikes = await getInitialLikes(voiceName);
        voteCountSpan.textContent = initialLikes;

        // Check if the user has already liked the voice
        const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
        if (likedVoices[voiceName] === userIP) {
            isLiked = true;
            const heartIcon = upvoteButton.querySelector('i');
            heartIcon.classList.remove('bx-heart');
            heartIcon.classList.add('bx-heart', 'bxs-heart');
            heartIcon.style.color = 'red';
        }

        playButton.addEventListener('click', () => {
            if (currentlyPlaying && currentlyPlaying !== audio) {
                currentlyPlaying.pause();
                currentlyPlaying.currentTime = 0;
                const prevButton = document.querySelector(`[data-voice-id="${currentlyPlaying.id.replace('audio-','')}"] .play-button`);
                if (prevButton) {
                    prevButton.innerHTML = "<i class='bx bx-play'></i>";
                }
            }

            if (audio.paused) {
                audio.play();
                playButton.innerHTML = "<i class='bx bx-pause' ></i>";
                currentlyPlaying = audio;
            } else {
                audio.pause();
                playButton.innerHTML = "<i class='bx bx-play'></i>";
                currentlyPlaying = null;
            }
        });

        audio.addEventListener('ended', () => {
            playButton.innerHTML = "<i class='bx bx-play'></i>";
            currentlyPlaying = null;
        });

        upvoteButton.addEventListener('click', async () => {
            upvoteButton.style.pointerEvents = 'none'; // Disable pointer events
            isLiked = !isLiked;
            const heartIcon = upvoteButton.querySelector('i');

            try {
                if (isLiked) {
                    heartIcon.classList.remove('bx-heart');
                    heartIcon.classList.add('bx-heart', 'bxs-heart');
                    heartIcon.style.color = 'red';
                    const newLikes = await updateLikes(voiceName, 1);
                    voteCountSpan.textContent = newLikes; // Update the vote count
                    // Store the liked voice and user IP in localStorage
                    const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
                    likedVoices[voiceName] = userIP;
                    localStorage.setItem('likedVoices', JSON.stringify(likedVoices));
                } else {
                    heartIcon.classList.remove('bx-heart', 'bxs-heart');
                    heartIcon.classList.add('bx-heart');
                    heartIcon.style.color = '';
                    const newLikes = await updateLikes(voiceName, -1);
                    voteCountSpan.textContent = newLikes;// Update the vote count
                    // Remove the liked voice from localStorage
                    const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
                    delete likedVoices[voiceName];
                    localStorage.setItem('likedVoices', JSON.stringify(likedVoices));
                }
            } finally {
                upvoteButton.style.pointerEvents = 'auto'; // Re-enable pointer events
            }
        });
    });

    // Function to update the likes in Firestore
    async function updateLikes(voiceName, change) {
        const voiceRef = db.collection("voices").doc(voiceName);

        try {
            let newLikes;
            await db.runTransaction(async (transaction) => {
                const voiceDoc = await transaction.get(voiceRef);
                if (!voiceDoc.exists) {
                    newLikes = Math.max(0, change);
                    transaction.set(voiceRef, { likes: newLikes });
                } else {
                    newLikes = Math.max(0, (voiceDoc.data().likes || 0) + change);
                    transaction.update(voiceRef, { likes: newLikes });
                }
            });
            console.log("Likes updated successfully!");
            return newLikes; // Return the new likes count
        } catch (error) {
            console.error("Error updating likes:", error);
            throw error; // Re-throw the error to be caught by the caller
        }
    }

        // Function to get initial likes from Firestore
    async function getInitialLikes(voiceName) {
        const voiceRef = db.collection("voices").doc(voiceName);
        try {
            const voiceDoc = await voiceRef.get();
            if (voiceDoc.exists) {
                return voiceDoc.data().likes || 0;
            } else {
                return 0; // Default to 0 if the document doesn't exist
            }
        } catch (error) {
            console.error("Error getting initial likes:", error);
            return 0; // Default to 0 if there's an error
        }
    }
});