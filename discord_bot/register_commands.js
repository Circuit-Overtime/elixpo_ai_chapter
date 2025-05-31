import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { options } from 'marked';
dotenv.config();

// Define the slash commands
const commands = [
  {
    name: 'generate',
    description: 'Generate an image based on a prompt',
    options: [
      {
        name: 'prompt',
        type: 3, 
        description: 'The prompt to generate images from',
        required: true
      },
      {
        name: 'number_of_images',
        type: 4, 
        description: 'The number of images to generate (1-4)',
        required: true,
        min_value: 1,
        max_value: 4
      },
      {
        name: 'seed',
        type: 4, 
        description: 'The seed for random generation (optional)',
        required: false,
        min_value: 10,
        max_value: 1000000
      },
      {
        name: 'aspect_ratio',
        type: 3, 
        description: 'The aspect ratio of the image (16:9, 9:16, etc.)',
        required: false,
        choices: [
          { name: '16:9', value: '16:9' },
          { name: '9:16', value: '9:16' },
          { name: '1:1', value: '1:1' },
          { name: '4:3', value: '4:3' },
          { name: '3:2', value: '3:2' }
        ]
      },
      {
        name: 'theme',
        type: 3, 
        description: 'The theme for the image (e.g., fantasy, normal)',
        required: false,
        choices: [
          { name: 'Fantasy', value: 'fantasy' },
          { name: 'Normal', value: 'normal' },
          { name: 'Halloween', value: 'halloween' },
          { name: 'Structure', value: 'structure' },
          { name: 'Crayon', value: 'crayon' },
          { name: 'Space', value: 'space' },
          { name: 'Chromatic', value: 'chromatic' },
          { name: 'Cyberpunk', value: 'cyberpunk' },
          { name: 'Anime', value: 'anime' },
          { name: 'Landscape', value: 'landscape' },
          { name: 'Samurai', value: 'samurai' },
          { name: 'WPAP', value: 'wpap' },
          { name: 'Vintage', value: 'vintage' },
          { name: 'Pixel', value: 'pixel' },
          { name: 'Synthwave', value: 'synthwave' }
        ]
      },
      {
        name: 'enhancement',
        type: 5, 
        description: 'Enhance the image quality (true/false)',
        required: false,
        choices: [
          { name: 'True', value: true },
          { name: 'False', value: false }
        ]
      },
      {
        name: 'model',
        type: 3, 
        description: 'The model used to generate the image (e.g., flux)',
        required: false,
        choices: [
          { name: 'Flux', value: 'flux' },
          { name: 'Turbo', value: 'turbo' },
          { name: "gptimage", value: 'gptimage' }
        ]
      }
    ]
  },
  {
    name: 'help',
    description: 'Provides information about the bot commands',
  },
  {
    name: 'edit',
    description: 'Edit an existing image',
    options: [
      {
        name: "prompt",
        type: 3,
        description: "The new prompt to edit the image with",
        required: true
      },
      {
        name: "original_picture_message_id",
        type: 3, 
        description: "The ID of the message containing the image to edit (right click and copy message id)",
        required: true
      },
      {
        name: "img_index_to_edit",
        type: 4,
        description: "The index of the image to edit (1-4)",
        required: true,
      },
      {
        name: 'seed',
        type: 4, 
        description: 'The seed for random generation (optional)',
        required: false,
        min_value: 10,
        max_value: 1000000
      },
      {
        name: 'aspect_ratio',
        type: 3, 
        description: 'The aspect ratio of the image (16:9, 9:16, etc.)',
        required: false,
        choices: [
          { name: '16:9', value: '16:9' },
          { name: '9:16', value: '9:16' },
          { name: '1:1', value: '1:1' },
          { name: '4:3', value: '4:3' },
          { name: '3:2', value: '3:2' }
        ]
      },
      {
        name: 'theme',
        type: 3, 
        description: 'The theme for the image (e.g., fantasy, normal)',
        required: false,
        choices: [
          { name: 'Fantasy', value: 'fantasy' },
          { name: 'Normal', value: 'normal' },
          { name: 'Halloween', value: 'halloween' },
          { name: 'Structure', value: 'structure' },
          { name: 'Crayon', value: 'crayon' },
          { name: 'Space', value: 'space' },
          { name: 'Chromatic', value: 'chromatic' },
          { name: 'Cyberpunk', value: 'cyberpunk' },
          { name: 'Anime', value: 'anime' },
          { name: 'Landscape', value: 'landscape' },
          { name: 'Samurai', value: 'samurai' },
          { name: 'WPAP', value: 'wpap' },
          { name: 'Vintage', value: 'vintage' },
          { name: 'Pixel', value: 'pixel' },
          { name: 'Synthwave', value: 'synthwave' }
        ]
      },
      {
        name: 'enhancement',
        type: 5, 
        description: 'Enhance the image quality (true/false)',
        required: false
      },
      {
        name: 'model',
        type: 3, 
        description: 'The model used to generate the image (e.g., flux)',
        required: false,
        choices: [
          { name: 'Flux', value: 'flux' },
          { name: 'Turbo', value: 'turbo' },
          { name: "gptimage", value: 'gptimage' }
        ]
      }
    ]
  },
  {
    name: 'remix',
    description: 'Remix existing images on user upload (max 3)',
    options: [
       {
        name: "prompt",
        type: 3,
        description: "How do you want the images to be remixed?",
        required: true
       },
      {
        name: "image_1",
        type: 11, 
        description: "The first image to remix",
        required: true
      },
      {
        name: "image_2",
        type: 11, 
        description: "The second image to remix (optional)",
        required: false
      },
      {
        name: "image_3",
        type: 11, 
        description: "The third image to remix (optional)",
        required: false
      },
      {
        name: 'seed',
        type: 4, 
        description: 'The seed for random generation (optional)',
        required: false,
        min_value: 10,
        max_value: 1000000
      },
      {
        name: 'aspect_ratio',
        type: 3, 
        description: 'The aspect ratio of the image (16:9, 9:16, etc.)',
        required: false,
        choices: [
          { name: '16:9', value: '16:9' },
          { name: '9:16', value: '9:16' },
          { name: '1:1', value: '1:1' },
          { name: '4:3', value: '4:3' },
          { name: '3:2', value: '3:2' }
        ]
      },
      {
        name: 'theme',
        type: 3, 
        description: 'The theme for the image (e.g., fantasy, normal)',
        required: false,
        choices: [
          { name: 'Fantasy', value: 'fantasy' },
          { name: 'Normal', value: 'normal' },
          { name: 'Halloween', value: 'halloween' },
          { name: 'Structure', value: 'structure' },
          { name: 'Crayon', value: 'crayon' },
          { name: 'Space', value: 'space' },
          { name: 'Chromatic', value: 'chromatic' },
          { name: 'Cyberpunk', value: 'cyberpunk' },
          { name: 'Anime', value: 'anime' },
          { name: 'Landscape', value: 'landscape' },
          { name: 'Samurai', value: 'samurai' },
          { name: 'WPAP', value: 'wpap' },
          { name: 'Vintage', value: 'vintage' },
          { name: 'Pixel', value: 'pixel' },
          { name: 'Synthwave', value: 'synthwave' } 
        ]
      }
    ]
  }
];

// Function to register the commands
const registerCommands = async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
};

registerCommands();
export default registerCommands;