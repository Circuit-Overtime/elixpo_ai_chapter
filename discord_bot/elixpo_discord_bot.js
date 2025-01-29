// Import necessary modules
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Client, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

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

let suffixPrompt = '';
let queue = [];
let isProcessing = false;
const client = new Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'],
});

// On bot ready
client.on('ready', async () => {
client.user.setActivity("Generating Images for You", { type: "WATCHING" });
  console.log('Bot is online and ready!');

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
    - **Model:** Choose from \`flux\`, \`flux-realism\`, \`flux-cablyai\`, \`flux-anime\`, \`flux-3d\`, \`any-dark\`, \`flux-pro\`, \`turbo\`.
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

async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const interaction = queue[0];

  try {
    // Check if the interaction has been replied to
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply(); // Defer the reply if not already done
    }

    // Initial message: Let the user know the request is being processed
    await interaction.editReply('✨ Your request is now being processed...');

    // Generate the image
    const imageUrl = await generateImage(interaction); // Assuming this function returns the image URL
    await interaction.editReply("✨ I've painted the image for you. Thank you for your patience!");

  } catch (error) {
    console.error('Error processing queue:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply(); // Defer the reply if not already done
    }
    // Update the message to notify the user of the error
    await interaction.editReply('⚠️ Something went wrong while processing your request. Please try again later.');
  } finally {
    // Remove the processed interaction and process the next
    queue.shift();
    setImmediate(processQueueDiscord); // Avoid blocking the event loop
  }
}




function addToQueue(interaction) {
  queue.push(interaction);
  if (!isProcessing) {
    processQueueDiscord(); // Start processing if not already in progress
  }
}

// Generate image
async function generateImage(interaction) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images");
  const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
  const theme = interaction.options.getString("theme") || "normal";
  const enhancement = interaction.options.getBoolean("enhancement") || false;
  const model = interaction.options.getString("model") || "flux-core";
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
      
      const attachment = new AttachmentBuilder(buffer, { name: `image${i + 1}.jpg` });
      images.push(attachment);
      blobs.push(buffer);
    }

    const embed = new EmbedBuilder()
      .setTitle('Generated Image')
      .setDescription(`**Prompt:** ${prompt}\n` +
        `**Theme:** ${theme}\n` +
        `**Aspect Ratio:** ${aspectRatio}\n` +
        `**Enhanced:** ${enhancement ? 'Yes' : 'No'} \n` +
        `**Model:** ${model}\n` +
        `**Number of Images:** ${numberOfImages}\n`)
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
    // const galleryUrl = `https://circuit-overtime.github.io/Elixpo_ai_pollinations/src/gallery?id=${imageGenId}`;
    // await interaction.channel.send(`${interaction.user} has created image(s) for the Elixpo-AI gallery! View it here: ${galleryUrl}`);

  } catch (error) {
    console.error('Error fetching image:', error);
    await interaction.followUp('Error fetching image. Please try again later.');
  }
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
