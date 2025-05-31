import { projects, projectCategories } from "./Config/projectsList.js";

// Existing constants
const projectSegmentDetectionDelay = 20; // Delay before initiating showProjectDetails after scroll stops
let firstFocusSegmentProjects = 'Featured Section';

const POLLINATIONS_API_BASE = 'https://image.pollinations.ai/prompt/';
// Base params for the project avatar images
const PFP_DEFAULT_PARAMS = 'height=128&width=128&model=flux&nologo=true&private=true&referrer=mirexa';

// Constants for Project Avatar Generation
// Updated seeds as requested
const projectAvatarSeeds = [548451, 654040, 81840];
let currentProjectAvatarSeedIndex = 0;
// Removed: const projectImageCache = new Map(); // Relying on Cloudflare cache

// Constant for the periodic image update interval
const PROJECT_IMAGE_UPDATE_INTERVAL = 20000; // 20 seconds

// Variable to hold the interval ID for periodic updates
let projectImageUpdateInterval = null;

// Keep track of generated Object URLs to clean up later (optional but good practice)
const generatedObjectUrls = new Set();

// Delay between initiating sequential image fetches during initial load
const SEQUENTIAL_IMAGE_DELAY = 100; // milliseconds delay between each image request


// Function to cycle through seeds
function getNextProjectAvatarSeed() {
    const seed = projectAvatarSeeds[currentProjectAvatarSeedIndex];
    currentProjectAvatarSeedIndex = (currentProjectAvatarSeedIndex + 1) % projectAvatarSeeds.length;
    return seed;
}

// Function to generate the specific prompt for a project name
function generateProjectPrompt(projectName) {
    // Updated prompt template as requested
    const basePrompt = `Design a modern, artistic logo for a project named "${projectName}". The logo should reflect the essence of the name through visual 
    storytelling, blending contemporary design trends with subtle nods to ancient Egyptian motifs like Ankhs, Eye of Horus, and scarabs. The logo should not just 
    display the name as plain text but instead integrate the text creatively into the overall logo composition. Use a clean, sans-serif font as part of the design, 
    with sleek illustrations and symbolic elements enhancing the typography. Make the design vibrant and colorful, with bold gradients, metallic accents, and minimalistic 
    details. The final logo should feel like a fusion of modern branding and mystical ancient aesthetics. Emphasize simplicity, balance, and a clean aesthetic in the design. 
    Background should be minimal and complement the logo without overpowering it.`;
    return basePrompt;
}

// Async function to fetch the image blob and return its URL
async function fetchProjectImageBlob(prompt, seed) {
    const encodedPrompt = encodeURIComponent(prompt);
    // Combine default params with the specific seed
    const params = `${PFP_DEFAULT_PARAMS}&seed=${seed}`;
    const url = `${POLLINATIONS_API_BASE}${encodedPrompt}?${params}`;

    // console.log(`Fetching image for "${prompt.substring(0, 50)}..." (Seed: ${seed})`); // Optional: Log fetch URLs

    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorDetails = `status: ${response.status}`;
            try {
                 const errorText = await response.text();
                 if (errorText) errorDetails += `, message: ${errorText}`;
            } catch (e) {
                // Ignore if reading text fails
            }
            throw new Error(`HTTP error fetching project image! ${errorDetails}`);
        }
        const imageBlob = await response.blob();
        const imageUrl = URL.createObjectURL(imageBlob);
        generatedObjectUrls.add(imageUrl); // Track the created URL
        return imageUrl; // Return the Object URL
    } catch (error) {
        console.error(`Error fetching project image for prompt "${prompt.substring(0, 50)}..." (Seed: ${seed}):`, error);
        // Rethrow the error so the caller can handle the fallback
        throw error;
    }
}

// Function to generate/fetch image and apply it to a specific DOM element
// This function now relies solely on the remote API cache
async function generateAndApplyProjectImage(projectName, logoElement) {
    if (!projectName || !logoElement) {
        console.warn("Missing project name or logo element for image generation.");
        return;
    }

    // Get the next seed for this attempt (cycled for each individual call)
    const currentSeed = getNextProjectAvatarSeed();
    const prompt = generateProjectPrompt(projectName);

    // console.log(`Attempting to fetch image for "${projectName}" with Seed: ${currentSeed}`);

    try {
        // Apply loading indicator/fallback while fetching
        logoElement.classList.add('image-loading');
        logoElement.classList.remove('image-loaded', 'image-error'); // Clean up previous states
        // Set a temporary text/background fallback immediately before fetch
        logoElement.style.backgroundImage = 'none';
        logoElement.textContent = projectName.substring(0, 2).toUpperCase();
        logoElement.style.display = 'flex';
        logoElement.style.alignItems = 'center';
        logoElement.style.justifyContent = 'center';
        logoElement.style.fontSize = '1.2em'; // Adjust size as needed
        logoElement.style.fontWeight = 'bold';
        logoElement.style.backgroundColor = '#eee'; // Light grey background for loading/fallback
        logoElement.style.color = '#666'; // Darker grey text
        logoElement.style.backgroundRepeat = 'no-repeat'; // Ensure no repeat

        // Always initiate the fetch process
        const imageUrl = await fetchProjectImageBlob(prompt, currentSeed);

        // If fetch is successful, apply the image
        logoElement.style.backgroundImage = `url(${imageUrl})`;
        logoElement.style.backgroundSize = 'cover';
        logoElement.style.backgroundPosition = 'center';
        logoElement.style.backgroundRepeat = 'no-repeat'; // Ensure no repeat

        // Update classes
        logoElement.classList.remove('image-loading', 'image-error');
        logoElement.classList.add('image-loaded');

        // Remove fallback text/styles
        logoElement.textContent = '';
        logoElement.style.display = '';
        logoElement.style.alignItems = '';
        logoElement.style.justifyContent = '';
        logoElement.style.fontSize = '';
        logoElement.style.fontWeight = '';
        logoElement.style.backgroundColor = ''; // Remove fallback background
        logoElement.style.color = ''; // Remove fallback text color

         // console.log(`Image applied for "${projectName}" (Seed: ${currentSeed}).`);

    } catch (error) {
        // Handle fetch errors - the fallback text/styles set earlier will remain
        console.error(`Final failure to generate or fetch image for project "${projectName}" (Seed: ${currentSeed}). Displaying fallback.`, error);
        logoElement.classList.remove('image-loading', 'image-loaded');
        logoElement.classList.add('image-error'); // Optional: Add error class

        // Ensure fallback text/styles are correctly applied if the fetch failed
        logoElement.style.backgroundImage = 'none';
         logoElement.textContent = projectName.substring(0, 2).toUpperCase(); // Display initials as fallback
         logoElement.style.display = 'flex';
         logoElement.style.alignItems = 'center';
         logoElement.style.justifyContent = 'center';
         logoElement.style.fontSize = '1.2em'; // Adjust size as needed
         logoElement.style.fontWeight = 'bold';
         logoElement.style.backgroundColor = '#ccc'; // Grey background for error
         logoElement.style.color = '#333'; // Dark text
         logoElement.style.backgroundRepeat = 'no-repeat'; // Reset background-repeat
    }
}

// Function to trigger image generation for all currently displayed projects
// This is used by the periodic interval
function updateCurrentlyDisplayedProjectImages() {
    const projectContainer = document.getElementById("projectDisplaySection");
    if (!projectContainer) {
        // console.warn("Projects container not found for periodic update.");
        return; // Container might not be in the DOM yet or anymore
    }

    const projectTiles = projectContainer.querySelectorAll('.projectTile');

    if (projectTiles.length === 0) {
        // console.log("No project tiles found for periodic update.");
        return;
    }

    // console.log(`Initiating periodic image update for ${projectTiles.length} projects...`);
    // For periodic updates, we can trigger them all simultaneously (the API/CF cache handles the load)
    projectTiles.forEach(tile => {
        const projectName = tile.dataset.projectName; // Get name from data attribute
        const logoElement = tile.querySelector('.projectLogo'); // Find the logo div
        if (projectName && logoElement) {
             // Calling generateAndApplyProjectImage will use the next seed in the cycle
             // No await here, let them run concurrently in the interval
            generateAndApplyProjectImage(projectName, logoElement);
        }
    });
}

// Async function to sequentially initiate image generation for all currently displayed projects
// This is used for the initial load of a category
async function initiateProjectImageGenerationSequentially() {
    const projectContainer = document.getElementById("projectDisplaySection");
     if (!projectContainer) {
         // console.warn("Projects container not found for initial sequential image generation.");
         return; // Container might not be in the DOM yet or anymore
     }

     const projectTiles = projectContainer.querySelectorAll('.projectTile');

     if (projectTiles.length === 0) {
         // console.log("No project tiles found for initial sequential image generation.");
         return;
     }

     // console.log(`Initiating sequential image generation for ${projectTiles.length} projects...`);

     // Loop sequentially using for...of to allow await
     for (const tile of projectTiles) {
         const projectName = tile.dataset.projectName;
         const logoElement = tile.querySelector('.projectLogo');
         if (projectName && logoElement) {
             // Await the image generation for this tile
             await generateAndApplyProjectImage(projectName, logoElement);
             // Add a small delay before processing the next tile
             await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_IMAGE_DELAY));
         }
     }
     // console.log("Sequential image generation complete.");
}


// Function to start the periodic image update interval
function startProjectImageUpdateInterval() {
    // Clear any existing interval first
    stopProjectImageUpdateInterval();
    // console.log(`Starting project image update interval (${PROJECT_IMAGE_UPDATE_INTERVAL / 1000}s).`);
    // The immediate update is now handled by initiateProjectImageGenerationSequentially
    // The interval *only* sets the timer for subsequent updates
    projectImageUpdateInterval = setInterval(updateCurrentlyDisplayedProjectImages, PROJECT_IMAGE_UPDATE_INTERVAL);
}

// Function to stop the periodic image update interval
function stopProjectImageUpdateInterval() {
    if (projectImageUpdateInterval !== null) {
        // console.log("Stopping project image update interval.");
        clearInterval(projectImageUpdateInterval);
        projectImageUpdateInterval = null;
    }
}

// Optional: Clean up Object URLs when the window is unloaded or a category changes
function cleanupObjectUrls() {
     // console.log(`Cleaning up ${generatedObjectUrls.size} Object URLs.`);
    generatedObjectUrls.forEach(url => {
        URL.revokeObjectURL(url);
    });
    generatedObjectUrls.clear();
}


const showProjectDetails = (modeName) => {
    return new Promise((resolve) => {
        // Clear the periodic update interval before changing content
        stopProjectImageUpdateInterval();
        // Clean up old object URLs from the *previous* category before rendering new ones
        cleanupObjectUrls();

        setTimeout(() => {
            const projectContainer = document.getElementById("projectDisplaySection");
            if (!projectContainer) {
                console.error("Projects container element not found");
                resolve();
                return;
            }

            let categoryKey = "";
            switch (modeName.trim()) {
                case "Featured Section": categoryKey = "featured"; break;
                case "Vibe Coding": categoryKey = "vibeCoding"; break;
                case "Creative Apps": categoryKey = "creativeApps"; break;
                case "LLM Integrations": categoryKey = "llmIntegrations"; break;
                case "Tools and Interfaces": categoryKey = "toolsInterfaces"; break;
                case "Social Bots": categoryKey = "socialBots"; break;
                case "SDK & Libraries": categoryKey = "sdkLibraries"; break;
                case "Tutorials": categoryKey = "tutorials"; break;
                default:
                    console.warn("Unknown category:", modeName);
                    resolve();
                    return;
            }

            const selectedCategory = projectCategories.find(cat => cat.key === categoryKey);
            if (!selectedCategory) {
                console.error("Category not found in projectCategories config:", categoryKey);
                resolve();
                return;
            }

            const categoryTitleElement = document.getElementById("categoryTitle");
            if (categoryTitleElement) {
                categoryTitleElement.textContent = selectedCategory.title;
            } else {
                 console.warn("Element with id 'categoryTitle' not found.");
            }

            const categoryProjects = projects[categoryKey];

             // Helper function to just render the projects HTML structure
             const renderProjectsHTML = () => {
                 projectContainer.innerHTML = ''; // Clear existing content

                 if (!categoryProjects || categoryProjects.length === 0) {
                     projectContainer.innerHTML = '<div class="no-projects">No projects found in this category</div>';
                 } else {
                      categoryProjects.forEach(project => {
                          // Add data-project-name attribute to the tile for easy retrieval
                         let projectNode = `
                             <div class="projectTile" data-project-name="${project.name}">
                                 <div class="projectLogoContainer">
                                     <div class="projectLogo"></div> <!-- Placeholder for project logo -->
                                     <div class="projectNameRedirect" ${project.url ? `data-url="${project.url}"` : ""} ${project.url ? 'style="cursor: pointer;"' : ''}>
                                     ${project.name}
                                     </div>
                                 </div>

                                 ${project.author ? `<div class="projectCreator">- by ${project.author}</div>` : ""}

                                 <div class="projectDescription">
                                     ${project.description}
                                 </div>

                                 ${project.repo ? `
                                 <div class="projectURLGithub" data-url="${project.repo}" style="cursor: pointer;">
                                     <ion-icon name="logo-github" role="img" class="md hydrated"></ion-icon>
                                     Source
                                 </div>
                                 ` : ""}

                                 ${project.isNew ? `<span class="new-badge">NEW</span>` : ""}
                                 ${project.stars ? `<span class="stars-badge">⭐ ${project.stars}</span>` : ""}
                             </div>
                             `;
                              projectContainer.insertAdjacentHTML('beforeend', projectNode);
                      });

                       // Add click listeners for project tiles and links *after* they are added to the DOM
                       projectContainer.querySelectorAll('.projectNameRedirect').forEach(el => {
                           const url = el.dataset.url;
                           if (url) {
                               el.addEventListener('click', () => window.open(url, '_blank'));
                           }
                       });
                       // GitHub link click listener commented out as requested
                    //    projectContainer.querySelectorAll('.projectURLGithub').forEach(el => {
                    //         const url = el.dataset.url;
                    //         if (url) {
                    //             window.open(url, '_blank');
                    //         }
                    //     });

                       // Image generation is now handled by the sequential process after animation
                  }
             };


             // Animate out existing content before updating
             if (typeof anime !== 'undefined') {
                 anime({
                     targets: projectContainer,
                     opacity: [1, 0],
                     translateY: [0, -20],
                     duration: 300,
                     easing: 'easeOutQuad',
                     complete: async () => { // Make this callback async
                         renderProjectsHTML(); // Render new projects HTML
                         // Animate in new content
                         anime({
                             targets: projectContainer,
                             opacity: [0, 1],
                             translateY: [20, 0],
                             scale: [0.98, 1],
                             duration: 400,
                             easing: 'easeOutQuad',
                             complete: async () => { // Make this callback async
                                 resolve(); // Resolve promise after the 'animate in' animation finishes
                                 // Start the sequential image generation AFTER animation completes
                                 await initiateProjectImageGenerationSequentially();
                                 // ONLY start the periodic interval AFTER the initial sequential generation is complete
                                 startProjectImageUpdateInterval();
                             }
                         });
                     }
                 });
             } else {
                 console.warn("Anime.js not loaded, project content animation skipped.");
                 renderProjectsHTML(); // Render new projects immediately
                 projectContainer.style.opacity = 1; // Ensure visibility without animation
                 projectContainer.style.transform = 'none';
                 resolve(); // Resolve promise immediately if no animation
                 // Start sequential image generation immediately
                 initiateProjectImageGenerationSequentially().then(() => {
                      // Start periodic interval ONLY AFTER initial sequential generation is complete
                     startProjectImageUpdateInterval();
                 });
             }

        }, projectSegmentDetectionDelay);
    });
};


document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list-projects');
    if (!segmentList) {
        console.error("Element with class 'segment-list-projects' not found.");
        return;
    }

    let dragEndedRecently = false;
    let showDetailsTimeout;
    const segmentContent = [
        'Vibe Coding',
        'Creative Apps',
        'LLM Integrations',
        'Featured Section',
        'Tools and Interfaces',
        'Social Bots',
        'SDK & Libraries',
        'Tutorials',
    ];

    let scrollTimeout;
    const scrollStopDelay = 200;
    let isDragging = false;
    let startY;
    let startScrollTop;
    let animation = null;
    let itemFullHeight = 0;
    const dragSensitivityFactor = 0.889;


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
        const segments = segmentList.querySelectorAll('.segment-item-project');
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

     function getClosestElementElementToCenter() {
         const segments = segmentList.querySelectorAll('.segment-item-project');
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


    function getScrollTopToCenterElementIndex(index) {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (index < 0 || index >= segments.length) return segmentList.scrollTop;

        const targetElement = segments[index];
        const targetScrollTop = targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);

         const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
         return Math.max(0, Math.min(maxScrollTop, targetScrollTop));
    }

    function updateStyles() {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        segments.forEach((segment, index) => {
            segment.classList.remove('selected', 'faint', 'most-fainted');

            if (index === closestIndex) {
                segment.classList.add('selected');
            } else if (Math.abs(index - closestIndex) === 1) {
                segment.classList.add('faint');
            } else if (Math.abs(index - closestIndex) >= 2) {
                segment.classList.add('most-fainted');
            }
         });

    }

     function setDynamicPadding() {
         const firstItem = segmentList.querySelector('.segment-item-project');
         if (!firstItem) {
              console.warn("No segment items found to calculate padding.");
              return;
         }

         if (itemFullHeight === 0) {
            const itemStyle = getComputedStyle(firstItem);
            itemFullHeight = firstItem.offsetHeight + parseFloat(itemStyle.marginTop) + parseFloat(itemStyle.marginBottom);
         }

         const containerHeight = segmentList.clientHeight;
         const requiredPadding = (containerHeight / 2) - (itemFullHeight / 2);
         const paddingTopBottom = Math.max(0, requiredPadding);
         segmentList.style.paddingTop = `${paddingTopBottom}px`;
         segmentList.style.paddingBottom = `${paddingTopBottom}px`; 


         updateStyles();
     }

    function scrollToSegment(index, duration, easing) {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (index < 0 || index >= segments.length) return;

        const clampedScrollTop = getScrollTopToCenterElementIndex(index);

        // Stop previous interval before starting a new scroll that might change the category
        stopProjectImageUpdateInterval();
        // Stop any ongoing sequential generation too? Not strictly necessary if it's awaited,
        // but good to think about if it wasn't.

        if (Math.abs(segmentList.scrollTop - clampedScrollTop) > 1) {
             if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                  animation.pause();
             }
             requestAnimationFrame(() => {
                 if (typeof anime === 'undefined') {
                      console.warn("Anime.js not loaded, smooth scroll skipped.");
                      segmentList.scrollTop = clampedScrollTop;
                      updateStyles();
                      const centeredIndex = getClosestElementIndexToCenter();
                       if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                         // Call delayedShowProjectDetails
                         delayedShowProjectDetails(segmentContent[centeredIndex]);
                         // Note: delayedShowProjectDetails -> showProjectDetails -> sequential generation -> start interval
                       }
                      return;
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

                          clearTimeout(showDetailsTimeout);
                          const centeredIndex = getClosestElementIndexToCenter();
                           if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                             // Call delayedShowProjectDetails
                             delayedShowProjectDetails(segmentContent[centeredIndex]);
                             // Note: delayedShowProjectDetails -> showProjectDetails -> sequential generation -> start interval
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
                   // Call delayedShowProjectDetails
                    delayedShowProjectDetails(segmentContent[centeredIndex]);
                    // Note: delayedShowProjectDetails -> showProjectDetails -> sequential generation -> start interval
               }
        }
    }

    function delayedShowProjectDetails(modeName) {
        clearTimeout(showDetailsTimeout);

        showDetailsTimeout = setTimeout(() => {
            const currentlyCenteredElement = getClosestElementElementToCenter();
             const currentlyCenteredIndex = currentlyCenteredElement ? parseInt(currentlyCenteredElement.dataset.index, 10) : -1;
             const intendedMode = modeName.trim();
             const currentlyCenteredMode = currentlyCenteredIndex !== -1 && currentlyCenteredIndex < segmentContent.length ? segmentContent[currentlyCenteredIndex]?.trim() : null;

            if (currentlyCenteredMode === intendedMode) {
                 if (typeof showProjectDetails === 'function') {
                     // showProjectDetails now handles stopping the old interval
                     // and starting the new one after rendering/animation and sequential generation
                     showProjectDetails(modeName);
                 } else {
                     console.log("showProjectDetails function not available. Placeholder called with:", modeName);
                 }
            } else {
                // This can happen if the user scrolls again before the timeout fires
                // console.log(`Delayed details for "${intendedMode}" cancelled. "${currentlyCenteredMode || 'Nothing'}" is now centered.`);
                 // If the intended mode didn't end up centered, make sure the interval is stopped
                 // as showProjectDetails won't be called to stop it.
                 stopProjectImageUpdateInterval();
            }

        }, projectSegmentDetectionDelay);

    }

    const handleScrollStop = () => {
        // Only snap if we are not currently dragging or animating AND there isn't a delayed call pending
        // The delayed call (`delayedShowProjectDetails`) will trigger the snap if needed via scrollToSegment
        if (!isDragging && (animation === null || (typeof animation.state !== 'undefined' && animation.state !== 'stopped'))) {
             const closestIndex = getClosestElementIndexToCenter();
             if (closestIndex !== -1 && closestIndex < segmentContent.length) {
                  // Call delayedShowProjectDetails instead of scrollToSegment directly
                  // This ensures the project details are updated *after* the snap completes
                 delayedShowProjectDetails(segmentContent[closestIndex]);
             }
        }
    };

     const handleScrollOnScroll = () => {
         updateStyles(); // Update styles while scrolling

         // Clear the previous scroll stop timeout and set a new one
         clearTimeout(scrollTimeout);
         // Only set the timeout if not dragging or animating
          if (!isDragging && (animation === null || (typeof animation.state !== 'undefined' && animation.state !== 'stopped'))) {
            scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         }

         // Also clear the show details timeout while scrolling.
         // It will be re-triggered by handleScrollStop -> delayedShowProjectDetails
         clearTimeout(showDetailsTimeout);

         // Stop the periodic interval while scrolling, as it might conflict or be unnecessary
         // It will restart when the scroll stops and showProjectDetails is called.
         stopProjectImageUpdateInterval();
    };


    function populateSegments() {
        segmentList.innerHTML = '';
        segmentContent.forEach((content, index) => {
            const segmentItem = document.createElement('div');
            segmentItem.classList.add('segment-item-project');
            segmentItem.textContent = content;
            segmentItem.dataset.index = index;
            segmentList.appendChild(segmentItem);
        });
        setDynamicPadding();
    }

    segmentList.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        isDragging = true;
        startY = e.clientY;
        startScrollTop = segmentList.scrollTop;
        segmentList.style.cursor = 'grabbing';
        // Stop animation, timeouts, and interval on drag start
         if (animation && typeof animation.pause === 'function' && typeof animation.state !== 'undefined' && animation.state !== 'stopped') {
            animation.pause();
            animation = null;
        }
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
        stopProjectImageUpdateInterval(); // Stop the interval
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

        dragEndedRecently = true;
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300);

        // Handle potential snap and details display after drag ends
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
        // handleScrollStop will call delayedShowProjectDetails which will call showProjectDetails
        // showProjectDetails will then trigger sequential generation and start the interval.
    });

    segmentList.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;

        isDragging = true;
        startY = e.touches[0].clientY;
        startScrollTop = segmentList.scrollTop;
        // Stop animation, timeouts, and interval on touch start
         if (animation && typeof animation.pause === 'function' && typeof animation.state !== 'undefined' && animation.state !== 'stopped') {
            animation.pause();
            animation = null;
        }
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
        stopProjectImageUpdateInterval(); // Stop the interval
    }, { passive: true });

     segmentList.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault();

        const deltaY = e.touches[0].clientY - startY;
        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor);
        segmentList.scrollTop = newScrollTop;
        updateStyles();
     }, { passive: false });

     const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        dragEndedRecently = true;
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300);

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         // handleScrollStop will call delayedShowProjectDetails which will call showProjectDetails
        // showProjectDetails will then trigger sequential generation and start the interval.
     };

     segmentList.addEventListener('touchend', handleTouchEnd);
     segmentList.addEventListener('touchcancel', handleTouchEnd);


    segmentList.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Prevent wheel scroll interference if dragging or animating
        if (isDragging || (animation && typeof animation.state !== 'undefined' && animation.state !== 'stopped')) {
             return;
        }

        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        if (closestIndex === -1) return;

        let targetIndex = closestIndex;
        const direction = e.deltaY > 0 ? 1 : -1;
        targetIndex += direction;
        targetIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));

        // Scroll to the calculated target index
        scrollToSegment(targetIndex, 500, 'easeInOutQuad'); // scrollToSegment now stops the interval

        // Clearing these timeouts prevents handleScrollOnScroll/handleScrollStop from interfering
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);

        // Note: The interval is stopped by scrollToSegment.
        // It will be restarted by the sequence scrollToSegment -> complete -> delayedShowProjectDetails -> showProjectDetails -> sequential generation -> start interval.


    }, { passive: false });

    // This listener handles native scrolling from flicking/wheel if preventDefault isn't called (less likely with wheel handler active)
    // or if scrolling happens via other means (e.g. script modifying scrollTop directly without animation)
    // It also ensures styles update during flicking.
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

        const clickedSegment = e.target.closest('.segment-item-project'); // Use project specific class
        // Only proceed if a segment item was clicked
        if (!clickedSegment) {
            // console.log("Click not on a segment item");
            return;
        }

        // Get the index from the data attribute
        const clickedIndex = parseInt(clickedSegment.dataset.index, 10);
        const closestIndex = getClosestElementIndexToCenter();


        // Ensure the index is valid
        if (!isNaN(clickedIndex) && clickedIndex !== -1 && clickedIndex < segmentContent.length) {
             // Only initiate scroll/update if a different segment was clicked
             if (clickedIndex !== closestIndex) {
                scrollToSegment(clickedIndex, 500, 'easeInOutQuad');
             } else {
                 // If the clicked segment is already the closest one,
                 // just ensure details are shown and interval is running.
                 // This handles cases where a user clicks the already-centered item.
                 clearTimeout(scrollTimeout);
                 clearTimeout(showDetailsTimeout);
                 // Call delayedShowProjectDetails which will trigger showProjectDetails
                 // showProjectDetails will then trigger sequential generation and start the interval
                 delayedShowProjectDetails(segmentContent[clickedIndex]);
             }

        }
    });

    // --- Initialization ---
    // Populate the list items
    populateSegments();

    // Use requestAnimationFrame to ensure layout is ready before initial positioning
    requestAnimationFrame(() => {
         // Set initial padding based on calculated item height and container size
         setDynamicPadding();

        const initialContentText = firstFocusSegmentProjects;
        const segments = segmentList.querySelectorAll('.segment-item-project'); // Use project specific class

        let initialSelectedIndex = -1;

        // Find the index of the segment matching firstFocusSegmentProjects
        segments.forEach((segment, index) => {
             if (segment.textContent.trim() === initialContentText.trim()) {
                 initialSelectedIndex = index;
             }
        });

        // If the initial text was found, scroll to it, otherwise scroll to the middle element
        let indexToCenterInitially = initialSelectedIndex !== -1 ? initialSelectedIndex : (segments.length > 0 ? Math.floor(segments.length / 2) : -1);

        if (indexToCenterInitially !== -1 && indexToCenterInitially < segmentContent.length) {
             const targetScrollTop = getScrollTopToCenterElementIndex(indexToCenterInitially);
             segmentList.scrollTop = targetScrollTop;
        }

        // Update styles for the initially centered item
        updateStyles();

         // Trigger the initial show details and consequently start the periodic interval
         const centeredIndex = getClosestElementIndexToCenter();
         if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
             // Pass the actual text content
             delayedShowProjectDetails(segmentContent[centeredIndex]);
             // Note: This will call showProjectDetails, which calls sequential generation, then starts the interval.
         }

    });

     // Handle window resize: recalulate padding and re-center the list
     window.addEventListener('resize', debounce(() => {
         setDynamicPadding();
         // After resize, snap to the closest element's new centered position
         clearTimeout(scrollTimeout);
         // Use a short delay to allow the layout to settle after resize
         scrollTimeout = setTimeout(() => {
             const centeredIndex = getClosestElementIndexToCenter();
             if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                 // Use scrollToSegment to ensure smooth snap and triggering showDetails/interval
                 scrollToSegment(centeredIndex, 500, 'easeInOutQuad');
             }
         }, 150); // Slightly longer delay for resize snap
     }, 100));


    // Clean up Object URLs when the page is about to be unloaded
    window.addEventListener('beforeunload', () => {
        stopProjectImageUpdateInterval(); // Stop the interval
        cleanupObjectUrls(); // Clean up created URLs
    });

});

// Keep this if desired for debugging project lists
function logCurrentProjects() {
    const projectContainer = document.getElementById("projectDisplaySection");
    if (!projectContainer) {
        console.warn("Projects container not found");
        return;
    }

    const projectNames = Array.from(projectContainer.querySelectorAll('.projectTile'))
        .map(tileElement => tileElement.dataset.projectName || 'Unknown Project');

    if (projectNames.length === 0) {
        console.log("No projects currently displayed");
        return;
    }

    console.log("Currently displayed projects:");
    projectNames.forEach((name, index) => {
        console.log(`${index + 1}. ${name}`);
    });
    console.log(`Total projects: ${projectNames.length}`);
}