const axios = require('axios');
const sharp = require('sharp');
const nbt = require('node-nbt');
const fs = require('fs');
const zlib = require('zlib');

// Function to convert image URL to map art
async function convertImageToMapArt(imageUrl) {
    try {
        // Fetch the image from the URL
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        console.log('Image fetch status:', response.status);

        if (response.status !== 200) {
            throw new Error('Failed to fetch image.');
        }

        const imageBuffer = Buffer.from(response.data);

        // Load the image using Sharp and resize it to 128x128
        const { data, info } = await sharp(imageBuffer)
            .resize(128, 128)
            .raw()
            .toBuffer({ resolveWithObject: true });

        console.log('Sharp output info:', info);
        console.log('Sharp output data length:', data.length);

        // Create an array for Minecraft map colors
        const colors = new Uint8Array(128 * 128);

        // Convert each pixel to a Minecraft map color
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const offset = (y * info.width + x) * info.channels;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const mapColor = getMapColor(r, g, b);
                colors[y * 128 + x] = mapColor;
            }
        }

        // Create NBT data
        const nbtData = {
            type: nbt.TAG_Compound,
            value: {
                map: {
                    data: { type: nbt.TAG_Byte_Array, value: colors },
                    height: { type: nbt.TAG_Int, value: 128 },
                    width: { type: nbt.TAG_Int, value: 128 },
                    scale: { type: nbt.TAG_Byte, value: 3 },
                },
            },
        };

        // Write the NBT data to a buffer
        const nbtBuffer = nbt.NbtWriter.writeByteArray(nbtData);

        // Compress the NBT data using gzip
        const compressedNbtBuffer = zlib.gzipSync(nbtBuffer);

        // Save the compressed NBT data to a file
        fs.writeFileSync('mapart.dat.gz', compressedNbtBuffer);

        console.log('Map art created successfully!');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Helper function to convert RGB to Minecraft map color
function getMapColor(r, g, b) {
    const average = (r + g + b) / 3;

    if (average < 43) return 0;   // Black
    if (average < 86) return 1;   // Dark Gray
    if (average < 129) return 2;  // Gray
    if (average < 172) return 3;  // Light Gray
    if (average < 215) return 4;  // White
    return 5; // Other colors can be defined as needed
}

// Example usage
const imageUrl = 'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/a%20cow.png?alt=media&token=25bbe8b4-4278-45bd-9c9e-5b7f29991181'; // Replace with your image URL
convertImageToMapArt(imageUrl);