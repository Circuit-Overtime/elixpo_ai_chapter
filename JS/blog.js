hljs.highlightAll();
  let backToTopButton = document.getElementById("back-to-top");



    // document.getElementById("elixpoArtRedirect").addEventListener("click", function() {
    //     redirectTo("src/create");
    //     });

        
    backToTopButton.onclick = function () {
        document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    };

    document.querySelectorAll('.copyCode').forEach(button => {
        button.addEventListener('click', () => {
            button.classList.remove('bi-clipboard');
            button.classList.add('bi-clipboard-check');
            setTimeout(() => {
                button.classList.add('bi-clipboard');
                button.classList.remove('bi-clipboard-check');
            }, 1000);
            const codeBlock = button.nextElementSibling;
            const codeText = codeBlock.innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                // alert('Code copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy code: ', err);
            });
        });
    });




    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            backToTopButton.style.right = "20px";
        } else {
            backToTopButton.style.right = "-60px";
        }
    };

    backToTopButton.onclick = function () {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    };