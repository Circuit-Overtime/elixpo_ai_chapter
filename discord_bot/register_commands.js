import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// Define the slash commands
const commands = [
  {
    name: 'generate',
    description: 'Generate an image based on a prompt',
    options: [
      {
        name: 'prompt',
        type: 3, // STRING
        description: 'The prompt to generate images from',
        required: true
      },
      {
        name: 'number_of_images',
        type: 4, // INTEGER
        description: 'The number of images to generate (1-4)',
        required: true,
        min_value: 1,
        max_value: 4
      },
      {
        name: 'aspect_ratio',
        type: 3, // STRING
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
        type: 3, // STRING
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
        type: 5, // BOOLEAN
        description: 'Enhance the image quality (true/false)',
        required: false
      },
      {
        name: 'model',
        type: 3, // STRING
        description: 'The model used to generate the image (e.g., flux)',
        required: false,
        choices: [
          { name: 'Flux', value: 'flux' },
          { name: 'Flux-realism', value: 'flux-realism' },
          { name: 'Flux-cablyai', value: 'flux-cablyai' },
          { name: 'Flux-anime', value: 'flux-anime' },
          { name: 'Flux-3d', value: 'flux-3d' },
          { name: 'Any-dark', value: 'any-dark' },
          { name: 'Flux-pro', value: 'flux-pro' },
          { name: 'Turbo', value: 'turbo' }
        ]
      }
    ]
  },
  {
    name: 'help',
    description: 'Provides information about the bot commands',
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