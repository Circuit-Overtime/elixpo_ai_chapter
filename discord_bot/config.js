import dotenv from 'dotenv';
dotenv.config();

export const DISCORD_TOKEN = process.env.TOKEN;
export const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN;
export const CLIENT_ID = process.env.CLIENT_ID;
export const TEST_GUILD_ID = '1211167740698566717';
export const CACHE_DURATION = 30 * 60 * 1000;

export const DEFAULT_ASPECT_RATIO = '16:9';
export const DEFAULT_MODEL = 'flux';
export const DEFAULT_THEME = 'normal';
export const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;