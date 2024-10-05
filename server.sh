#!/bin/bash

# Start the Node.js servers in the background
node ../Elixpo_ai_pollinations/server_networks/getImage.js &
echo "image.js is running in the background with PID $!"

#initiates both the ping and the image feed