import { execSync, exec } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import admin from 'firebase-admin';
//importing the service account from firebase is needed to interact with the service

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://elixpoai-default-rtdb.firebaseio.com/'
});

const db = admin.firestore();

const ngrokConfigPath = './ngrok.yml';
const serverJsonPath = path.join(process.cwd(), 'server.json');

const isInternetAvailable = async () => {
    try {
        const response = await fetch('https://www.google.com', { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
};

const startNgrok = () => {
    const command = `ngrok start --config=${ngrokConfigPath} --all`;
    const tunnelStart = `bash /home/pi/Desktop/e;lixpo_ai_chapter/server.sh`;
    
    exec(command, (error) => {
        if (error) {
            console.error(`Error starting ngrok: ${error.message}`);
        }
    });

    exec(tunnelStart, (error) => {
        if (error) {
            console.error(`Error starting ngrok tunnel script: ${error.message}`);
        }
    });
};

const getNgrokUrl = async (port) => {
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await response.json();
    const tunnel = data.tunnels.find(tunnel => tunnel.config.addr.endsWith(`:${port}`));
    return tunnel ? tunnel.public_url : null;
};

const updateServerUrls = async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const server1Url = await getNgrokUrl(3001); //node


    console.log(`image and ping URL: ${server1Url}`);


    const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));

    serverJson.servers.server1 = server1Url; //get image and ping


    fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2));

    console.log('Updated server.json');

    console.log('Updating Firebase collection...');
    const serverRef = db.collection('Server').doc('servers');
    await serverRef.update({
        download_image: server1Url,
        get_ping: server1Url,
    });

    console.log('Firebase collection updated successfully!');
};

const main = async () => {
    console.log('Checking internet connection...');
    let internetAvailable = false;
    
    while (!internetAvailable) {
        internetAvailable = await isInternetAvailable();
        if (!internetAvailable) {
            console.log('No internet connection. Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log('Internet connection established.');
    startNgrok();
    await updateServerUrls().catch(error => {
        console.error('Error updating server URLs:', error);
    });
};

main();