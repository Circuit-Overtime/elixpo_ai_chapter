function getBasePath() {
    // Determine the base path dynamically
    if(window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    {
      return ""; // Development environment
    }
    else if (window.location.hostname === "circuit-overtime.github.io") {
      return "/Elixpo_ai_pollinations"; 
    }
    else if (window.location.hostname.endsWith(".vercel.app")) 
    {
      return ""; 
    } 
    else 
    {
      return ""; // Default case
    }
  }
  
  function redirectTo(path) {
    // Redirect to the given path, prepended with the base path
    const basePath = getBasePath();
    location.replace(`${basePath}/${path}`);
  }