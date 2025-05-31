import CODE_EXAMPLES from "./Config/codeExamplesText.js";
let firstFocusSegmentIntegrate = 'API Cheatsheet';
let currentSelectedMode = firstFocusSegmentIntegrate;
const integrateCodeSegmentDetectionDelay = 50;

// Declare outside DOMContentLoaded so showCodeDetails is accessible globally or where needed
// (assuming it needs to be called from other parts of the application)
const showCodeDetails = (modeName) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            currentSelectedMode = modeName;
            let language = "";
            console.log("Current selected mode:", currentSelectedMode);

            let fetchedCode = "";

            const codeBlock = document.getElementById("codeEditorZone");
             if (!codeBlock) {
                 console.error("Element with id 'codeEditorZone' not found.");
                 resolve(""); // Resolve promise even if element not found
                 return;
             }

            // Reset class before setting new code
            codeBlock.className = ''; // clear previous language classes

            switch (currentSelectedMode.trim()) {
                case "API Cheatsheet":
                    fetchedCode = CODE_EXAMPLES.api_cheatsheet.code();
                    language = "language-" + CODE_EXAMPLES.api_cheatsheet.language;
                    break;
                case "LLM Prompts":
                    fetchedCode = CODE_EXAMPLES.llm_prompt.code();
                    language = "language-" + CODE_EXAMPLES.llm_prompt.language;
                    break;
                case "LLM Prompts Chat":
                    fetchedCode = CODE_EXAMPLES.llm_prompt_chat.code();
                    language = "language-" + CODE_EXAMPLES.llm_prompt_chat.language;
                    break;
                case "Markdown":
                     // Example parameters - adjust as needed based on your CODE_EXAMPLES structure
                    fetchedCode = CODE_EXAMPLES.markdown.code({
                        imageURL: "https://image.pollinations.ai/prompt/a%20cute%20girl?nologo=true&width=1280&height=1280&seed=12",
                        prompt: "a cute girl",
                        width: "1280",
                        height: "1280",
                        seed: "12",
                        model: "flux"
                    });
                    language = "language-" + CODE_EXAMPLES.markdown.language;
                    break;
                case "React Hook":
                    fetchedCode = CODE_EXAMPLES.react.code({
                        prompt: "A beautiful landscape",
                        width: "1280",
                        height: "768",
                        seed: "12",
                        model: "flux"
                    });
                    language = "language-" + CODE_EXAMPLES.react.language;
                    break;
                case "HTML Mockup":
                    fetchedCode = CODE_EXAMPLES.html.code({
                        imageURL: "https://image.pollinations.ai/prompt/A%20beautiful%20landscape",
                        prompt: "A beautiful landscape",
                        width: "1280",
                        height: "768",
                        seed: "12",
                        model: "turbo"
                    });
                    language = "language-" + CODE_EXAMPLES.html.language;
                    break;
                case "Rust Snippet":
                    fetchedCode = CODE_EXAMPLES.rust.code({
                         prompt: "A cute teddy bear",
                         width: "1280",
                         height: "768",
                         seed: "12",
                         model: "flux"
                    });
                    language = "language-" + CODE_EXAMPLES.rust.language;
                    break;
                case "Node.js":
                     fetchedCode = CODE_EXAMPLES.nodejs.code({
                         prompt: "A cute cat wearing a superman costume",
                         width: "1280",
                         height: "768",
                         seed: "12",
                         model: "flux"
                     });
                    language = "language-" + CODE_EXAMPLES.nodejs.language;
                    break;
                case "Python":
                     fetchedCode = CODE_EXAMPLES.python.code({
                         prompt: "A cute dog wearing a superman costume",
                         width: "1280",
                         height: "768",
                         seed: "12",
                         model: "flux"
                     });
                    language = "language-" + CODE_EXAMPLES.python.language;
                    break;
                case "Feed Endpoints":
                    fetchedCode = CODE_EXAMPLES.feed_endpoints.code();
                    language = "language-" + CODE_EXAMPLES.feed_endpoints.language;
                    break;
                case "Audio":
                    fetchedCode = CODE_EXAMPLES.audio.code();
                    language = "language-" + CODE_EXAMPLES.audio.language;
                    break;
                case "MCP Server":
                    fetchedCode = CODE_EXAMPLES.mcp_server.code();
                    language = "language-" + CODE_EXAMPLES.mcp_server.language;
                    break;
                default:
                     // Handle cases where the mode name might not exactly match
                     // or provide a default message/code
                     console.warn(`No code example found for mode: ${currentSelectedMode}`);
                     fetchedCode = `// No example found for "${currentSelectedMode}"`;
                     language = "language-javascript"; // Default language
                     break;
            }

             const languageLabel = document.getElementById("language_label");
             if(languageLabel) {
                 languageLabel.textContent = language.replace('language-', '') || 'text'; // Display language name
             } else {
                 console.warn("Element with id 'language_label' not found.");
             }


            codeBlock.classList.add(language);
            codeBlock.textContent = fetchedCode.trim();

            // Ensure Prism is available before highlighting
            if (typeof Prism !== 'undefined') {
                 Prism.highlightElement(codeBlock);
            } else {
                 console.warn("Prism.js not loaded, code highlighting skipped.");
            }


            // Animate with Anime.js (fade in + translate)
            if (typeof anime !== 'undefined') {
                anime({
                    targets: codeBlock,
                    opacity: [0, 1],
                    translateY: [20, 0],
                    scale : [0.98, 1], // Slightly less intense scale animation
                    duration: 400, // Shorter duration
                    easing: 'easeOutQuad'
                });
            } else {
                 console.warn("Anime.js not loaded, element animation skipped.");
                 codeBlock.style.opacity = 1; // Ensure it's visible
                 codeBlock.style.transform = 'none'; // Reset transform if any initial style is present
            }


            resolve(fetchedCode);
        }, 50); // Reduced delay slightly
    });
};


document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list-integrate');
    // Ensure segmentList exists before proceeding
    if (!segmentList) {
        console.error("Element with class 'segment-list-integrate' not found.");
        return;
    }

    let dragEndedRecently = false;
    let showDetailsTimeout; // Still needed for the delayed call
    const segmentContent = [
        'LLM Prompts',
        'LLM Prompts Chat',
        'Markdown',
        'React Hook',
        'HTML Mockup',
        'API Cheatsheet',
        'Rust Snippet',
        'Node.js',
        'Python',
        'Feed Endpoints',
        'Audio',
        'MCP Server'
    ];

    let scrollTimeout; // Timeout for snapping after scroll stops
    const scrollStopDelay = 200; // Delay for snapping
    let isDragging = false; // Flag to indicate if a custom drag is in progress
    let startY; // Starting Y coordinate for drag (mouse or touch)
    let startScrollTop; // Starting scrollTop for drag
    let animation = null; // Anime.js animation instance
    let itemFullHeight = 0; // Height of a segment item + margin
    const dragSensitivityFactor = 0.889; // Factor to reduce drag sensitivity


     // Debounce function (already good)
     function debounce(func, delay) {
        let timer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => {
                func.apply(context, args);
            }, delay);
        };
     }

    // Get the index of the element closest to the center (already good)
    function getClosestElementIndexToCenter() {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (segments.length === 0) return -1;

        let closestIndex = -1;
        let minDistance = Infinity;
        const containerCenter = segmentList.scrollTop + segmentList.clientHeight / 2;

        segments.forEach((segment, index) => {
             const segmentCenter = segment.offsetTop + segment.offsetHeight / 2;
             const distanceRelativeToCenter = Math.abs(segmentCenter - containerCenter);
            if (distanceRelativeToCenter < minDistance) {
                minDistance = distanceRelativeToCenter;
                closestIndex = index;
            }
        });
        return closestIndex;
    }

    // Calculate the scrollTop needed to center an element at a given index (already good)
    function getScrollTopToCenterElementIndex(index) {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (index < 0 || index >= segments.length) return segmentList.scrollTop;

        const targetElement = segments[index];
        const targetScrollTop = targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);

        // Clamp the targetScrollTop to prevent over-scrolling
         const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
         return Math.max(0, Math.min(maxScrollTop, targetScrollTop));
    }

    // Update visual styles based on proximity to center (already good)
    function updateStyles() {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        segments.forEach((segment, index) => {
            segment.classList.remove('selected', 'faint', 'most-fainted');

            if (index === closestIndex) {
                segment.classList.add('selected');
            } else if (Math.abs(index - closestIndex) === 1) {
                segment.classList.add('faint');
            } else if (Math.abs(index - closestIndex) >= 2) { // Apply 'most-fainted' to items 2 or more away
                segment.classList.add('most-fainted');
            }
         });
    }

     // Set padding to center the list content vertically (already good)
     function setDynamicPadding() {
         const firstItem = segmentList.querySelector('.segment-item-integrate');
         if (!firstItem) {
              console.warn("No segment items found to calculate padding.");
              return;
         }

         // Only calculate itemFullHeight once if possible
         if (itemFullHeight === 0) {
            const itemStyle = getComputedStyle(firstItem);
            itemFullHeight = firstItem.offsetHeight + parseFloat(itemStyle.marginTop) + parseFloat(itemStyle.marginBottom);
         }


         const containerHeight = segmentList.clientHeight;
         const requiredPadding = (containerHeight / 2) - (itemFullHeight / 2);
         const paddingTopBottom = Math.max(0, requiredPadding); // Ensure padding is not negative
         segmentList.style.paddingTop = `${paddingTopBottom}px`;
         segmentList.style.paddingBottom = `${paddingTopBottom}px`;

         // Update styles after padding changes, as it might affect centering
         updateStyles();
     }

    // Smoothly scroll to a segment by index using Anime.js
    function scrollToSegment(index, duration, easing) {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (index < 0 || index >= segments.length) return;

        const clampedScrollTop = getScrollTopToCenterElementIndex(index); // Use the clamped value

        // Only animate if the target is significantly different from the current position
        if (Math.abs(segmentList.scrollTop - clampedScrollTop) > 1) {
             // Stop any existing animation
             if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                  animation.pause();
             }
            // Use requestAnimationFrame to ensure animation target is correct after potential layout shifts
             requestAnimationFrame(() => {
                 animation = anime({
                     targets: segmentList,
                     scrollTop: clampedScrollTop,
                     easing: easing,
                     duration: duration,
                     autoplay: true,
                     complete: () => {
                          updateStyles();
                          animation = null; // Clear animation reference

                          // Clear any pending showDetails timeout if a new scroll completes
                          clearTimeout(showDetailsTimeout);
                          const centeredIndex = getClosestElementIndexToCenter();
                           if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                             // Pass the actual text content
                             delayedShowProjectDetails(segmentContent[centeredIndex]);
                           }
                     }
                 });
             });
        } else {
             // If already close, just update styles and trigger details without animation
             updateStyles();
             clearTimeout(showDetailsTimeout);
              const centeredIndex = getClosestElementIndexToCenter();
               if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                    delayedShowProjectDetails(segmentContent[centeredIndex]);
               }
        }
    }

    // Delay the call to showCodeDetails
    function delayedShowProjectDetails(modeName) {
        clearTimeout(showDetailsTimeout);

        showDetailsTimeout = setTimeout(() => {
             // Check if the currently centered item is *still* the one we intended
             // before triggering the expensive showCodeDetails operation.
             // This helps prevent flickering if scroll events fire rapidly near the end.
            const currentlyCenteredIndex = getClosestElementElementToCenter()?.dataset.index; // Assuming getClosestElementElementToCenter returns element
             const intendedMode = modeName.trim();
             const currentlyCenteredMode = segmentContent[currentlyCenteredIndex]?.trim();


            if (currentlyCenteredMode === intendedMode) {
                 // Make sure showCodeDetails function exists (defined outside DOMContentLoaded)
                 if (typeof showCodeDetails === 'function') {
                     showCodeDetails(modeName);
                 } else {
                     console.log("showCodeDetails function not available. Placeholder called with:", modeName);
                     // Optionally call a placeholder or just log
                 }
            } else {
                // This can happen if the user scrolls again before the timeout fires
                // console.log(`Delayed details for "${intendedMode}" cancelled. "${currentlyCenteredMode}" is now centered.`);
            }

        }, integrateCodeSegmentDetectionDelay);
    }


    // Function called when scroll stops (mouse wheel, touch flick, drag release)
    const handleScrollStop = () => {
        // Only snap if we are not currently dragging or animating
        if (!isDragging && (animation === null || animation.state === 'stopped')) {
            const closestIndex = getClosestElementIndexToCenter();
            if (closestIndex !== -1 && closestIndex < segmentContent.length) {
                 scrollToSegment(closestIndex, 800, 'easeOutElastic(1, .2)');
            }
        }
    };

    // Handle scroll events while the list is being scrolled natively (flicking, mouse wheel)
    // This updates styles immediately and sets a timeout to handle snapping after scrolling stops.
     const handleScrollOnScroll = () => {
         updateStyles(); // Update styles while scrolling
         // Clear the previous scroll stop timeout and set a new one
         clearTimeout(scrollTimeout);
         // Only set the timeout if not dragging or animating
         if (!isDragging && (animation === null || animation.state === 'stopped')) {
            scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         }
         // Also clear the show details timeout while scrolling, it will be set by handleScrollStop -> scrollToSegment -> delayedShowProjectDetails
         clearTimeout(showDetailsTimeout);
    };

    // Helper function to get the element closest to center
     function getClosestElementElementToCenter() {
         const segments = segmentList.querySelectorAll('.segment-item-integrate');
         if (segments.length === 0) return null;

         let closestElement = null;
         let minDistance = Infinity;
         const containerCenter = segmentList.scrollTop + segmentList.clientHeight / 2;

         segments.forEach((segment) => {
              const segmentCenter = segment.offsetTop + segment.offsetHeight / 2;
              const distanceRelativeToCenter = Math.abs(segmentCenter - containerCenter);
             if (distanceRelativeToCenter < minDistance) {
                 minDistance = distanceRelativeToCenter;
                 closestElement = segment;
             }
         });
         return closestElement;
     }


    // Populate the list with segment items (already good)
    function populateSegments() {
        segmentList.innerHTML = '';
        segmentContent.forEach((content, index) => {
            const segmentItem = document.createElement('div');
            segmentItem.classList.add('segment-item-integrate');
            segmentItem.textContent = content;
            segmentItem.dataset.index = index; // Store index as data attribute
            segmentList.appendChild(segmentItem);
        });
         // Calculate padding after populating
        setDynamicPadding();
    }


    // --- Mouse Events ---
    segmentList.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left mouse button

        isDragging = true;
        startY = e.clientY;
        startScrollTop = segmentList.scrollTop;
        segmentList.style.cursor = 'grabbing';
        // Stop any ongoing animation immediately on drag start
        if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
            animation.pause();
            animation = null;
        }
        // Clear timeouts on drag start
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
         // Prevent default only if needed to stop potential native drag, but letting text select is often better
         // e.preventDefault(); // Consider if you need this - might prevent selecting text
    });

     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent default scrolling behavior when dragging

        const deltaY = e.clientY - startY;
        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor); // Apply sensitivity factor
        segmentList.scrollTop = newScrollTop;
        updateStyles(); // Update styles while dragging
     });

     document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        segmentList.style.cursor = 'grab'; // Restore cursor

        // Set flag to prevent immediate click handler after drag
        dragEndedRecently = true;
        // Reset the flag after a short delay
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300); // Short delay is sufficient

        // Handle potential snap and details display after drag ends
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         // Don't clear showDetailsTimeout here, handleScrollStop will manage it via scrollToSegment
    });

    // --- Touch Events ---
    segmentList.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return; // Only handle single touch

        isDragging = true;
        startY = e.touches[0].clientY;
        startScrollTop = segmentList.scrollTop;
        // Stopping animation and clearing timeouts is important for touch drag too
        if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
            animation.pause();
            animation = null;
        }
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
         // No need to prevent default here initially, let touchmove decide
    }, { passive: true }); // Use passive: true for touchstart for better performance

     segmentList.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault(); // Prevent native touch scrolling when custom dragging

        const deltaY = e.touches[0].clientY - startY;
        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor);
        segmentList.scrollTop = newScrollTop;
        updateStyles();
     }, { passive: false }); // passive: false is needed to allow preventDefault()

     const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        // No cursor to reset for touch

        dragEndedRecently = true;
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300); // Short delay

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         // Don't clear showDetailsTimeout here, handleScrollStop will manage it
     };

     segmentList.addEventListener('touchend', handleTouchEnd);
     segmentList.addEventListener('touchcancel', handleTouchEnd); // Handle touch interruptions


    // --- Wheel Event (primarily for mouse/trackpad) ---
    // This handler forces stepping item by item rather than smooth native scroll.
    // If you prefer native smooth scrolling + snap for mouse wheel, you can remove this
    // and rely solely on the 'scroll' listener and handleScrollStop.
    segmentList.addEventListener('wheel', (e) => {
        e.preventDefault(); // Prevent default mouse wheel scroll

        // Only respond if not dragging or animating
        if (isDragging || (animation && animation.state !== 'stopped')) {
             return;
        }

        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        if (closestIndex === -1) return;

        let targetIndex = closestIndex;
        const direction = e.deltaY > 0 ? 1 : -1; // Determine scroll direction
        targetIndex += direction; // Move to the next/previous index
        targetIndex = Math.max(0, Math.min(segments.length - 1, targetIndex)); // Clamp index

        // Scroll to the calculated target index
        scrollToSegment(targetIndex, 500, 'easeInOutQuad'); // Use a different easing/duration for step scrolling

        // Clearing these timeouts prevents handleScrollOnScroll/handleScrollStop from interfering
        // while the wheel-initiated animation is running.
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);


    }, { passive: false }); // passive: false is needed to call preventDefault()


    // --- Global Scroll Listener (Handles native scrolling from flicking/wheel if not handled by custom wheel handler) ---
    // Attach this listener ONCE during initialization. Its logic prevents
    // interfering with custom drags or animations.
    segmentList.addEventListener('scroll', handleScrollOnScroll);


    // --- Click Listener (Handles taps) ---
    // Needs to be after mouseup/touchend handlers which set dragEndedRecently
    segmentList.addEventListener('click', (e) => {
        // If a drag just ended, ignore the click event
        if (dragEndedRecently) {
            e.stopPropagation();
            // console.log("Click ignored due to recent drag");
            return;
        }

        const clickedSegment = e.target.closest('.segment-item-integrate');
        // Only proceed if a segment item was clicked
        if (!clickedSegment) {
            // console.log("Click not on a segment item");
            return;
        }

        // Get the index from the data attribute
        const clickedIndex = parseInt(clickedSegment.dataset.index, 10);

        // Ensure the index is valid
        if (!isNaN(clickedIndex) && clickedIndex !== -1 && clickedIndex < segmentContent.length) {
            // Scroll to the clicked segment
            scrollToSegment(clickedIndex, 500, 'easeInOutQuad');

            // Clear any pending timers that might trigger old actions
            clearTimeout(scrollTimeout);
            clearTimeout(showDetailsTimeout);

            // Note: The delayedShowProjectDetails call is handled within scrollToSegment's complete callback
            // or immediately if no scroll is needed.
        }
    });

    // --- Initialization ---
    // Populate the list items
    populateSegments();

    // Use requestAnimationFrame to ensure layout is ready before initial positioning
    requestAnimationFrame(() => {
         // Set initial padding based on calculated item height and container size
         setDynamicPadding();

        const initialContentText = firstFocusSegmentIntegrate;
        const segments = segmentList.querySelectorAll('.segment-item-integrate');

        let initialSelectedIndex = -1;

        // Find the index of the segment matching firstFocusSegmentIntegrate
        segments.forEach((segment, index) => {
             if (segment.textContent === initialContentText) {
                 initialSelectedIndex = index;
             }
        });

        // If the initial text was found, scroll to it, otherwise scroll to the middle element
        let indexToCenterInitially = initialSelectedIndex !== -1 ? initialSelectedIndex : (segments.length > 0 ? Math.floor(segments.length / 2) : -1);

        if (indexToCenterInitially !== -1 && indexToCenterInitially < segmentContent.length) {
             const targetScrollTop = getScrollTopToCenterElementIndex(indexToCenterInitially);
             segmentList.scrollTop = targetScrollTop;
        }

        // Update styles and show details for the initially centered item
        updateStyles();
         const centeredIndex = getClosestElementIndexToCenter();
         if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
             // Pass the actual text content
            delayedShowProjectDetails(segmentContent[centeredIndex]);
         }

    });


     // Handle window resize: re-calculate padding and snap to the nearest element
     window.addEventListener('resize', debounce(() => {
         setDynamicPadding(); // Recalculate padding based on new size
         // After resizing, the currently centered element might shift.
         // Trigger a scroll stop handler to re-snap to the closest item.
         clearTimeout(scrollTimeout);
         scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
     }, 100));


     // Ensure showCodeDetails is attached to a global scope or accessible if needed elsewhere
     // window.showCodeDetails = showCodeDetails; // Example if it needs to be globally accessible

}); // End DOMContentLoaded

// Ensure createToastNotification function is defined elsewhere or add a placeholder
// function createToastNotification(message) { console.log("Toast:", message); }


document.getElementById("copyCodeSnippet").addEventListener("click", () => {
    const codeBlock = document.getElementById("codeEditorZone");
    if (!codeBlock) {
        console.error("Element with id 'codeEditorZone' not found for copy.");
        return;
    }
    const codeText = codeBlock.textContent;

    // Use Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
         navigator.clipboard.writeText(codeText).then(() => {
             console.log("Code copied to clipboard");
             // Make sure createToastNotification exists
             if (typeof createToastNotification === 'function') {
                createToastNotification("Code copied to clipboard successfully!");
             }
         }).catch(err => {
             console.error("Failed to copy code: ", err);
              if (typeof createToastNotification === 'function') {
                createToastNotification("Failed to copy code.");
              }
         });
    } 
});
