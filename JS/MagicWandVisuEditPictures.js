const wandPictureEdit = document.getElementById("wandVisuMagicOne"),
tiles = document.querySelectorAll(".tile"),
containerPicture = document.getElementById("offeringsTile1");

const PictureContainerLeft = containerPicture.getBoundingClientRect().left;
const PictureContainerRight = containerPicture.getBoundingClientRect().right;
const PictureContainerTop = containerPicture.getBoundingClientRect().top;
const PictureContainerBottom = containerPicture.getBoundingClientRect().bottom;

const firstPicL = tiles[0].getBoundingClientRect().left;
const firstPicR = tiles[0].getBoundingClientRect().right;

const secondPicL = tiles[1].getBoundingClientRect().left;
const secondPicR = tiles[1].getBoundingClientRect().right;

const thirdPicL = tiles[2].getBoundingClientRect().left;
const thirdPicR = tiles[2].getBoundingClientRect().right;

globalThis.firstPicReveal = 0;
globalThis.secondPicReveal = 0;
globalThis.thirdPicReveal = 0;

const xy = (x, y) => ({ x, y }),
      px = value => `${value}px`,
      deg = value => `${value}deg`,
      per = value => `${value}%`,
      mapRange = (value, inMin, inMax, outMin, outMax) => ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
      abs = value => `"${value}"`;



containerPicture.onmousemove = e => {
    const wandPositionX = wandPictureEdit.getBoundingClientRect().x;
    if((e.clientX >= PictureContainerLeft) && (e.clientX <= PictureContainerRight))
    {
        const PictureWandStyles = {
            left: px(mapRange(e.clientX-50, PictureContainerLeft, PictureContainerRight, 50, 600)),
            top: px(mapRange(e.clientY, PictureContainerTop, PictureContainerBottom, 150,160 )),
            rotate : deg((mapRange(e.clientX, PictureContainerLeft, PictureContainerRight, 50, 570)) * 0.01)
        }
        wandPictureEdit.animate(PictureWandStyles, { duration: 200, fill: "forwards" });
        if((wandPositionX >= firstPicL) && (wandPositionX <= firstPicR - 55))
        {
           var percentageMovedOpacity = per(parseInt(mapRange(wandPositionX, firstPicL, firstPicR - 59, 0, 100)));
           var blurCalc = (parseInt(mapRange(wandPositionX, firstPicL, firstPicR - 59, 0, 100)));
           var percentageMovedBlur = px(parseInt((mapRange(blurCalc, 0, 100, 9, 0))));
            imageAnimateStyle = {
                opacity : percentageMovedOpacity,
                filter: `blur(${percentageMovedBlur})`,
            }
           document.querySelector(".tile:nth-child(1) > img").animate(imageAnimateStyle, {duration: 300, fill: "forwards"});
        }
        else if((wandPositionX >= secondPicL) && (wandPositionX <= secondPicR - 55))
        {
            var percentageMovedOpacity = per(parseInt(mapRange(wandPositionX, secondPicL, secondPicR - 59, 0, 100)));
            var blurCalc = (parseInt(mapRange(wandPositionX, secondPicL, secondPicR - 59, 0, 100)));
            var percentageMovedBlur = px(parseInt((mapRange(blurCalc, 0, 100, 9, 0))));
             imageAnimateStyle = {
                 opacity : percentageMovedOpacity,
                 filter: `blur(${percentageMovedBlur})`,
             }
            document.querySelector(".tile:nth-child(2) > img").animate(imageAnimateStyle, {duration: 300, fill: "forwards"});
        }
        else if((wandPositionX >= thirdPicL) && (wandPositionX <= thirdPicR - 55))
        {
            var percentageMovedOpacity = per(parseInt(mapRange(wandPositionX, thirdPicL, thirdPicR - 200, 0, 100)));
            var blurCalc = (parseInt(mapRange(wandPositionX, thirdPicL, thirdPicR - 59, 0, 100)));
            var percentageMovedBlur = px(parseInt((mapRange(blurCalc+30, 0, 100, 9, 0))));
             imageAnimateStyle = {
                 opacity : percentageMovedOpacity,
                 filter: `blur(${percentageMovedBlur})`,
             }
            document.querySelector(".tile:nth-child(3) > img").animate(imageAnimateStyle, {duration: 300, fill: "forwards"});
        }
    }
}

containerPicture.onmouseleave = e => {
    const PictureWandStyles = {
        left: px(300),
        top: px(120),
        rotate : deg(-4)
    }
    const Picture1Style = 
    {
        filter : blur("0px"),
        opacity : 1
    }

    const Picture2Style = 
    {
        filter : 'blur(5px)',
        opacity : 0.5
    }

    const Picture3Style = 
    {
        filter : blur("9px"),
        opacity : 0
    }
    wandPictureEdit.animate(PictureWandStyles, { duration: 300, fill: "forwards" });
    document.getElementById("offeringsTile1FirstImage").animate(Picture1Style, {duration : 400, fill : "forwards"});
    document.getElementById("offeringsTile1SecondImage").animate(Picture2Style, {duration : 400, fill : "forwards"});
    document.getElementById("offeringsTile1ThidImage").animate(Picture3Style, {duration : 400, fill : "forwards"});
   
}