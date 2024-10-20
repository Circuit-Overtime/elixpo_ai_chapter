package com.example;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.item.FilledMapItem;
import net.minecraft.item.ItemStack;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.world.World;
import net.minecraft.item.map.MapState;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.Color;
import java.io.File;
import java.io.IOException;

public class ElixpoMod implements ModInitializer {

    @Override
    public void onInitialize() {
        // Register the /elixpo command
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            dispatcher.register(CommandManager.literal("elixpo")
                    .executes(context -> {
                        // Get the player who issued the command
                        ServerPlayerEntity player = context.getSource().getPlayer();
                        
                        // Load the image and render it on maps
                        loadImageAndRender(player);
                        return 1;
                        }));
            });
        }
    

    private void loadImageAndRender(ServerPlayerEntity player) {
        File imageFile = new File("C:\\Users\\ELIXPO\\Desktop\\elixpo-image-template\\cow.png"); // Adjust the path if necessary

        // Check if the file exists
        if (!imageFile.exists()) {
            player.sendMessage(Text.literal("mapart.png file not found!").formatted(Formatting.RED), false);
            return;
        }

        BufferedImage image;
        try {
            // Load the 128x128 image
            image = ImageIO.read(imageFile);
            if (image.getWidth() != 128 || image.getHeight() != 128) {
                player.sendMessage(Text.literal("Image must be 128x128 pixels!").formatted(Formatting.RED), false);
                return;
            }

            // Render the image on maps
            renderImageOnMaps(player, image);
        } catch (IOException e) {
            player.sendMessage(Text.literal("Error loading image: " + e.getMessage()).formatted(Formatting.RED), false);
        }
    }

    private void renderImageOnMaps(ServerPlayerEntity player, BufferedImage image) {
        // Get the world
        World world = player.getWorld();

        // Create a new map item
        ItemStack mapItem = FilledMapItem.createMap(world, player.getBlockPos().getX(), player.getBlockPos().getZ(), (byte) 3, true, true);
        MapState mapState = FilledMapItem.getMapState(mapItem, world);

        // Clear the map colors to create a blank map
        clearMapColors(mapState);

        // Fill the map with the image data
        fillMapWithImage(mapState, image);

        // Mark the map state as dirty to update it
        mapState.markDirty();

        // Give the map to the player
        player.getInventory().insertStack(mapItem);

        // Notify the player
        player.sendMessage(Text.literal("The image has been rendered on the map!").formatted(Formatting.GREEN), false);
    }

    private void clearMapColors(MapState mapState) {
        // Clear the map colors to create a blank map
        for (int i = 0; i < mapState.colors.length; i++) {
            mapState.colors[i] = 0; // Default to black or transparent
        }
    }

    private void fillMapWithImage(MapState mapState, BufferedImage image) {
        // Iterate through the image pixels and set them in the map state
        for (int x = 0; x < 128; x++) {
            for (int y = 0; y < 128; y++) {
                // Get the pixel color
                int pixelColor = image.getRGB(x, y);
                // Convert to Minecraft map color index
                byte mapColor = getMapColor(pixelColor);

                // Debug: log the pixel color and the corresponding map color
                System.out.println("Pixel Color: " + pixelColor + " | Map Color Index: " + mapColor);
                
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
