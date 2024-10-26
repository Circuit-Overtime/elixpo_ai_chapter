// Import necessary modules
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Client, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { createCanvas, loadImage } from 'canvas';

dotenv.config();

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
  authDomain: "elixpoai.firebaseapp.com",
  projectId: "elixpoai",
  storageBucket: "elixpoai.appspot.com",
  messagingSenderId: "718153866206",
  appId: "1:718153866206:web:671c00aba47368b19cdb4f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let downloadUrl = '';
let suffixPrompt = '';
let queue = [];
let isProcessing = false;
const client = new Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'],
});

// On bot ready
client.on('ready', async () => {
client.user.seActivity("Generating Images for You ", {type: "WATCHING" });
  console.log('Bot is online and ready!');

  // Fetch the download_image URL from Firestore
  try {
    const docRef = doc(db, 'Server', 'servers'); // Specify the correct document ID
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      downloadUrl = docSnap.data().download_image;
      console.log('Fetched download URL:', downloadUrl);
    } else {
      console.log('No document found.');
    }
  } catch (error) {
    console.error('Error fetching or downloading image:', error);
  }
});

// Event listener: Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (interaction.user.bot) return;
  if (!interaction.isChatInputCommand()) return;
  const botMember = interaction.guild.members.me; // The bot's member object in the guild
  const channel = interaction.channel;

  // Fetch the permissions for the bot in the current channel
  const botPermissions = channel.permissionsFor(botMember);

  // Log the permission bitfield if needed for debugging
  console.log(botPermissions.bitfield); // Logs the raw bitfield

  // Check for 'Send Messages' permission
  if (!botPermissions.has('SendMessages')) {
    await interaction.reply({
      content: `
      ⚠️ I am missing the **Send Messages** permission in this channel. Please ensure that I have the "Send Messages" permission by following these steps:
      1. Go to the server settings.
      2. Under **Roles**, select the role for the bot or manually assign the permission.
      3. Ensure that **Send Messages** is enabled for this channel.`,
      ephemeral: true 
    });
    return false;
  }

  // Check for 'Embed Links' permission
  if (!botPermissions.has('EmbedLinks')) {
    await interaction.reply({
      content: `
      ⚠️ I am missing the **Embed Links** permission in this channel. To allow me to send rich embeds with content, please follow these steps:
      1. Go to the channel settings.
      2. Under **Permissions**, ensure that the bot has the **Embed Links** permission enabled.
      3. Without this permission, I can only send plain text.`,
      ephemeral: true
    });
    return false;
  }

  if (interaction.commandName === 'generate') {
    await addToQueue(interaction);
  }
  if (interaction.commandName === 'help') {
    const helpMessage = `
    **Elixpo Discord Bot Commands:**

- **\`/generate\`** - Generate images based on a prompt.

  **Options:**
  - **Theme:** Choose from \`normal\`, \`fantasy\`, \`halloween\`, \`space\`, \`chromatic\`, \`anime\`, \`samurai\`, \`crayon\`, \`cyberpunk\`, \`landscape\`, \`wpap\`, \`vintage\`, \`pixel\`, \`synthwave\`.
  - **Model:** Choose from \`flux\`, \`boltning\`.
  - **Aspect Ratio:** Choose from \`16:9\`, \`9:16\`, \`1:1\`, \`4:3\`, \`3:2\`.
  - **Enhancement:** \`true\` or \`false\`.

- **\`/help\`** - Display this help message.
    `;
    await interaction.reply(helpMessage);
  }
  if (interaction.commandName === 'ping') {
    await interaction.reply("Yooo! I'm ready to paint xD");
  }
});

async function gettotalGenOnServer() {
  const snapshot = doc(db, 'Server', 'totalGen');
  const imageNumber = await getDoc(snapshot);
  console.log("Total Gen:", imageNumber.data().value);
  let totalGen = parseInt(imageNumber.data().value);
  return totalGen;
}


async function addToQueue(interaction) {
  // Add the request to the queue
  queue.push(interaction);
  
  const positionInQueue = queue.length;
  const estimatedWaitTime = positionInQueue > 1 ? (positionInQueue - 1) * 20 : 0; // 20s for each additional request
  
  // Defer the interaction immediately
  await interaction.deferReply();

  // Notify the user of their position in the queue
  await interaction.followUp(`🕒 Your request has been added to the queue. You are number ${positionInQueue} in the queue. Estimated wait time: ${Math.ceil(estimatedWaitTime)} seconds.`);

  // Start processing if not already processing
  if (!isProcessing) {
    processQueue();
  }
}

// Process queue
async function processQueue() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const interaction = queue[0];

  // Notify that processing is starting
  await interaction.followUp('✨ Your request is now being processed...');
  
  // Generate image and wait for completion
  await generateImage(interaction);
  
  // Remove the processed interaction from the queue
  queue.shift();
  
  // Process the next request in the queue
  processQueue();
}

// Generate image
async function generateImage(interaction) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images");
  const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
  const theme = interaction.options.getString("theme") || "normal";
  const enhancement = interaction.options.getBoolean("enhancement") || false;
  const model = interaction.options.getString("model") || "flux";
  let width = 1024, height = 683;

  var currentTotalImageOnServer = await gettotalGenOnServer();
  var nextImageNumber = currentTotalImageOnServer + 1;

  switch (aspectRatio) {
    case '16:9': width = 1024; height = 576; break;
    case '9:16': width = 576; height = 1024; break;
    case '1:1': width = height = 1024; break;
    case '4:3': width = 1024; height = 768; break;
    case '3:2': width = 1024; height = 683; break;
  }

  if(theme == "fantasy")
    {
        suffixPrompt = "in a magical fantasy setting, with mythical creatures and surreal landscapes";
    }
    else if(theme == "halloween")
    {
        suffixPrompt = "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
    }
    else if(theme == "structure")
    {
        suffixPrompt = "in the style of monumental architecture, statues, or structural art";
    }
    else if(theme == "crayon")
    {
        suffixPrompt = "in the style of colorful crayon art with vibrant, childlike strokes";
    }
    else if(theme == "space")
    {
        suffixPrompt = "in a vast, cosmic space setting with stars, planets, and nebulae";
    }
    else if(theme == "chromatic")
    {
        suffixPrompt = "in a chromatic style with vibrant, shifting colors and gradients";
    }
    else if(theme == "cyberpunk")
    {
        suffixPrompt = "in a futuristic cyberpunk setting with neon lights and dystopian vibes";
    }
    else if(theme == "anime")
    {
        suffixPrompt = "in the style of anime, with detailed character designs and dynamic poses";
    }
    else if(theme == "landscape")
    {
        suffixPrompt = "depicting a breathtaking landscape with natural scenery and serene views";
    }
    else if(theme == "samurai")
    {
        suffixPrompt = "featuring a traditional samurai theme with warriors and ancient Japan";
    }
    else if(theme == "wpap")
    {
        suffixPrompt = "in the WPAP style with geometric shapes and vibrant pop-art colors";
    }
    else if(theme == "vintage")
    {
        suffixPrompt = "in a vintage, old-fashioned style with sepia tones and retro aesthetics";
    }
    else if(theme == "pixel")
    {
        suffixPrompt = "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics";
    }
    else if(theme == "normal")
    {
        suffixPrompt = "in a realistic and natural style with minimal artistic exaggeration";
    }
    else if(theme == "synthwave")
    {
        suffixPrompt = "in a retro-futuristic synthwave style with neon colors and 80s vibes";
    }
    
  
  const encodedPrompt = `${prompt.trim()} ${suffixPrompt}`;

  try {
    const images = [];
    const blobs = [];

    for (let i = 0; i < numberOfImages; i++) {
      const seed = Math.floor(Math.random() * (10000000 - 1000 + 1)) + 1000;
      const imgurl = `https://image.pollinations.ai/prompt/${encodeURIComponent(encodedPrompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&enhance=${enhancement}&nologo=true`;

      const response = await fetch(imgurl, { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error fetching image: ${response.status} ${response.statusText}`, errorText);
        continue; 
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Apply watermark
      const modifiedBlob = await applyWatermark(buffer);
      const attachment = new AttachmentBuilder(modifiedBlob, { name: `image${i + 1}.jpg` });
      images.push(attachment);
      blobs.push(modifiedBlob);
    }

    const embed = new EmbedBuilder()
      .setTitle('Generated Image')
      .setDescription(`**Prompt:** ${prompt}\n` +
        `**Theme:** ${theme}\n` +
        `**Aspect Ratio:** ${aspectRatio}\n` +
        `**Enhanced:** ${enhancement ? 'Yes' : 'No'}`)
      .setColor('#0099ff')
      .setFooter({ text: `Prompted by ${interaction.user.tag} | Created by Jackey`, iconURL: interaction.user.avatarURL({ dynamic: true }) });

    await interaction.editReply({
      embeds: [embed],
      files: images,
    });

    const timestamp = Date.now();
    const imgTheme = theme;
    const imageUrls = [];
    let specialDir = interaction.user.tag.toLowerCase() + "_" + timestamp;
    const imageGenId = generateUniqueId(interaction.user.tag.toLowerCase());
    const docRef = doc(db, "ImageGen", specialDir);
    for (let [index, blob] of blobs.entries()) {
      const imageRef = ref(storage, `generatedImages/${imgTheme}/image_${timestamp}_${index}.png`);
      const uploadTask = uploadBytesResumable(imageRef, blob);
      
      // Wait for upload completion
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`Image ${index + 1} upload is ${progress}% done`);
          },
          (error) => {
            console.error(`Error during upload of image ${index + 1}:`, error);
            reject(error);
          },
          async () => {
            const url = await getDownloadURL(imageRef);
            console.log(`Download URL for image ${index + 1}:`, url);
            imageUrls.push(url);
  
            await setDoc(docRef, {
              theme: imgTheme,
              timestamp,
              user: interaction.user.tag,
              prompt: prompt,
              ratio: aspectRatio,
              ai_enhanced: enhancement,
              likes: 0,
              total_gen_number: blobs.length,
              genNum : nextImageNumber,
              imgId: imageGenId,
              creationFrom: "discord",
            }, {merge : true});

            await updateDoc(docRef, {
              [`Imgurl${index}`]: url,
            });




            console.log(`Uploaded and metadata saved for image ${index + 1}`);
            resolve(); // Resolve when done
          }
        );
      });
    }
    await updateDoc(doc(db, 'Server', 'totalGen'), { 
      value: nextImageNumber,
    });
    const galleryUrl = `https://circuit-overtime.github.io/Elixpo_ai_pollinations/gallery.html?id=${imageGenId}`;
    await interaction.channel.send(`${interaction.user} has created image(s) for the Elixpo-AI gallery! View it here: ${galleryUrl}`);

  } catch (error) {
    console.error('Error fetching image:', error);
    await interaction.followUp('Error fetching image. Please try again later.');
  }
}

// Function to apply watermark
async function applyWatermark(blob) {
  const watermarkImage = await loadImage("https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20final.png?alt=media&token=4bdf46cb-c851-4638-a0ea-a2723c8d4038");
  const watermarkImageInverted = await loadImage("https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20inverted%20final.png?alt=media&token=4a7b007d-e5dc-4b56-aa7f-acc6446b1bbe");
  const mainImage = await loadImage(blob);
  
  const canvas = createCanvas(mainImage.width, mainImage.height);
  const ctx = canvas.getContext('2d');

  // Draw the main image onto the canvas
  ctx.drawImage(mainImage, 0, 0);

  // Detect brightness in the bottom left corner
  const sampleSize = 10; // Size of the sample area
  const imageData = ctx.getImageData(0, canvas.height - sampleSize, sampleSize, sampleSize);
  let totalBrightness = 0;
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    // Calculate brightness using the formula
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const averageBrightness = totalBrightness / (imageData.data.length / 4);

  // Choose the watermark based on the brightness
  const selectedWatermark = averageBrightness < 128 ? watermarkImageInverted : watermarkImage;

  // Define the position for the watermark
  const watermarkX = 10;
  const watermarkY = canvas.height - selectedWatermark.height - 10;
  const watermarkX_right = canvas.width - selectedWatermark.width - 10;
  const watermarkY_right = 10;

  // Draw the watermark onto the canvas
  ctx.drawImage(selectedWatermark, watermarkX, watermarkY);
  ctx.drawImage(selectedWatermark, watermarkX_right, watermarkY_right);

  // Convert the canvas to a Blob
  return canvas.toBuffer('image/jpeg'); // Return the modified image as a buffer
}

// Helper function to generate a unique ID
function generateUniqueId(inputString) {
  const timestamp = Date.now().toString();
  let combined = inputString + timestamp;
  combined = combined.split('').sort(() => Math.random() - 0.5).join('');
  return combined.slice(0, 10);
}

// Start the bot
client.login(process.env.TOKEN);
