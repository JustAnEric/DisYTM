console.log("YouTube Music Rich Presence Extension Loaded");

// establish a connection
let ws = new WebSocket("ws://127.0.0.1:2222/client");

ws.onopen = () => {
    console.log("WebSocket connection established");
};

ws.onmessage = (e) => {
    let data = JSON.parse(e.data);
    if (data.type === "LYRICS_DATA") {
        // send lyrics data to content script
        chrome.tabs.query({ url: "*://music.youtube.com/*" }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateLyrics", lyrics: data.lyrics });
            }
        });
    }
}

ws.onclose = () => {
    console.log("WebSocket connection closed");
    let newWs = new WebSocket("ws://127.0.0.1:2222/client");
    newWs.onopen = ws.onopen;
    newWs.onclose = ws.onclose;
    newWs.onmessage = ws.onmessage;
    ws = newWs;
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    if (request.action === "syncAudioData") {
        let refd = request.data;
        refd.artwork = refd.artwork.map(art => art.src);
        refd.album_art_url = refd.artwork.length > 0 ? refd.artwork.at(-1) : refd.artwork.at(0) || "";
        delete refd.artwork;
        refd.name = refd.title;
        delete refd.title;
        ws.send(JSON.stringify({
            type: "SONG_STATE_UPDATE",
            song_state: refd,
            sync_timestamp: request.sync_timestamp,
            sync_timestamp_s: request.sync_timestamp_s
        }));
    } else if (request.action === "syncPlaybackState") {
        ws.send(JSON.stringify({
            type: "SONG_STATE_UPDATE",
            song_state: {
                is_playing: request.playbackState == "playing",
                current_time: request.current_time,
                total_duration: request.total_duration
            },
            sync_timestamp: request.sync_timestamp,
            sync_timestamp_s: request.sync_timestamp_s
        }));
    } else if (request.action === "syncTime") {
        ws.send(JSON.stringify({
            type: "SONG_STATE_UPDATE",
            song_state: {
                is_playing: request.playbackState == "playing",
                current_time: request.current_time,
                total_duration: request.total_duration
            },
            sync_timestamp: request.sync_timestamp,
            sync_timestamp_s: request.sync_timestamp_s
        }));
    }
});

setInterval(() => {
    ws.send(JSON.stringify({
        type: "PING"
    }));
}, 5000);