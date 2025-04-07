// Initialize Locomotive Scroll
const locoScroll = new LocomotiveScroll({
    el: document.querySelector('.sectionContainer'),
    smooth: true
});

// Handle internal anchor links with Locomotive Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(event) {
        event.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            locoScroll.scrollTo(targetElement);
        }
    });
});

