document.addEventListener('DOMContentLoaded', () => {
    const countNumberElement = document.getElementById('countNumber');
    const generationRateElement = document.getElementById('generationRate');
    const serverLoadShower = document.getElementById('serverLoadShower');
    let lastMinuteRequests = [];
    let responseTimesSummary = [];
    const responseTimesMaxSize = 100;

    // Store the current displayed values for smooth animation start
    let currentDisplayedCount = 0;
    let currentDisplayedRate = 0;

    // --- Data Processing Function ---
    function processFeedData(data) {
        try {
            if (!data || typeof data !== 'object') {
                console.error('Invalid data format received:', data);
                return;
            }

            // Add timestamp for this request event
            lastMinuteRequests.push(Date.now());

            // Update Average Response Time
            // Prioritize data.duration, fallback to random if invalid/missing
            const responseTime = (data.duration !== undefined && data.duration !== null && !isNaN(parseFloat(data.duration)))
                ? parseFloat(data.duration) * 1000 // Convert seconds to ms
                : Math.floor(Math.random() * 400 + 50); // Fallback random time in ms

            if (!isNaN(responseTime) && responseTime >= 0) {
                responseTimesSummary.push(responseTime);

                if (responseTimesSummary.length > responseTimesMaxSize) {
                    responseTimesSummary.shift(); // Keep array size limited
                }
            } else {
                console.warn('Received data with invalid duration, using fallback:', data);
            }
        } catch (error) {
            console.error('Error processing feed data:', error);
        }
    }

    // --- Update UI Function with Animations ---
    function updateUI() {
        const now = Date.now();

        // Filter requests from the last minute
        lastMinuteRequests = lastMinuteRequests.filter(time => now - time <= 60000);

        // Calculate New Values
        const newCount = lastMinuteRequests.length;
        const avgResponseTime = responseTimesSummary.length > 0
            ? Math.floor(responseTimesSummary.reduce((a, b) => a + b, 0) / responseTimesSummary.length)
            : 0;
        const newRate = avgResponseTime; // Use this as the target for animation

        // --- Animate Requests Per Minute (countNumberElement) ---
        if (countNumberElement && currentDisplayedCount !== newCount) {
            anime({
                targets: { count: currentDisplayedCount }, // Animate a plain object's 'count' property
                count: newCount, // The target value
                round: 1, // Round to the nearest integer
                easing: 'easeInOutQuad', // Choose an easing function
                duration: 800, // Animation duration in ms
                update: function(anim) {
                    // Update the actual element's text with the animated value
                    countNumberElement.innerText = Math.round(anim.animations[0].currentValue).toLocaleString();
                },
                complete: function() {
                     // Store the final animated value
                    currentDisplayedCount = newCount;
                }
            });
        } else if (countNumberElement && currentDisplayedCount === newCount) {
             // If the number didn't change, just ensure the text is correct (might be needed on first load)
             countNumberElement.innerText = newCount.toLocaleString();
             currentDisplayedCount = newCount;
        }


        // --- Animate Average Response Time (generationRateElement) ---
         if (generationRateElement && currentDisplayedRate !== newRate) {
            anime({
                targets: { rate: currentDisplayedRate }, // Animate a plain object's 'rate' property
                rate: newRate, // The target value
                round: 1, // Round to the nearest integer
                easing: 'easeInOutQuad', // Choose an easing function
                duration: 800, // Animation duration in ms
                update: function(anim) {
                    // Update the actual element's text with the animated value
                    generationRateElement.innerText = Math.round(anim.animations[0].currentValue) + 'ms';
                },
                 complete: function() {
                     // Store the final animated value
                    currentDisplayedRate = newRate;
                }
            });
         } else if (generationRateElement && currentDisplayedRate === newRate) {
            // If the number didn't change, just ensure the text is correct
            generationRateElement.innerText = newRate + 'ms';
            currentDisplayedRate = newRate;
         }


        // --- Animate Server Load Shower (serverLoadShower) ---
        if (serverLoadShower) {
            const minWidthMs = 50; // Corresponds to the minimum random time
            const maxWidthMs = 450; // Corresponds to max random time + a bit more, or a realistic max load

            // Clamp the response time for width calculation
            const clampedResponse = Math.min(Math.max(avgResponseTime, minWidthMs), maxWidthMs);

            // Calculate the target width percentage based on the clamped value
            // Scale from minWidthMs to maxWidthMs to a percentage (e.g., 0% to 100%)
            const newWidthPercentage = Math.floor(((clampedResponse - minWidthMs) / (maxWidthMs - minWidthMs)) * 100);

             // Ensure width is between 0 and 100
            const finalWidthPercentage = Math.max(0, Math.min(100, newWidthPercentage));

            // Determine the target color based on the percentage
            let newColor;
            if (finalWidthPercentage < 33) {
                newColor = '#4CAF50'; // Green for low load
            } else if (finalWidthPercentage < 66) {
                newColor = '#FFA500'; // Orange for medium load
            } else {
                newColor = '#FF4444'; // Red for high load
            }

            // Get the current computed width style for Anime.js to animate from
             const currentWidthStyle = serverLoadShower.style.width; // e.g., "50%"
             // Anime.js can usually handle animating from the current style if the target is provided.

            // Animate Width and Background Color
            anime({
                targets: serverLoadShower,
                width: finalWidthPercentage + '%', // Animate to the target width percentage
                backgroundColor: newColor, // Animate to the target color
                easing: 'easeInOutQuad', // Easing for the bar movement
                duration: 500 // Shorter duration for the bar
            });
        }
    }

    // --- EventSource Connection Logic ---
    function connectEventSource() {
        const FEED_URL = 'https://text.pollinations.ai/feed';
        // Fallback URL might need adjustment if the primary changes.
        // Using a single fallback URL for now. You might want a more robust list.
        const FALLBACK_URL = 'https://text-api.pollinations.ai/feed';
        let retryCount = 0;
        const maxRetries = 10; // Increased max retries

        let currentEventSource = null; // Keep track of the current connection attempt

        function tryConnect(url, isFallback = false) {
            // console.log(`Attempting to connect to EventSource: ${url}`);

            if (currentEventSource) {
                currentEventSource.close(); // Close previous attempt if any
            }

            currentEventSource = new EventSource(url);

            currentEventSource.onmessage = function (event) {
                try {
                    const data = JSON.parse(event.data);
                    processFeedData(data);
                    retryCount = 0; // Reset retry count on successful message
                } catch (parseError) {
                    console.error('Error parsing feed data:', parseError);
                }
            };

            currentEventSource.onerror = function () {
                console.error(`EventSource connection failed for ${url}.`);
                currentEventSource.close(); // Ensure it's closed

                if (retryCount < maxRetries) {
                    retryCount++;
                    // Alternate between primary and fallback URLs
                    const nextUrl = (retryCount % 2 === 1 && FALLBACK_URL) ? FALLBACK_URL : FEED_URL;
                    // Exponential backoff with jitter
                    const timeout = 1000 + (Math.pow(2, retryCount) * 500) + (Math.random() * 500);
                    console.log(`Retrying connection with ${nextUrl} (${retryCount}/${maxRetries}) in ${Math.round(timeout / 1000)}s...`);
                    setTimeout(() => tryConnect(nextUrl, nextUrl === FALLBACK_URL), timeout);
                } else {
                    console.error('Max retries reached. EventSource connection failed permanently.');
                    currentEventSource = null; // Clear reference
                }
            };

            currentEventSource.onopen = function () {
                // console.log(`EventSource connected successfully to ${url}.`);
                retryCount = 0; // Reset retry count on successful open
            };
        }

        // Initial connection attempt
        tryConnect(FEED_URL);
    }

    // --- Initialize ---
    connectEventSource();
    // Update UI every second to process/display the data
    setInterval(updateUI, 1000);
    // Initial UI update to set up elements
    updateUI();
});