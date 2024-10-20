package com.example;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.item.FilledMapItem;
import net.minecraft.item.ItemStack;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.world.World;
import net.minecraft.item.map.MapState;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtHelper;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtSizeTracker;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.Color;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.Path;




public class elixpo_image implements ModInitializer {

    @Override
    public void onInitialize() {
        // Register the /elixpo command
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            dispatcher.register(CommandManager.literal("elixpo")
                    .executes(context -> {
                        // Get the player who issued the command
                        ServerPlayerEntity player = context.getSource().getPlayer();

                        // Load and render the image from mapart.dat
                        loadImageAndRender(player);
                        return 1;
                        }));
            });
        }
    

        private void loadImageAndRender(ServerPlayerEntity player) {
            Path filePath = Paths.get("C:\\Users\\ELIXPO\\Desktop\\elixpo-image-template\\mapart.dat.gz");
            NbtSizeTracker sizeTracker = NbtSizeTracker.of(2097152L); // Set the size limit to 2MB
            // Check if the file exists
            if (!Files.exists(filePath)) {
                player.sendMessage(Text.literal("mapart.dat file not found!").formatted(Formatting.RED), false);
                return;
            }
        
            NbtCompound nbtData;
            try {
                // Load NBT data using a size tracker
                nbtData = NbtIo.readCompressed(filePath, sizeTracker); // Set the size limit to 2MB
            } catch (IOException e) {
                player.sendMessage(Text.literal("Error reading NBT data: " + e.getMessage()).formatted(Formatting.RED), false);
                return;
            }
        
            // Create BufferedImage from NBT data
            BufferedImage image = createImageFromNBT(nbtData);
            if (image == null) {
                player.sendMessage(Text.literal("The image could not be created from mapart.dat!").formatted(Formatting.RED), false);
                return;
            }
        
            // Render the image on maps
            renderImageOnMaps(player, image);
        }

    private BufferedImage createImageFromNBT(NbtCompound nbtData) {
        // Extract the map data from the NBT
        NbtCompound mapData = nbtData.getCompound("map");
        byte[] colors = mapData.getByteArray("data");

        // Create a BufferedImage
        BufferedImage image = new BufferedImage(128, 128, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 128; y++) {
            for (int x = 0; x < 128; x++) {
                int index = x + y * 128;
                byte mapColor = colors[index];

                // Convert Minecraft color index to RGB
                Color color = getColorFromMapIndex(mapColor);
                image.setRGB(x, y, color.getRGB());
            }
        }
        return image;
    }

    private Color getColorFromMapIndex(byte mapColor) {
        // Return color based on Minecraft map color index
        switch (mapColor) {
            case 0: return Color.BLACK;
            case 1: return new Color(64, 64, 64); // Dark Gray
            case 2: return Color.GRAY;
            case 3: return new Color(192, 192, 192); // Light Gray
            case 4: return Color.WHITE;
            default: return Color.GREEN; // Fallback color for other indices
        }
    }

    private void renderImageOnMaps(ServerPlayerEntity player, BufferedImage image) {
        // Get the world
        World world = player.getWorld();

        // Calculate how many maps we need based on image size
        int mapWidth = (int) Math.ceil(image.getWidth() / 128.0);
        int mapHeight = (int) Math.ceil(image.getHeight() / 128.0);

        // Iterate over the segments of the image
        for (int x = 0; x < mapWidth; x++) {
            for (int y = 0; y < mapHeight; y++) {
                // Calculate the position of the segment in the original image
                BufferedImage segment = image.getSubimage(
                        x * 128,
                        y * 128,
                        Math.min(128, image.getWidth() - x * 128),
                        Math.min(128, image.getHeight() - y * 128)
                );

                // Create a new map item for this segment
                ItemStack mapItem = FilledMapItem.createMap(world, player.getBlockPos().getX(), player.getBlockPos().getZ(), (byte) 3, true, true);
                MapState mapState = FilledMapItem.getMapState(mapItem, world);

                // Clear the map colors to create a blank map
                clearMapColors(mapState);

                // Fill the map with the segment data
                fillMapWithImage(mapState, segment);

                // Mark the map state as dirty to update it
                mapState.markDirty();

                // Give the map to the player
                player.getInventory().insertStack(mapItem);
            }
        }

        // Notify the player
        player.sendMessage(Text.literal("The image has been rendered on multiple maps!").formatted(Formatting.GREEN), false);
    }

    private void clearMapColors(MapState mapState) {
        // Clear the map colors to create a blank map
        for (int i = 0; i < mapState.colors.length; i++) {
            mapState.colors[i] = 0; // Default to black or transparent
        }
    }

    private void fillMapWithImage(MapState mapState, BufferedImage image) {
        // Make sure the image is within the expected dimensions
        int imgWidth = Math.min(image.getWidth(), 128);
        int imgHeight = Math.min(image.getHeight(), 128);

        // Iterate through the image pixels and set them in the map state
        for (int x = 0; x < imgWidth; x++) {
            for (int y = 0; y < imgHeight; y++) {
                // Get the pixel color
                int pixelColor = image.getRGB(x, y);
                // Convert to Minecraft map color index
                byte mapColor = getMapColor(pixelColor);
                // Set the color in the map state
                mapState.colors[x + y * 128] = mapColor;
            }
        }
    }

    private byte getMapColor(int pixelColor) {
        // Extract RGB components
        int red = (pixelColor >> 16) & 0xFF;
        int green = (pixelColor >> 8) & 0xFF;
        int blue = pixelColor & 0xFF;

        // Convert to grayscale
        int average = (red + green + blue) / 3;

        // Simplified Minecraft map color index based on the brightness
        if (average < 43) return 0;   // Black
        if (average < 86) return 1;   // Dark Gray
        if (average < 129) return 2;  // Gray
        if (average < 172) return 3;  // Light Gray
        if (average < 215) return 4;  // White
        return 5; // Other colors can be defined as needed (up to 127)
    }
}
