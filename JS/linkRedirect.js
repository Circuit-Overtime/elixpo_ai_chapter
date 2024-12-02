function getBasePath() {
    // Determine the base path dynamically
    return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
      ? "" // Development environment
      : "/Elixpo_ai_pollinations"; // Production (GitHub Pages)
  }
  
  function redirectTo(path) {
    // Redirect to the given path, prepended with the base path
    const basePath = getBasePath();
    location.replace(`${basePath}/${path}`);
  }