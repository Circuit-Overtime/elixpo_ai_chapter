  
// images setup
const images = [
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/generatedImages%2FNormal%2Fimage_1722007183683_0.png?alt=media&token=d8764af5-c0c1-4702-9e00-ac2d2e220904",
 "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/generatedImages%2FLandscape%2Fimage_1722008668572_1.png?alt=media&token=369b5758-60a3-4427-976e-24221efd605d"
];

// content setup
const texts = []

rgbKineticSlider = new rgbKineticSlider({

 slideImages: images, // array of images > must be 1920 x 1080
 itemsTitles: texts, // array of titles / subtitles

 backgroundDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80', // slide displacement image 
 cursorDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80', // cursor displacement image

 cursorImgEffect : true, // enable cursor effect
 cursorTextEffect : false, // enable cursor text effect
 cursorScaleIntensity : 0.65, // cursor effect intensity
 cursorMomentum : 0.14, // lower is slower

 swipe: true, // enable swipe
 swipeDistance : window.innerWidth * 0.4, // swipe distance - ex : 580
 swipeScaleIntensity: 2, // scale intensity during swipping

 slideTransitionDuration : 1, // transition duration
 transitionScaleIntensity : 30, // scale intensity during transition
 transitionScaleAmplitude : 160, // scale amplitude during transition

 nav: true, // enable navigation
 navElement: '.next', // set nav class

 imagesRgbEffect : false, // enable img rgb effect
 imagesRgbIntensity : 0.9, // set img rgb intensity
 navImagesRgbIntensity : 80, // set img rgb intensity for regular nav 

 textsDisplay : true, // show title
 textsSubTitleDisplay : true, // show subtitles
 textsTiltEffect : true, // enable text tilt
 googleFonts : ['Playfair Display:700', 'Roboto:400'], // select google font to use
 buttonMode : false, // enable button mode for title
 textsRgbEffect : true, // enable text rgb effect
 textsRgbIntensity : 0.03, // set text rgb intensity
 navTextsRgbIntensity : 15, // set text rgb intensity for regular nav

 textTitleColor : 'white', // title color
 textTitleSize : 125, // title size
 mobileTextTitleSize : 125, // title size
 textTitleLetterspacing : 3, // title letterspacing

 textSubTitleColor : 'white', // subtitle color ex : 0x000000
 textSubTitleSize : 21, // subtitle size
 mobileTextSubTitleSize : 21, // mobile subtitle size
 textSubTitleLetterspacing : 2, // subtitle letter spacing
 textSubTitleOffsetTop : 90, // subtitle offset top
 mobileTextSubTitleOffsetTop : 90, // mobile subtitle offset top
});