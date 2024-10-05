#!/bin/bash

# Function to check internet connection
sleep 30
check_internet() {
    # Try to ping Google's public DNS server
    if ping -c 1 8.8.8.8 &> /dev/null
    then
        return 0
    else
        return 1
    fi
}

# Wait until the internet connection is available
until check_internet
do
    echo "Waiting for internet connection..."
    sleep 5
done

echo "Internet connection established."

# Navigate to the directory containing the Node.js script
cd /home/pi/Desktop/elixpo_ai_chapter

# Run the Node.js script
node server_update.js

echo "Node.js script executed."
