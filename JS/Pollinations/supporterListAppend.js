import { SUPPORTER_LIST } from "./Config/supporterList.js";

// console.log("Supporter List: ", SUPPORTER_LIST);

SUPPORTER_LIST.forEach((supporter) => {
    const domain = new URL(supporter.url).hostname;
    const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

    let supporterListNode = `
        <div class="supportersTile" data-url="${supporter.url}" onclick="window.open('${supporter.url}', '_blank')" style="opacity: 0; transform: translateY(30px);">
            <div class="supportersContainer"> 
                <div class="supportersLogo" style="
                    background-image: url('${faviconUrl}');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                "></div> 
                <div class="supportersNameRedirect" style="opacity: 0; transform: translateY(10px);">
                    ${supporter.name}
                </div> 
            </div>
            <div class="supportersDescription" style="opacity: 0; transform: translateY(10px);">
                ${supporter.description}
            </div>
        </div>
    `;
    
    document.getElementById("supportersShowcase").insertAdjacentHTML("beforeend", supporterListNode);
});

// Animate the supporter tiles and their inner content
setTimeout(() => {
    const tiles = document.querySelectorAll(".supportersTile");

    anime({
        targets: tiles,
        opacity: [0, 1],
        translateY: [30, 0],
        scale: [0.95, 1],
        easing: 'easeOutExpo',
        duration: 800,
        delay: anime.stagger(150)
    });

    // Animate the name + description within each tile
    tiles.forEach((tile, i) => {
        const name = tile.querySelector('.supportersNameRedirect');
        const desc = tile.querySelector('.supportersDescription');

        anime({
            targets: [name, desc],
            opacity: [0, 1],
            translateY: [10, 0],
            easing: 'easeOutSine',
            duration: 600,
            delay: 300 + i * 150 // syncs nicely after tile appears
        });
    });
}, 0);
