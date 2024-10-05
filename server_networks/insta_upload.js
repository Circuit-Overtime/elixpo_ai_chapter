import express from 'express';
import { IgApiClient } from 'instagram-private-api';
import axios from 'axios';
import fs from 'fs';

const app = express();
const port = 4000;

// Path to store session data (cookies)
const sessionFilePath = 'path to the session cookies file';  // Replace 'path to the session cookies file' with the actual path

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

const postCarouselToInsta = async () => {
  try {
    const ig = new IgApiClient();
    ig.state.generateDevice('username');  // Generate device based on username

    // Load session if exists, otherwise login
    if (fs.existsSync(sessionFilePath)) {
      // Load session data (cookies) from file
      const savedSession = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
      await ig.state.deserializeCookieJar(savedSession);
      console.log('Session loaded from cache!');
    } else {
      // Login and save session if not cached
      await ig.account.login('username', 'password');
      const session = await ig.state.serializeCookieJar();  // Save session after login
      fs.writeFileSync(sessionFilePath, JSON.stringify(session));
      console.log('Logged in and session saved!');
    }

    // Define URLs of the two images
    const imageUrls = [
      'https://static.vecteezy.com/system/resources/thumbnails/033/662/041/small_2x/cartoon-lofi-young-manga-style-girl-while-listening-to-music-in-the-rain-ai-generative-photo.jpg',
      'https://static.vecteezy.com/system/resources/thumbnails/033/662/041/small_2x/cartoon-lofi-young-manga-style-girl-while-listening-to-music-in-the-rain-ai-generative-photo.jpg',
    ];

    // Fetch both images using axios and store them as buffers
    const imageBuffers = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'arraybuffer',
        });
        return Buffer.from(response.data, 'binary');
      })
    );

    // Tag an account in the caption by using @username
    const caption = 'A really nice photo from the internet! Check out @username from the session login';  // Replace 'username_here' with the actual username

    // Upload both images as a carousel (album)
    await ig.publish.album({
      items: imageBuffers.map((file) => ({
        file,
      })),
      caption: caption,
    });

    console.log('Carousel uploaded successfully with caption!');
  } catch (error) {
    console.error('Error posting carousel to Instagram:', error);

    // If the session is invalid, delete the session file and retry login
    if (fs.existsSync(sessionFilePath)) {
      fs.unlinkSync(sessionFilePath);  // Delete the session file if the session is invalid
      console.log('Session invalid. Cache cleared.');
    }
  }
};

postCarouselToInsta();


