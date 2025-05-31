document.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll("section");
  
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const section = entry.target;
  
          // If section is intersecting and not already revealed
          if (entry.isIntersecting && !section.classList.contains("has-revealed")) {
            section.classList.add("is-visible", "has-revealed");
  
            anime({
              targets: section.children,
              opacity: [0, 1],
              translateY: [20, 0],
              duration: 600,
              delay: anime.stagger(80),
              easing: "easeOutQuad",
            });
  
            // Once revealed, we don't observe it anymore
            observer.unobserve(section);
          }
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -33% 0px", // Keeps one above and one below loaded
        threshold: 0.25,
      }
    );
  
    sections.forEach((section) => {
      section.classList.add("is-hidden");
      observer.observe(section);
    });
  });
  