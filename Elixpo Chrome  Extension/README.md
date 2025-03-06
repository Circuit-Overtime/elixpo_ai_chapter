# Elixpo Art: Select Text and Transform to Picture

Elixpo Art is a Chrome extension that converts selected text into your imaginary picture. Powered by Elixpo, this tool helps you turn words into visual art seamlessly.

## Features

- Converts text to images using advanced AI.
- Easy-to-use with a simple text selection.
- Customizable keyboard shortcut for reloading the extension.
- Integrates with Firebase and Google APIs.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the extension directory.

## Usage

1. Select any text on a webpage.
2. Right-click and choose "Transform to Picture" from the context menu.
3. The extension will generate an image based on the selected text.

## Features

*   **Prompt Enhancement:** Refines user-provided text prompts to be more vivid and detailed for AI art generation using an external service.
*   **Customizable Image Styles:** Offers a selection of predefined styles (Chromatic, Anime, Landscape, Wpap, Pixel, Normal) to tailor the image generation.
*   **Aspect Ratio Selection:**  Allows users to choose different aspect ratios (1:1, 4:3, 16:9, 9:16) for their generated images.
*   **Custom Instructions:**  Provides a field for users to input custom instructions to further refine the image generation process.
*   **Image Download:**  Enables users to download the generated image.
*   **Loading Indicator:** Provides a visual loading indicator during image generation.
*   **Dynamic Text Feedback:** Provides real-time text feedback to the user about the image generation process.

## Technologies Used

*   **HTML:** For structuring the web page.
*   **CSS:** For styling the web page.
*   **JavaScript:** For implementing the application's logic and interacting with external APIs.
*   **External APIs:**
    *   `txtelixpo.vercel.app`: For prompt refinement and styling.
    *   `imgelixpo.vercel.app`: For image generation based on the refined prompt.

## Usage

1.  **Enter a Text Prompt:**  Provide a text description of the image you want to generate in the input field.
2.  **(Optional) Select an Aspect Ratio:** Choose an aspect ratio from the available options.  If no option is selected, the default is likely a square (1:1).
3.  **(Optional) Select a Theme:**  Choose a style for the image generation, or leave the default.
4.  **(Optional) Add Custom Instructions:** Enter any additional instructions or details for the image generation.
5.  **Click "Generate Image":** The application will then:
    *   Refine the prompt using the `txtelixpo.vercel.app` API.
    *   Display the refined prompt.
    *   Generate the image using the `imgelixpo.vercel.app` API with the refined prompt, selected aspect ratio, and custom instructions.
    *   Display the generated image in the designated container.
    *   Enable the download button.
6.  **Download Image:** Click the "Download" button to save the generated image.

## Code Structure

*   **`generateImage()`:** This function initiates the image generation process. It hides the "Generate Image" button, displays the loading indicator, calls `pimpPrompt()` to refine the text prompt.
*   **`pimpPrompt(text)`:** This asynchronous function calls the `txtelixpo.vercel.app` API to refine the provided text prompt. It then calls `createImage()` with the refined prompt and other relevant parameters. Handles errors in case the API call fails.
*   **`getSuffix()`:** This function returns a predefined suffix based on the selected theme to enrich the prompt.
*   **`createImage(prompt, h, w, s)`:** This asynchronous function calls the `imgelixpo.vercel.app` API to generate the image. It handles the API response, displays the generated image, hides the loading indicator, and enables the download button. Handles errors in case the API call fails.
*   **`downloadImage()`:** This function downloads the generated image from the displayed URL.
*   **`type()` (not included in the code snippet, but inferred):** This function likely handles the display of dynamic text feedback to the user.

## Important Considerations

*   **API Keys:**  The application relies on external APIs (`txtelixpo.vercel.app` and `imgelixpo.vercel.app`). Ensure that these APIs are accessible and functioning correctly. If API keys are required, ensure they are properly configured and secure.
*   **Error Handling:**  The code includes error handling for API calls.  Consider adding more robust error handling and user feedback mechanisms.
*   **Rate Limiting:** Be mindful of potential rate limits imposed by the external APIs. Implement mechanisms to handle rate limiting gracefully.
*   **User Interface:**  The UI elements and their functionality can be further enhanced for a better user experience.
*   **Security:** Review the application for potential security vulnerabilities, especially related to user input and interaction with external APIs.
*   **`type()` Function:**  The snippet lacks a `type()` function definition.  It's presumed to be a function that handles dynamic text display on the UI.  Implement this function appropriately.

## Checkout Kaggle and Huggingface Development
- [Kaggle for Prompt Enhancement](https://www.kaggle.com/code/overtimecraftsclips/fine-tuning-of-elixpo-promptpimp)
- [Hugging Face Model](https://huggingface.co/Elixpo/promptPimp)

## Deployment

This application can be deployed on a web server or a cloud platform like Netlify or Vercel. Ensure that the necessary dependencies are installed and the application is configured correctly.

## Contribution 

You are free to make changes for your  purpose, forking the repo and enjoy generating images!