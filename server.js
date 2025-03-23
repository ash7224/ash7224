const express = require('express');
const WebSocket = require('ws');
const { NodeMediaServer } = require('node-media-server');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

const server = app.listen(port, () => console.log(`Blaze Studio running on port ${port}`));
const wss = new WebSocket.Server({ server });

const config = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        allow_origin: '*'
    }
};

const nms = new NodeMediaServer(config);
nms.run();

let liveChatId = null;

wss.on('connection', (ws) => {
    console.log('Client connected, bro!');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'startCameraStream') {
            console.log(`Camera streaming to ${data.rtmp}`);
            nms.on('prePublish', (id, StreamPath) => console.log(`Camera stream live: ${StreamPath}`));

            const { apiKey, channelId } = data;
            setInterval(async () => {
                try {
                    // Subscriber count
                    const subResponse = await axios.get(
                        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`
                    );
                    const subCount = subResponse.data.items[0].statistics.subscriberCount;
                    ws.send(JSON.stringify({ type: 'subCount', count: subCount }));

                    // Get live broadcast ID
                    if (!liveChatId) {
                        const liveResponse = await axios.get(
                            `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active&key=${apiKey}`
                        );
                        if (liveResponse.data.items.length > 0) {
                            liveChatId = liveResponse.data.items[0].snippet.liveChatId;
                        }
                    }

                    // Fetch chat
                    if (liveChatId) {
                        const chatResponse = await axios.get(
                            `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet&key=${apiKey}`
                        );
                        chatResponse.data.items.forEach(item => {
                            ws.send(JSON.stringify({ type: 'chat', message: item.snippet.displayMessage }));
                        });
                    }

                    // Dummy stats for screen broadcasting
                    ws.send(JSON.stringify({ type: 'stats', viewers: Math.floor(Math.random() * 100), bitrate: data.bitrate }));
                } catch (err) {
                    console.error('API error:', err.message);
                }
            }, 5000);
        } else if (data.type === 'startScreenStream') {
            console.log(`Screen streaming to ${data.rtmp}`);
            nms.on('prePublish', (id, StreamPath) => console.log(`Screen stream live: ${StreamPath}`));

            // Send dummy stats for screen broadcasting
            setInterval(() => {
                ws.send(JSON.stringify({ type: 'stats', viewers: Math.floor(Math.random() * 100), bitrate: data.bitrate }));
            }, 5000);
        } else if (data.type === 'stopCameraStream') {
            console.log('Camera stream stopped.');
            liveChatId = null;
        } else if (data.type === 'stopScreenStream') {
            console.log('Screen stream stopped.');
        }
    });
});

nms.on('donePublish', (id, StreamPath) => console.log(`Stream ended: ${StreamPath}`));
