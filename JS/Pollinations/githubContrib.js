
  const GITHUB_TOKEN = "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"; // 🔒 Replace with your token

  async function getTopContributors(owner, repo, topN = 10) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=${topN}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const contributors = await response.json();

      return contributors.slice(0, topN).map(c => ({
        username: c.login,
        avatar: c.avatar_url,
        profile: c.html_url,
        contributions: c.contributions
      }));
    } catch (err) {
      console.error('Failed to fetch contributors:', err);
      return [];
    }
  }

  // Display avatars
  (async () => {
    const contributors = await getTopContributors('pollinations', 'pollinations', 5);
    const displayContainer = document.getElementById('profile-stack');
    contributors.forEach(contributor => {
        let contribImage = `<img src="${contributor.avatar}" alt="${contributor.username}" title="${contributor.username}" id="contributor" data-url="${contributor.profile}" onclick="showProfile(this)" />`;
        displayContainer.innerHTML += contribImage;
    });
  })();


    // Add click event to open profile in new tab
    function showProfile(self)
    {
        const url = self.getAttribute('data-url');
        if (url) {
            window.open(url, '_blank');
        } else {
            console.error('Profile URL not found');
        }
    }