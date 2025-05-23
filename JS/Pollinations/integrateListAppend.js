import CODE_EXAMPLES from "./Config/codeExamplesText.js";
let firstFocusSegmentIntegrate = 'API Cheatsheet';
let currentSelectedMode = firstFocusSegmentIntegrate;
const integrateCodeSegmentDetectionDelay = 50; 
document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list-integrate');
    let dragEndedRecently = false;
    let showDetailsTimeout;
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

    let scrollTimeout;
    const scrollStopDelay = 200; // Increased delay for snapping after scroll stops (drag or momentum)
    let isDragging = false;
    let startY;
    let startScrollTop;
    let animation = null;
    let itemFullHeight = 0;
    const dragSensitivityFactor = 0.889; // Factor to reduce drag sensitivity (lower = less sensitive)


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

    function getScrollTopToCenterElementIndex(index) {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (index < 0 || index >= segments.length) return segmentList.scrollTop;

        const targetElement = segments[index];
        const targetScrollTop = targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);

        return targetScrollTop;
    }


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
            } else if (Math.abs(index - closestIndex) === 2) {
                segment.classList.add('most-fainted');
            }
         });
    }

     function setDynamicPadding() {
         if (itemFullHeight === 0) {
              const firstItem = segmentList.querySelector('.segment-item-integrate');
              if (firstItem) {
                  itemFullHeight = firstItem.offsetHeight + parseFloat(getComputedStyle(firstItem).marginBottom);
              } else {
                  return;
              }
         }

         const containerHeight = segmentList.clientHeight;
         const requiredPadding = (containerHeight / 2) - (itemFullHeight / 2);
         const paddingTopBottom = Math.max(0, requiredPadding);
         segmentList.style.paddingTop = `${paddingTopBottom}px`;
         segmentList.style.paddingBottom = `${paddingTopBottom}px`;
         updateStyles();
     }


    function scrollToSegment(index, duration, easing) {
        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (index < 0 || index >= segments.length) return;

        const targetScrollTop = getScrollTopToCenterElementIndex(index);
        const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
        const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

        if (Math.abs(segmentList.scrollTop - clampedScrollTop) > 1) {
             if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                  animation.pause();
             }
            animation = anime({
                targets: segmentList,
                scrollTop: clampedScrollTop,
                easing: easing,
                duration: duration,
                autoplay: true,
                complete: () => {
                     updateStyles();
                     animation = null;
                     // Clear any pending showDetails timeout if a new scroll completes
                     clearTimeout(showDetailsTimeout);
                     const centeredIndex = getClosestElementIndexToCenter();
                      if (centeredIndex !== -1) {
                        delayedShowProjectDetails(` ${segmentContent[centeredIndex ]}`);
                      }
                }
            });
        } else {
             updateStyles();
             // If already close, trigger showDetails immediately without animation complete
             clearTimeout(showDetailsTimeout);
              const centeredIndex = getClosestElementIndexToCenter();
               if (centeredIndex !== -1) {
                    delayedShowProjectDetails(` ${segmentContent[centeredIndex ]}`);
               }
        }
    }

    function delayedShowProjectDetails(modeName) {
        clearTimeout(showDetailsTimeout);

        showDetailsTimeout = setTimeout(() => {
            if (typeof showCodeDetails === 'function') {
                showCodeDetails(modeName);
            } else {
                 console.log("integrate placeholder called with:", modeName);
            }
        }, integrateCodeSegmentDetectionDelay);
    }


    function handleScrollStop() {
        if (isDragging || (animation && animation.state !== 'stopped')) {
            return;
        }

        const closestIndex = getClosestElementIndexToCenter();
        if (closestIndex !== -1) {
            scrollToSegment(closestIndex, 800, 'easeOutElastic(1, .2)');

        }
    }


    function populateSegments() {
        segmentList.innerHTML = '';
        segmentContent.forEach((content, index) => {
            const segmentItem = document.createElement('div');
            segmentItem.classList.add('segment-item-integrate');
            segmentItem.textContent = content;
            segmentItem.dataset.index = index;
            segmentList.appendChild(segmentItem);
        });

    }


    segmentList.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        isDragging = true;
        startY = e.clientY;
        startScrollTop = segmentList.scrollTop;
        segmentList.style.cursor = 'grabbing';
        if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
            animation.pause();
            animation = null;
        }
        segmentList.removeEventListener('scroll', handleScrollOnScroll);
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
    });

     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const deltaY = e.clientY - startY;

        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor);
        segmentList.scrollTop = newScrollTop;
        updateStyles();
     });

     document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        segmentList.style.cursor = 'grab';

        if (!segmentList.dataset.scrollListenerAdded) {
            segmentList.addEventListener('scroll', handleScrollOnScroll);
            segmentList.dataset.scrollListenerAdded = 'true';
        }

        dragEndedRecently = true;

        setTimeout(() => {
            dragEndedRecently = false;
        }, 300);

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            handleScrollStop();
        }, scrollStopDelay);
    });

    segmentList.addEventListener('wheel', (e) => {
        e.preventDefault();

        if (isDragging || (animation && animation.state !== 'stopped')) {
             return;
        }

        const segments = segmentList.querySelectorAll('.segment-item-integrate');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        if (closestIndex === -1) return;

        let targetIndex = closestIndex;
        const direction = e.deltaY > 0 ? 1 : -1;
        targetIndex += direction;
        targetIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));

        scrollToSegment(targetIndex, 800, 'easeInOutQuad');
        clearTimeout(scrollTimeout);
         clearTimeout(showDetailsTimeout);


    }, { passive: false });

    const handleScrollOnScroll = () => {
         updateStyles();
         if (!isDragging && (animation === null || animation.state === 'stopped')) {
             clearTimeout(scrollTimeout);
             scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         }
    };

    if (!segmentList.dataset.scrollListenerAdded) {
        segmentList.addEventListener('scroll', handleScrollOnScroll);
        segmentList.dataset.scrollListenerAdded = 'true';
    }


    // Add click listener for scrolling to the clicked segment
    segmentList.addEventListener('click', (e) => {
        // Prevent click handling immediately after a drag
        if (dragEndedRecently) {
            e.stopPropagation(); // Stop the click event from propagating further
            return;
        }

        const clickedSegment = e.target.closest('.segment-item-integrate');
        // Check if the click was on a segment item
        if (!clickedSegment) {
            return; // If not, do nothing
        }

        // Get the index of the clicked segment from its data attribute
        const clickedIndex = parseInt(clickedSegment.dataset.index, 10);

        // Ensure the index is valid
        if (!isNaN(clickedIndex) && clickedIndex !== -1) {
            // Scroll to the clicked segment using the existing function
            scrollToSegment(clickedIndex, 500, 'easeInOutQuad');

            // Clear any pending scroll stop or details display timers
            clearTimeout(scrollTimeout);
            clearTimeout(showDetailsTimeout);

            // Note: The delayedShowProjectDetails call is handled within scrollToSegment's complete callback
            // or immediately if no scroll is needed.
        }
    });

    populateSegments();
    requestAnimationFrame(() => {
         setDynamicPadding();
        const initialContentText = firstFocusSegmentIntegrate;
        const segments = segmentList.querySelectorAll('.segment-item-integrate');

        let segmentToCenter = null;
        let initialSelectedIndex = -1;

        segments.forEach((segment, index) => {
             if (segment.textContent === initialContentText) {
                 segmentToCenter = segment;
                 initialSelectedIndex = index;
             }
        });

        if (segmentToCenter) {
             const targetScrollTop = getScrollTopToCenterElementIndex(initialSelectedIndex);
             const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
             const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

             segmentList.scrollTop = clampedScrollTop;
        } else {
             if (segments.length > 0) {
                  const middleElementIndex = Math.floor(segments.length / 2);
                  const targetScrollTop = getScrollTopToCenterElementIndex(middleElementIndex);
                   const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
                   const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
                  segmentList.scrollTop = clampedScrollTop;
             }
        }

        updateStyles();
         const centeredIndex = getClosestElementIndexToCenter();
         if (centeredIndex !== -1) {
            delayedShowProjectDetails(` ${segmentContent[centeredIndex ]}`);
         }

    });

     window.addEventListener('resize', debounce(() => {
         setDynamicPadding();
         clearTimeout(scrollTimeout);
         scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
     }, 100));
});
const showCodeDetails = (modeName) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            currentSelectedMode = modeName;
            let language = "";
            console.log("Current selected mode:", currentSelectedMode);

            let fetchedCode = "";

            const codeBlock = document.getElementById("codeEditorZone");

            // Reset class and opacity before setting new code
            codeBlock.className = ''; // clear previous language classes
            // codeBlock.parentElement.classList.remove("line-numbers"); // if added conditionally

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
                    break;
            }

            document.getElementById("language_label").textContent = language.split("-")[1];
            codeBlock.classList.add(language);
            codeBlock.textContent = fetchedCode.trim();
            Prism.highlightElement(codeBlock);

            // Animate with Anime.js (fade in + translate)
            anime({
                targets: codeBlock,
                opacity: [0, 1],
                translateY: [20, 0],
                scale : [0.5, 1],
                duration: 600,
                easing: 'easeOutQuad'
            });

            resolve(fetchedCode);
        }, 700);
    });
};


