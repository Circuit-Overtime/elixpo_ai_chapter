function createToastNotification(msg) {
    let notifNode = `<div class="notification">
         <span>${msg}</span>
      </div>`;

    const notificationContainer = document.getElementById('notificationCenter');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = notifNode.trim();
    const notifElement = tempDiv.firstChild;

    notificationContainer.appendChild(notifElement);
    anime({
        targets: notifElement,
        opacity: [0, 1],
        translateY: [-20, 0],
        duration: 500,
        easing: 'easeOutQuad'
    });

    setTimeout(() => {
        anime({
            targets: notifElement,
            opacity: [1, 0],
            translateY: [0, -20],
            duration: 500,
            easing: 'easeInQuad',
            complete: () => {
                if (notificationContainer.contains(notifElement)) {
                    notificationContainer.removeChild(notifElement);
                }
            }
        });
    }, 1200);

    if (notificationContainer.children.length > 3) {
        const excessNotif = notificationContainer.children[0];
        anime({
            targets: excessNotif,
            opacity: [1, 0],
            translateY: [0, -20],
            duration: 500,
            easing: 'easeInQuad',
            complete: () => {
                if (notificationContainer.contains(excessNotif)) {
                    notificationContainer.removeChild(excessNotif);
                }
            }
        });
    }
}


// SOCIAL LINKS 

document.getElementById("linkedinRedirect").addEventListener("click", function () {
    window.open("https://www.linkedin.com/company/pollinations-ai/posts/?feedView=all", "_blank");
});

document.getElementById("githubRedirect").addEventListener("click", function () {
    window.open("https://github.com/pollinations/pollinations", "_blank");
});

document.getElementById("discordRedirect").addEventListener("click", function () {
    window.open("https://discord.com/invite/k9F7SyTgqn", "_blank");
});

document.getElementById("instagramRedirect").addEventListener("click", function () {
    window.open("https://www.instagram.com/pollinations_ai", "_blank");
});

document.getElementById("tiktokRedirect").addEventListener("click", function () {
    window.open("https://tiktok.com/@pollinations.ai", "_blank");
});

document.getElementById("youtubeRedirect").addEventListener("click", function () {
    window.open("https://www.youtube.com/channel/UCk4yKnLnYfyUmCCbDzOZOug", "_blank");
});

document.getElementById("githubReadme").addEventListener("click", function () {
    window.open("https://github.com/pollinations/pollinations", "_blank");
});

document.getElementById("discordInvite").addEventListener("click", function () {
    window.open("https://discord.com/invite/k9F7SyTgqn", "_blank");
});

document.getElementById("tippingRedirects").addEventListener("click", function () {
    window.open("https://ko-fi.com/pollinationsai", "_blank");
});

document.getElementById("projectSubmit").addEventListener("click", function () {
    window.open("https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml", "_blank");
});

document.getElementById("apiDocsVisit").addEventListener("click", function () {
    window.open("https://github.com/pollinations/pollinations/blob/master/APIDOCS.md", "_blank");
});


let box_node = `<div class="box"></div>`;
for (let i = 0; i < 35; i++) {
    document.getElementById("topBoxesDesigns").innerHTML += box_node;
}



async function updateGithubStarCount(owner, repo) {
    const starCountElem = document.getElementById('githubStarCount');
    if (!starCountElem) return;
  
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!response.ok) throw new Error('Network response was not ok');
  
      const repoData = await response.json();
      const stars = repoData.stargazers_count ?? 0;
  
      starCountElem.textContent = stars.toLocaleString();
    } catch (error) {
      console.error('Failed to fetch GitHub stars:', error);
      starCountElem.textContent = 'N/A';
    }
  }
  
  // Example usage:
  updateGithubStarCount('pollinations', 'pollinations');
  


  const container = document.querySelector('.container');
  const sections = document.querySelectorAll('.snap-section');

  let isAutoScrolling = false;
  let scrollTimer = null;

  function getVisibleSectionIndex() {
    const containerRect = container.getBoundingClientRect();
    const containerTop = container.scrollTop;
    const viewHeight = window.innerHeight;

    let maxVisibleRatio = 0;
    let bestIndex = -1;

    sections.forEach((section, index) => {
      const sectionTop = section.offsetTop;
      const sectionBottom = sectionTop + section.offsetHeight;

      const visibleTop = Math.max(containerTop, sectionTop);
      const visibleBottom = Math.min(containerTop + viewHeight, sectionBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const ratio = visibleHeight / section.offsetHeight;

      if (ratio > maxVisibleRatio) {
        maxVisibleRatio = ratio;
        bestIndex = index;
      }
    });

    return maxVisibleRatio >= 0.9 ? bestIndex : -1; // snap only if ≥ 90% visible
  }

  container.addEventListener('scroll', () => {
    if (isAutoScrolling) return;
    clearTimeout(scrollTimer);

    scrollTimer = setTimeout(() => {
      const targetIndex = getVisibleSectionIndex();
      if (targetIndex !== -1) {
        const targetScrollTop = sections[targetIndex].offsetTop;

        isAutoScrolling = true;
        anime({
          targets: container,
          scrollTop: targetScrollTop,
          duration: 700,
          easing: 'easeOutCubic',
          complete: () => {
            isAutoScrolling = false;
          }
        });
      }
    }, 100); // wait 100ms after scroll stops
  });


  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        e.preventDefault();

        const scrollContainer = document.querySelector('.container');
        const targetPosition = targetElement.offsetTop;

        anime({
          targets: scrollContainer,
          scrollTop: targetPosition,
          duration: 700,
          easing: 'easeInOutQuad'
        });
      }
    });
  });
