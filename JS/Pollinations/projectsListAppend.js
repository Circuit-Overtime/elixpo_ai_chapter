import { projects, projectCategories } from "./Config/projectsList.js";
const projectSegmentDetectionDelay = 20;
let firstFocusSegmentProjects = 'Featured Section';
document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list-projects');
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

    function getScrollTopToCenterElementIndex(index) {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (index < 0 || index >= segments.length) return segmentList.scrollTop;

        const targetElement = segments[index];
        const targetScrollTop = targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);

        return targetScrollTop;
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
            } else if (Math.abs(index - closestIndex) === 2) {
                segment.classList.add('most-fainted');
            }
         });
    }

     function setDynamicPadding() {
         if (itemFullHeight === 0) {
              const firstItem = segmentList.querySelector('.segment-item-project');
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
        const segments = segmentList.querySelectorAll('.segment-item-project');
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
                        delayedShowProjectDetails(`${segmentContent[centeredIndex]}`);
                      }
                }
            });
        } else {
             updateStyles();
             // If already close, trigger showDetails immediately without animation complete
             clearTimeout(showDetailsTimeout);
              const centeredIndex = getClosestElementIndexToCenter();
               if (centeredIndex !== -1) {
                delayedShowProjectDetails(`${segmentContent[centeredIndex]}`);
               }
        }
    }

    function delayedShowProjectDetails(modeName) {
        clearTimeout(showDetailsTimeout);

        showDetailsTimeout = setTimeout(() => {
            if (typeof showProjectDetails === 'function') {
                showProjectDetails(modeName);
            } else {
                 console.log("showProjectDetails placeholder called with:", modeName);
            }
        }, projectSegmentDetectionDelay);
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
            segmentItem.classList.add('segment-item-project');
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

        const segments = segmentList.querySelectorAll('.segment-item-project');
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

        const clickedSegment = e.target.closest('.segment-item-project');
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
        const initialContentText = firstFocusSegmentProjects;
        const segments = segmentList.querySelectorAll('.segment-item-project');

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
             delayedShowProjectDetails(`${segmentContent[centeredIndex]}`);
         }

    });

     window.addEventListener('resize', debounce(() => {
         setDynamicPadding();
         clearTimeout(scrollTimeout);
         scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
     }, 100));
});



const showProjectDetails = (modeName) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const projectContainer = document.getElementById("projectDisplaySection");
            if (!projectContainer) {
                console.error("Projects container element not found");
                return;
            }

            let categoryKey = "";
            switch (modeName.trim()) {
                case "Featured Section":
                    categoryKey = "featured";
                    break;
                case "Vibe Coding":
                    categoryKey = "vibeCoding";
                    break;
                case "Creative Apps":
                    categoryKey = "creativeApps";
                    break;
                case "LLM Integrations":
                    categoryKey = "llmIntegrations";
                    break;
                case "Tools and Interfaces":
                    categoryKey = "toolsInterfaces";
                    break;
                case "Social Bots":
                    categoryKey = "socialBots";
                    break;
                case "SDK & Libraries":
                    categoryKey = "sdkLibraries";
                    break;
                case "Tutorials":
                    categoryKey = "tutorials";
                    break;
                default:
                    console.warn("Unknown category:", modeName);
                    return;
            }

            // Find the selected category
            const selectedCategory = projectCategories.find(cat => cat.key === categoryKey);
            if (!selectedCategory) {
                console.error("Category not found:", categoryKey);
                return;
            }

            // Update the category title if you have an element for it
            const categoryTitleElement = document.getElementById("categoryTitle");
            if (categoryTitleElement) {
                categoryTitleElement.textContent = selectedCategory.title;
            }

            // Clear and animate out existing content
            anime({
                targets: projectContainer,
                opacity: [1, 0],
                translateY: [0, -20],
                duration: 300,
                easing: 'easeOutQuad',
                complete: () => {
                    // Clear existing content
                    projectContainer.innerHTML = '';
                    
                    // Get and sort projects for the selected category
                    const categoryProjects = projects[categoryKey];
                    if (!categoryProjects || categoryProjects.length === 0) {
                        projectContainer.innerHTML = '<div class="no-projects">No projects found in this category</div>';
                        return;
                    }

                    // Render each project
                    categoryProjects.forEach(project => {
                        let projectNode = `
                            <div class="projectTile">
                                <div class="projectLogoContainer">
                                    <div class="projectLogo"></div>
                                    <div class="projectNameRedirect" data-url=${project.url ? `${project.url}` : ""} id="projectNameRedirect">
                                    ${project.name}
                                    </div>
                                </div>
                                
                                ${project.author ? `<div class="projectCreator">- by ${project.author}</div>` : ""}
                                
                                <div class="projectDescription">
                                    ${project.description}
                                </div>
                                
                                <div class="projectURLGithub" data-url="${project.repo ? `${project.repo}` : ""}" id="projectURLGithub">
                                    <ion-icon name="logo-github" role="img" class="md hydrated"></ion-icon>
                                    Source
                                </div>

                                ${project.isNew ? `<span class="new-badge">NEW</span>` : ""}
                                ${project.stars ? `<span class="stars-badge">⭐ ${project.stars}</span>` : ""}
                            </div>
                            `;

                            projectContainer.innerHTML += projectNode;
                    });

                    // Animate in new content
                    anime({
                        targets: projectContainer,
                        opacity: [0, 1],
                        translateY: [20, 0],
                        scale: [0, 0.9],
                        duration: 600,
                        easing: 'easeOutQuad'
                    });

                    resolve();
                }
            });
        }, 700);
    });
};

