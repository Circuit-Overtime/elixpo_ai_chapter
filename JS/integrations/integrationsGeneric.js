document.getElementById("aiArtCreateNavbar").addEventListener("click", function() {
    redirectTo("src/create")
});

document.getElementById("blogVisit").addEventListener("click", function() {
    redirectTo("blogs/elixpo_art")
});

document.getElementById("feedVisit").addEventListener("click", function() {
    redirectTo("src/feed")
});

document.getElementById("container").addEventListener("scroll", (e) => {
    console.log(e.target.scrollTop);
    
})

document.getElementById("visitIntegration").addEventListener("click", function() {
document.getElementById("container").scrollTo({ top: 920, behavior: "smooth" });
});

document.getElementById("redirectHome").addEventListener("click", function() {
    redirectTo("");
});

document.getElementById("submitProject").addEventListener("click", function() { 
    window.open("https://github.com/Circuit-Overtime/elixpo_ai_chapter/issues/new?template=project-submission.yml", "_blank");
});