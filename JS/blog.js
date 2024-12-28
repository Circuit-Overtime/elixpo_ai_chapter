
  let backToTopButton = document.getElementById("back-to-top");

    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            backToTopButton.style.right = "20px";
            backToTopButton.style.background = "#000";
            backToTopButton.style.color = "#fff";
        } else {
            backToTopButton.style.right = "-60px";
            backToTopButton.style.background = "#000";
            backToTopButton.style.color = "#fff";
        }
    };

    backToTopButton.onclick = function () {
        document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    };