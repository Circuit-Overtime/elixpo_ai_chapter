let selectionLock = false; 
let typingTimeout;
let themeDiv = null;
let themeText = null;
const themes = ["Normal", "Chromatic", "Wpap", "Landscape", "Anime", "Pixel"];
const aspectRatios = ["1:1", "4:3", "16:9", "9:16"];
let selectedAspectRatio = "1:1";
let selectedTheme = "Normal";
let selectedText = "";
let shineButton = null; 
let wrapperCreated = false; 

document.addEventListener("mouseup", function (event) { 
    if(wrapperCreated) {
        return;
    }
    let selection = window.getSelection();
    selectedText = selection.toString().trim();
    setTimeout(() => {
        // console.log(selection.toString().trim())
        if (selection.toString().trim() == "") {
            if (document.querySelector(".shine-button")) {
                document.querySelector(".shine-button").remove();
                shineButton = null; 
            }
            selectionLock = false;
            return;
        }
    }, 200);
    

       
       if (selectionLock) {
        return;
    }

    let range = selection.getRangeAt(0);
    selectedText = selection.toString().trim();

    if (selectedText) {
        selectionLock = true;

      
        removeShineButton();
        shineButton = document.createElement("button");
        shineButton.classList.add("shine-button");
        let shineImage = document.createElement("img");
        shineImage.src = chrome.runtime.getURL("assests/shines_thumbnail.png"); 
        shineImage.alt = "Generate with Shines";  
        shineButton.appendChild(shineImage);


        
        Object.assign(shineButton.style, {
            position: "absolute",
            padding: "5px",
            height: "40px", 
            width: "45px",  
            zIndex: "10001", 
            background: "linear-gradient(135deg, #2a0038, #4b0082)", // Deep purple gradient
            border: "none",
            cursor: "pointer",
            borderRadius: "15px",
            opacity: "1",
            transition: "opacity 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
            display: "flex",       
            justifyContent: "center", 
            transform: "scale(0.8)", 
            alignItems: "center",     
            boxShadow: "inset 4px 4px 6px rgba(0, 0, 0, 0.8), inset -4px -4px 6px rgba(144, 0, 255, 0.3)", // Purple glow inset
        });
        
        

        Object.assign(shineImage.style, {
            width: "24px", 
            height: "24px",
        });


        
        let rect = range.getBoundingClientRect(); //Get bounding rectangle
        shineButton.style.left = `${rect.left + window.scrollX - shineButton.offsetWidth - 10}px`; // Position just to the left of the selection
        shineButton.style.top = `${rect.top + window.scrollY - 45}px`; // Adjust vertical position

       
        shineButton.addEventListener("click", function () {
            wrapperCreated = true;
            
            
            
            
            
            let node = document.createElement("div");
            node.classList.add("elixpo-wrapper");

            
            let contentContainer = document.createElement("div");
            contentContainer.classList.add("content-container");
            node.appendChild(contentContainer);

            let picContainer = document.createElement("div");
            picContainer.classList.add("pic-container");
            picContainer.setAttribute("id", "picContainer");
            picContainer.style.backgroundSize = "cover";
            contentContainer.appendChild(picContainer);

            let loaderDiv = document.createElement("div");
            loaderDiv.classList.add("loader");
            loaderDiv.setAttribute("id", "loader");
            picContainer.appendChild(loaderDiv);

            let controlsContainer = document.createElement("div");
            controlsContainer.classList.add("controls-container");
            contentContainer.appendChild(controlsContainer);

            let themeContainer = document.createElement("div");
            themeContainer.classList.add("themeContainer");
            controlsContainer.appendChild(themeContainer);



            let aspectContainer = document.createElement("div");
            aspectContainer.classList.add("aspect-container");
            controlsContainer.appendChild(aspectContainer);

            let promptcontrol = document.createElement("div");
            promptcontrol.classList.add("promptcontrol");
            node.appendChild(promptcontrol);

            let textBox = document.createElement("input");
            textBox.type = "text";
            textBox.placeholder = "Any Custom Instructions?";
            textBox.classList.add("promptInstruction");
            textBox.setAttribute("id", "promptInstruction");
            textBox.setAttribute("autocomplete", "off");
            textBox.setAttribute("spellcheck", "false");

            let generateButton = document.createElement("button");
            generateButton.classList.add("generate-button");
            generateButton.setAttribute("id", "generateImage");


            let downloadButton = document.createElement("button");
            downloadButton.classList.add("downloadBtn");
            downloadButton.setAttribute("id", "downloadBtn");
            downloadButton.style.opacity = "0";
            downloadButton.style.pointerEvents = "none";
            downloadButton.style.transition = "0.5s";

            let downloadIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            downloadIcon.setAttribute("class", "ionicon");
            downloadIcon.setAttribute("viewBox", "0 0 512 512");
            downloadIcon.setAttribute("width", "24");  
            downloadIcon.setAttribute("height", "24"); 


            let downloadPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            downloadPath.setAttribute("d", "M376 160H272v153.37l52.69-52.68a16 16 0 0122.62 22.62l-80 80a16 16 0 01-22.62 0l-80-80a16 16 0 0122.62-22.62L240 313.37V160H136a56.06 56.06 0 00-56 56v208a56.06 56.06 0 0056 56h240a56.06 56.06 0 0056-56V216a56.06 56.06 0 00-56-56zM272 48a16 16 0 00-32 0v112h32z");
            downloadIcon.appendChild(downloadPath);
            downloadButton.appendChild(downloadIcon);

            let sparkleIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            sparkleIcon.setAttribute("class", "ionicon");
            sparkleIcon.setAttribute("viewBox", "0 0 512 512");
            sparkleIcon.setAttribute("width", "24");  
            sparkleIcon.setAttribute("height", "24"); 

            let sparklePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            sparklePath.setAttribute("d", "M208 512a24.84 24.84 0 01-23.34-16l-39.84-103.6a16.06 16.06 0 00-9.19-9.19L32 343.34a25 25 0 010-46.68l103.6-39.84a16.06 16.06 0 009.19-9.19L184.66 144a25 25 0 0146.68 0l39.84 103.6a16.06 16.06 0 009.19 9.19l103 39.63a25.49 25.49 0 0116.63 24.1 24.82 24.82 0 01-16 22.82l-103.6 39.84a16.06 16.06 0 00-9.19 9.19L231.34 496A24.84 24.84 0 01208 512zm66.85-254.84zM88 176a14.67 14.67 0 01-13.69-9.4l-16.86-43.84a7.28 7.28 0 00-4.21-4.21L9.4 101.69a14.67 14.67 0 010-27.38l43.84-16.86a7.31 7.31 0 004.21-4.21L74.16 9.79A15 15 0 0186.23.11a14.67 14.67 0 0115.46 9.29l16.86 43.84a7.31 7.31 0 004.21 4.21l43.84 16.86a14.67 14.67 0 010 27.38l-43.84 16.86a7.28 7.28 0 00-4.21 4.21l-16.86 43.84A14.67 14.67 0 0188 176zM400 256a16 16 0 01-14.93-10.26l-22.84-59.37a8 8 0 00-4.6-4.6l-59.37-22.84a16 16 0 010-29.86l59.37-22.84a8 8 0 004.6-4.6l22.67-58.95a16.45 16.45 0 0113.17-10.57 16 16 0 0116.86 10.15l22.84 59.37a8 8 0 004.6 4.6l59.37 22.84a16 16 0 010 29.86l-59.37 22.84a8 8 0 00-4.6 4.6l-22.84 59.37A16 16 0 01400 256z");

            sparkleIcon.appendChild(sparklePath);
            generateButton.appendChild(sparkleIcon);

            let closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            closeIcon.setAttribute("id", "closePopup");
            closeIcon.setAttribute("class", "ionicon");
            closeIcon.setAttribute("viewBox", "0 0 512 512");
            closeIcon.setAttribute("width", "24");  
            closeIcon.setAttribute("height", "24"); 

            closeIcon.onclick = function () {
                node.style.transition = "opacity 0.5s ease-out";
                node.style.opacity = "0";
                setTimeout(() => {
                    node.remove();
                }, 500);
                selectionLock = false;
                wrapperCreated = false;
                removeShineButton();
            };

            let closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            closePath.setAttribute("d", "M289.94 256l95-95A24 24 0 00351 127l-95 95-95-95a24 24 0 00-34 34l95 95-95 95a24 24 0 1034 34l95-95 95 95a24 24 0 0034-34z");
            closeIcon.appendChild(closePath);

            
            promptcontrol.appendChild(closeIcon);
            promptcontrol.appendChild(textBox);
            promptcontrol.appendChild(generateButton);
            promptcontrol.appendChild(downloadButton);



            let pimpText = document.createElement("p");
            pimpText.textContent = "";
            pimpText.classList.add("pimp-text");
            pimpText.setAttribute("id", "pimpText");
            node.appendChild(pimpText);

            pimpText.style.setProperty('scroll-behavior', 'smooth');
            pimpText.style.setProperty('scroll-snap-type', 'y mandatory');
            pimpText.style.setProperty('scrollbar-width', 'none');
            


            

            for (let i = 0; i < themes.length; i++) {
                themeDiv = document.createElement("div");
                themeDiv.classList.add("theme-item");
                if (i === 0) {
                    themeDiv.classList.add("selected");
                }
                Object.assign(themeDiv.style, {
                    backgroundImage: `url('${chrome.runtime.getURL(`assests/${i}.jpeg`)}')`,
                    backgroundSize: "cover",
                });

                themeText = document.createElement("p");
                themeText.textContent = themes[i];

                themeDiv.appendChild(themeText);
                themeContainer.appendChild(themeDiv);

                Object.assign(themeContainer.style, {
                    width: "100%",
                    height: "75%",
                    padding: "10px",
                    boxSizing: "border-box",
                    display: "flex",
                    flexWrap: "wrap",          
                    justifyContent: "center",  
                    gap: "20px",               
                    overflowY: "auto",         
                    position: "relative",
                    background: "transparent",
                });

                
                themeContainer.style.setProperty("scroll-behavior", "smooth");
                themeContainer.style.setProperty("scroll-snap-type", "y mandatory");
                themeContainer.style.setProperty("scrollbar-width", "none");

                
                Object.assign(themeDiv.style, {
                    width: "calc(50% - 10px)",  
                    maxWidth: "150px",         
                    aspectRatio: "1 / 1",      
                    borderRadius: "15px",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundSize: "cover",
                    opacity: "0.35",
                    transition: "opacity 0.3s ease"
                });

                Object.assign(themeText.style, {
                    position: "absolute",
                    bottom: "5px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    margin: "0",
                    color: "white",
                    background: "rgba(8, 8, 8, 0.58)",
                    fontSize: "0.7em",
                    backdropFilter: "blur(2px)",
                    fontFamily: "'Source Code Pro', monospace",
                    padding: "5px",  
                    boxSizing: "border-box" 
                });

                themeDiv.addEventListener("mouseover", function () {
                    this.style.opacity = "1";
                });
                themeDiv.addEventListener("mouseleave", function () {
                    if (!this.classList.contains("selected")) {
                        this.style.opacity = "0.35";
                    }
                });

                themeDiv.addEventListener("click", function () {
                    document.querySelectorAll(".theme-item").forEach(item => {
                        item.classList.remove("selected");
                        item.style.opacity = "0.35"; 
                    });
                    this.classList.add("selected");
                    this.style.opacity = "1";
                    selectedTheme = themes[i]; 
                });
                const firstTheme = document.querySelector(".theme-item");
                if (firstTheme) {
                    firstTheme.classList.add("selected");
                    firstTheme.style.opacity = "1";

                }
            }


            



            for (let i = 0; i < aspectRatios.length; i++) {

                let aspectDiv = document.createElement("div");
                aspectDiv.classList.add("aspect-item");

                if (i === 0) {
                    aspectDiv.classList.add("selected");
                }

                aspectDiv.textContent = aspectRatios[i];
                aspectContainer.appendChild(aspectDiv);


                Object.assign(aspectContainer.style, {
                    width: "95%",
                    height: "25%",
                    display: "flex",
                    gap: "10px",
                    background: "transparent",
                    overflow: "hidden",
                    overflowX: "auto",
                    padding: "10px",
                    fontSize: "1em",
                    boxSizing: "border-box",
                    color: "#fff",
                    alignItems: "center",
                    justifyContent: "space-evenly",
                    fontFamily: "'Kanit', sans-serif",
                    fontWeight: "bold",
                    scrollBehavior: "smooth", 
                    scrollSnapType: "y mandatory", 
                    scrollbarWidth: "none" 
                });
                
                aspectContainer.style.setProperty("scroll-behavior", "smooth");
                aspectContainer.style.setProperty("scroll-snap-type", "y mandatory");
                aspectContainer.style.setProperty("scrollbar-width", "none");


                Object.assign(aspectDiv.style, {
                    padding: "10px",
                    borderRadius: "5px",
                    background: "rgba(255, 255, 255, 0.1)",
                    cursor: "pointer",
                    transition: "background 0.3s ease",
                    textAlign: "center",
                    flex: "1"
                });

                aspectDiv.addEventListener("mouseover", function () {
                    this.style.background = "rgba(255, 255, 255, 0.2)";
                });

                aspectDiv.addEventListener("mouseout", function () {
                    
                    if (!this.classList.contains("selected")) {
                        this.style.background = "rgba(255, 255, 255, 0.1)";
                    }
                });

                aspectDiv.addEventListener("click", function () {
                    
                    document.querySelectorAll(".aspect-item").forEach(item => {
                        item.classList.remove("selected");
                        item.style.background = "rgba(255, 255, 255, 0.1)"; 
                    });

                    
                    this.classList.add("selected");
                    this.style.background = "rgba(255, 255, 255, 0.3)";  

                    
                    selectedAspectRatio = this.textContent;
                });

            }



            

            Object.assign(node.style, {
                width: "70%",
                borderRadius: "8px",
                background: "rgba(22, 21, 21, 0.89)",
                backdropFilter: "blur(10px)",
                margin: "10px auto",
                maxWidth: "800px",
                zIndex: "10000",
                border: "3px solid rgb(255, 208, 0)",
                padding: "10px",
                display: "flex",
                flexDirection: "column",  
                alignItems: "center" 
            });

            Object.assign(contentContainer.style, {
                display: "flex",
                width: "100%",  
                height: "300px" 

            });

            Object.assign(picContainer.style, {
                width: "60%",
                height: "100%",
                borderRadius: "8px",
                background: "#111",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backdropFilter: "blur(10px)",
                overflow: "hidden",
                marginRight: "10px",
                boxSizing: "border-box" 
            });

            Object.assign(loaderDiv.style, {
                height: "100%",
                width: "100%",
                background: "linear-gradient(35deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)",
                backgroundSize: "300% 300%",
                backgroundPosition: "0% 50%",
                zIndex: "100",
                filter: "blur(20px)",
                animation: "backgroundShift 8s ease-in-out infinite alternate",
                transition: "0.25s",
                opacity: "0"
            });

            
            const styleSheet = document.styleSheets[0];
            styleSheet.insertRule(`
            @keyframes backgroundShift {
                0% { background-position: 0% 50%; }
                25% { background-position: 50% 50%; }
                50% { background-position: 100% 50%; }
                75% { background-position: 50% 50%; }
                100% { background-position: 0% 50%; }
            }
        `, styleSheet.cssRules.length);




            Object.assign(controlsContainer.style, {
                width: "40%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                boxSizing: "border-box"
            });




            Object.assign(promptcontrol.style, {
                width: "95%",
                marginTop: "10px",
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                padding: "10px",
                background: "transparent",
                height: "60px",
                boxSizing: "border-box"
            });

            Object.assign(textBox.style, {
                left: "3%",
                width: "60%",
                height: "45px",
                borderRadius: "5px",  
                textIndent: "10px",
                paddingRight: "10px",
                border: "none",
                background: "transparent",
                padding: "10px",
                color: "#fff",  
                fontSize: "0.8em",
                boxSizing: "border-box",
                outline: "none",  
                fontFamily: "'Source Code Pro', monospace",
                fontWeight: "400",
                textAlign: "left",
                border: "2px solid rgb(222, 146, 14)",
                marginBottom: "15px",

            });



            Object.assign(generateButton.style, {
                width: "45px",
                height: "45px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                background: "rgb(255, 208, 0)",
                cursor: "pointer",
                transition: "0.3s",
            });

            Object.assign(sparkleIcon.style, {
                fontSize: "24px",
                fill: "black",
                transform: "rotate(90deg)"
            });

            Object.assign(downloadButton.style, {
                width: "85px",
                height: "45px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                background: "rgb(6, 212, 109)",
                cursor: "pointer",
                transition: "0.3s",
            });

            Object.assign(downloadIcon.style, {
                fill: "black",
                transform: "rotate(0deg)"
            });

            Object.assign(closeIcon.style, {
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                transition: "0.3s",
                marginRight: "30    px"
            });

            Object.assign(closePath.style, {
                fill: "red"
            });

            Object.assign(pimpText.style, {
                color: "#999",
                opacity: "0.5",
                left: "3%",  
                position: "relative",
                marginTop: "15px",
                textAlign: "justify",
                fontSize: "0.8em",
                fontFamily: "'Kanit', sans-serif",
                fontWeight: "bold",
                alignSelf: "flex-start", 
                maxWidth: "85%",
                maxHeight: "80px",
                overflow: "hidden",
                marginLeft: "10px",
                textOverflow: "ellipsis",
                overflowY: "auto",
                paddingLeft: "15px",
                borderLeft: "5px solid rgb(255, 208, 0)",
            });


            textBox.style.setProperty('--placeholder-color', 'rgba(255, 255, 255, 0.97)');

            textBox.addEventListener('input', function () {
                if (this.value.length > 0) {
                    this.style.textAlign = 'left';
                } else {
                    this.style.textAlign = 'left';
                }
            });


            
            let container = range.startContainer;
            while (container.nodeType !== 1) {
                container = container.parentNode; // Move up to an element
            }

            
            container.parentNode.insertBefore(node, container.nextSibling);
            
            document.getElementById("generateImage").addEventListener("click", () => {
                generateImage();
            });
            document.getElementById("downloadBtn").addEventListener("click", () => {
                downloadImage();
            })
            type(`This is what you have selected haa? ..." ${selectedText} " \n Well Select any theme and aspect-ratio and HIT that generate button `);
            
            window.getSelection().removeAllRanges();
            removeShineButton(); 
        });

        
        document.body.appendChild(shineButton);
    } else {
        removeShineButton();
        selectionLock = false; 
    }
});

function removeShineButton() {
    if (document.querySelector(".shine-button")) {
        document.querySelector(".shine-button").remove();
        shineButton = null; 
    }
}


function type(text) {
    let element = document.getElementById("pimpText");
    element.textContent = "";
    let index = 0;

    function typeChar() {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            index++;
            typingTimeout = requestAnimationFrame(typeChar);
        }
    }

    cancelAnimationFrame(typingTimeout);
    typeChar();
}