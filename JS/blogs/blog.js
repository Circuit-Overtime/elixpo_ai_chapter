const firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();


  let backToTopButton = document.getElementById("back-to-top");

  hljs.highlightAll();


        
    backToTopButton.onclick = function () {
        document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    };

    document.querySelectorAll('.copyCode').forEach(button => {
        button.addEventListener('click', () => {
            button.classList.remove('bi-clipboard');
            button.classList.add('bi-clipboard-check');
            setTimeout(() => {
                button.classList.add('bi-clipboard');
                button.classList.remove('bi-clipboard-check');
            }, 1000);
            const codeBlock = button.nextElementSibling;
            const codeText = codeBlock.innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                // alert('Code copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy code: ', err);
            });
        });
    });




    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            backToTopButton.style.right = "20px";
        } else {
            backToTopButton.style.right = "-60px";
        }
    };




function notify(msg) {
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("NotifTxt").innerText = msg;
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
        document.getElementById("NotifTxt").innerText = "";
    }, 3500);
}
    

window.addEventListener("load", function () {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get("cmp")) 
    {
        const encryptedComment = sessionStorage.getItem(urlParams.get("cmp"));
        if (encryptedComment) {
            const decodedComment = atob(encryptedComment);
            const originalComment = decodedComment.slice(64); // SHA-256 hash length is 64 characters
            document.getElementById("commentInput").value = originalComment;
            addComment(originalComment, urlParams.get("cmp"));
        }
        else 
        {
            notify("Oops! Can you comment again?");
            try 
            {
                sessionStorage.removeItem(urlParams.get("cmp"));
            }
            catch (e) {
                notify("Oops! Can you comment again?");
            }
            const url = new URL(window.location);
            url.searchParams.delete("cmp");
            window.history.replaceState({}, document.title, url.toString());
        }
        
    }
    if ((window.matchMedia("(max-width: 767px)").matches) || navigator.userAgent.toLowerCase().includes("mobi"))
        {
         document.querySelector(".cta-buttonnav").innerText = "";
         document.querySelector(".cta-buttonnav").innerHTML = "<i class='bi bi-palette'></i>";
            
        } 
        else 
        {
            document.querySelector(".cta-buttonnav").innerHTML = "";
            document.querySelector(".cta-buttonnav").innerText = "Try Elixpo Art Now";
        }
        fetchComments();
    });

    window.addEventListener("resize", function () {
        if ((window.matchMedia("(max-width: 767px)").matches) || navigator.userAgent.toLowerCase().includes("mobi"))
            {
             document.querySelector(".cta-buttonnav").innerText = "";
             document.querySelector(".cta-buttonnav").innerHTML = "<i class='bi bi-palette'></i>";
                
            }
            else 
            {
                document.querySelector(".cta-buttonnav").innerHTML = "";
                document.querySelector(".cta-buttonnav").innerText = "Try Elixpo Art Now";
            } 
        });

document.getElementById("redirectHome").addEventListener("click", function() {
    redirectTo("");
    });

document.getElementById("commentClose").addEventListener("click", function() {
    document.querySelector(".floating-navbar").classList.remove("comments")
    });

    document.getElementById("commentsIcon").addEventListener("click", function() {
        document.querySelector(".floating-navbar").classList.add("comments")
        document.getElementById("commentInput").focus();
    });
    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            document.querySelector(".floating-navbar").classList.remove("comments");
        }
    });

document.getElementById("commentSubmit").addEventListener("click", () => {
    comment = document.getElementById("commentInput").value;
    addComment(comment, "");
})

async function addComment(comment, hash) 
{
   
    let username = localStorage.getItem("ElixpoAIUser");
    if (!username || username === "" || username == undefined) {
    const encoder = new TextEncoder();
    const data = encoder.encode(comment);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const encryptedComment = btoa(hashHex + comment);
    sessionStorage.setItem(hashHex, encryptedComment);    
    redirectTo(`src/auth/?notify=true&cmp=${hashHex}`);
    }
    
  
    const commentsRef = db.ref(`comments/`);
    await commentsRef.push({
        username,
        comment,
        timestamp: new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
    });
    notify("Thanks for your comment!");
    let commentNode = `
    <div class="comment">
        <div class="comment-author">${username}</div>
        <div class="comment-date">${new Date().toLocaleString('en-GB', { 
            day: '2-digit', month: '2-digit', year: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        })}</div>
        <div class="comment-text">${comment}</div>
    </div>
`;
    document.getElementById("comments-list").innerHTML += commentNode;

    try 
    {
        sessionStorage.removeItem(hash);
    }
    catch
    {
        console.log("No hash to remove");
    }
    document.getElementById("commentInput").value = "";
    document.querySelector(".floating-navbar").classList.remove("comments");
    document.getElementById("noCommentsText").style.display = "none";
    const url = new URL(window.location);
    url.searchParams.delete("cmp");
    window.history.replaceState({}, document.title, url.toString());
  }

  function fetchComments() {
    const commentsRef = db.ref(`comments/`);
    const commentsContainer = document.getElementById("comments-list");
    commentsContainer.innerHTML = ""; 
    commentsRef.once("value", (snapshot) => {
        if (snapshot.exists()) {
            document.getElementById("noCommentsText").style.display = "none";
            // console.log(Object.keys(snapshot.val()).length);
            // Iterate over all comments
            const comments = snapshot.val();
            for (let key in comments) {
                if (comments.hasOwnProperty(key)) {
                    const comment = comments[key];
                    const commentNode = document.createElement("div");
                    commentNode.classList.add("comment");
                    commentNode.innerHTML = `
                        <div class="comment-author">${comment.username}</div>
                        <div class="comment-date">${comment.timestamp}</div>
                        <div class="comment-text">${comment.comment}</div>
                    `;
                    commentsContainer.appendChild(commentNode);
                }
            }
        } else {
            // Handle case where there are no comments
            document.getElementById("noCommentsText").innerText = 
                "You like being the first right? Be the first one to review please xD";
            document.getElementById("noCommentsText").style.display = "block";
        }
    });
}

document.getElementById("elixpoArtRedirect").addEventListener("click", function() {
    redirectTo("src/create");
});

document.getElementById("integrations").addEventListener("click", function() {
    redirectTo("integrations");
});