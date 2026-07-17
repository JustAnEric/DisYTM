let TIME_ELEMENT;

let currentVideoId = null;
let videoIdChanged = false;
let currentSongLyrics;

document.addEventListener('DOMContentLoaded',(async()=>{
    console.log("YouTube Music Rich Presence Extension Loaded");
    chrome.runtime.sendMessage({action:"CONTENT_SCRIPT_LOADED",data:{platform:"YTMUSIC"}});

    document.querySelector('.time-info')&&(TIME_ELEMENT=document.querySelector('.time-info'));
}));

function fetchVideoId() {
  return new Promise((resolve) => {
    window.addEventListener("__videoIdResponse__", (e) => {
      resolve(e.detail.videoId);
    }, { once: true });
    window.dispatchEvent(new CustomEvent("__requestVideoId__"));
  });
}

function getCurrentTime() {
  if (!TIME_ELEMENT) TIME_ELEMENT = document.querySelector('.time-info');
  const parts = TIME_ELEMENT?.textContent?.split('/');
  if (parts?.length === 2) {
    const parse = t => t.trim().split(':').map(Number).reduce((a, b) => a * 60 + b);
    return { current: parse(parts[0]), duration: parse(parts[1]) };
  }
  return null;
}

let previousMetadata = null;
let previousPlaybackState = null;

// hook fetch & xhr
/*let originFetch = window.fetch;
window.fetch = async function(...args) {
  console.log("hooked fetch exec");
  const res = originFetch(...args);

  // origin
  // https://music.youtube.com/api/stats/playback?ns=yt&el=detailpage&cpn=w3ugy75nvrZCKZaO&ver=2&cmt=0.011&fmt=0&fs=0&rt=18.582&euri&lact=6582&cl=862490357&mos=0&volume=100&cbr=Chrome&cbrver=144.0.0.0&c=WEB_REMIX&cver=1.20260128.03.00&cplayer=UNIPLAYER&cos=Windows&cosver=10.0&cplatform=DESKTOP&autoplay=1&delay=4&hl=en_US&cr=FR&uga=m43&len=243&fexp=v1%2C24004644%2C27005591%2C53408%2C34656%2C106030%2C18644%2C117689%2C9252%2C3479%2C13030%2C23206%2C15179%2C20226%2C33142%2C32155%2C9720%2C2888%2C2497%2C25059%2C4174%2C25717%2C3966%2C763%2C1258%2C491%2C11768%2C4934%2C255%2C1734%2C560%2C18198%2C945%2C137%2C4434%2C1628%2C3608%2C4434%2C1368%2C1978%2C8456%2C5728%2C1903%2C8861%2C543%2C8746%2C15080%2C9500%2C1840%2C799%2C5%2C6721%2C2484%2C483%2C2113%2C512%2C4158%2C3434%2C972%2C2438%2C5616%2C4510%2C1365%2C299%2C217%2C1791%2C743%2C7055%2C2885%2C3350%2C1903%2C3457%2C1566%2C452%2C48%2C1684%2C5010%2C2282%2C41%2C196%2C542%2C1669%2C4907%2C2619%2C1741&rtn=28&afmt=141&muted=0&vis=3&docid=FaiQXcMo9ME&ei=sZeBabX8Orfp1d8P_JDk-A0&plid=AAZJ5azvwPefT5RX&referrer=https%3A%2F%2Fmusic.youtube.com%2Fsearch%3Fq%3Dradiate&autonav=1&of=ddMlk62F5VtEeP2iHpeWpA&osid=AAAABArnxQM%3AAOeUNAaYxQtocKJDog447rxU-QASAO-8tw&vm=CAMQARgBOjJBSHFpSlRKZmxtOUZEeHNxM3N5VThRSEYyM21RZU1lUXpBYlJCYkhjbzhaMG9QZENJQWJcQUx6bG9uaVE5UlpvMVQ4a19ETDFVV0k0VmtSS0pBbWNsM2pzalJnbzZydnlXRkktVDFfZjYwcnZVLXZKY3VibnNSV0VWa3NoZXN2a245UFREOWZLcHV0RGlHeTm4AQE
  const checks = [
    (u) => u.protocol === "https:",
    (u) => u.hostname === "music.youtube.com",
    (u) => u.pathname.startsWith("/api/stats/playback")
  ];

  function matches(url) {
    try {
      const u = new URL(url);
      return checks.every(fn => fn(u));
    } catch {
      return false;
    }
  }

  const url = new URL(args[0]);

  if (matches(args[0])) {
    url.searchParams.forEach((value, key) => {
      if (key === "docid") {
        if (currentVideoId !== value) {
          currentVideoId = value;
          videoIdChanged = true;
          console.log("Video ID changed to:", currentVideoId);
        }
      }
    });
  }

  return res;
}*/


(function() {
  const originalFetch = window.fetch;

  function isPlaybackUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname === "music.youtube.com" && u.pathname.startsWith("/api/stats/playback");
    } catch { return false; }
  }

  function hookedFetch(...args) {
    console.log("hooked fetch exec");
    const [resource, config] = args;

    // origin
    // https://music.youtube.com/api/stats/playback?ns=yt&el=detailpage&cpn=w3ugy75nvrZCKZaO&ver=2&cmt=0.011&fmt=0&fs=0&rt=18.582&euri&lact=6582&cl=862490357&mos=0&volume=100&cbr=Chrome&cbrver=144.0.0.0&c=WEB_REMIX&cver=1.20260128.03.00&cplayer=UNIPLAYER&cos=Windows&cosver=10.0&cplatform=DESKTOP&autoplay=1&delay=4&hl=en_US&cr=FR&uga=m43&len=243&fexp=v1%2C24004644%2C27005591%2C53408%2C34656%2C106030%2C18644%2C117689%2C9252%2C3479%2C13030%2C23206%2C15179%2C20226%2C33142%2C32155%2C9720%2C2888%2C2497%2C25059%2C4174%2C25717%2C3966%2C763%2C1258%2C491%2C11768%2C4934%2C255%2C1734%2C560%2C18198%2C945%2C137%2C4434%2C1628%2C3608%2C4434%2C1368%2C1978%2C8456%2C5728%2C1903%2C8861%2C543%2C8746%2C15080%2C9500%2C1840%2C799%2C5%2C6721%2C2484%2C483%2C2113%2C512%2C4158%2C3434%2C972%2C2438%2C5616%2C4510%2C1365%2C299%2C217%2C1791%2C743%2C7055%2C2885%2C3350%2C1903%2C3457%2C1566%2C452%2C48%2C1684%2C5010%2C2282%2C41%2C196%2C542%2C1669%2C4907%2C2619%2C1741&rtn=28&afmt=141&muted=0&vis=3&docid=FaiQXcMo9ME&ei=sZeBabX8Orfp1d8P_JDk-A0&plid=AAZJ5azvwPefT5RX&referrer=https%3A%2F%2Fmusic.youtube.com%2Fsearch%3Fq%3Dradiate&autonav=1&of=ddMlk62F5VtEeP2iHpeWpA&osid=AAAABArnxQM%3AAOeUNAaYxQtocKJDog447rxU-QASAO-8tw&vm=CAMQARgBOjJBSHFpSlRKZmxtOUZEeHNxM3N5VThRSEYyM21RZU1lUXpBYlJCYkhjbzhaMG9QZENJQWJcQUx6bG9uaVE5UlpvMVQ4a19ETDFVV0k0VmtSS0pBbWNsM2pzalJnbzZydnlXRkktVDFfZjYwcnZVLXZKY3VibnNSV0VWa3NoZXN2a245UFREOWZLcHV0RGlHeTm4AQE
    const checks = [
      (u) => u.protocol === "https:",
      (u) => u.hostname === "music.youtube.com",
      (u) => u.pathname.startsWith("/api/stats/playback")
    ];

    function matches(url) {
      try {
        const u = new URL(url);
        return checks.every(fn => fn(u));
      } catch {
        return false;
      }
    }

    const u = new URL(resource);

    if (typeof resource === "string" && isPlaybackUrl(resource)) {
      const u = new URL(resource);
      const docid = u.searchParams.get("docid");
      if (docid && docid !== currentVideoId) {
        currentVideoId = docid;
        console.log("🎯 Video ID:", currentVideoId);
      }
    }


    return originalFetch.apply(this, args);
  }

  // hook xhr
  const origOpen = XMLHttpRequest.prototype.open;

  function hookedXhr(method, url, ...rest) {
    const u = new URL(url, window.location.origin);
    if (matches(u.href)) {
      console.log("🎯 XHR playback", url);
    }
    return origOpen.call(this, method, url, ...rest);
  };

  window.XMLHttpRequest.prototype.open = hookedXhr;

  // prevent overwrite
  Object.defineProperty(window, "fetch", {
    configurable: false,
    writable: false,
    value: hookedFetch
  });

  /*Object.defineProperty(window, "XMLHttpRequest", {
    configurable: false,
    writable: false,
    value: hookedXhr
  });*/

  const observer = new MutationObserver(() => {
    // if fetch was somehow replaced, restore it
    if (window.fetch.name !== "hookedFetch") {
      console.log("⚠️ fetch was replaced — restoring hook");
      window.fetch = hookedFetch;
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  const observer2 = new MutationObserver(() => {
    // if xhr was somehow replaced, restore it
    if (window.XMLHttpRequest.prototype.open.name !== "hookedXhr") {
      console.log("⚠️ XHR was replaced — restoring hook");
      window.XMLHttpRequest.prototype.open = hookedXhr;
    }
  });

  observer2.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();


function waitForVariable(variableAccessor, conditionFn, timeoutInterval = 50, maxWaitTime = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now(); // Record when we start waiting

    const checkCondition = () => {
      const currentValue = variableAccessor(); // Get the current value
      
      // Check if condition is satisfied (e.g., variable is defined now)
      if (conditionFn(currentValue)) {
        resolve(currentValue); // It's ready! We resolve here. ✨
      } else if (Date.now() - startTime > maxWaitTime) {
        reject(new Error("Timeout! Variable did not meet condition in time."));
      } else {
        setTimeout(checkCondition, timeoutInterval); // Try again in 'timeoutInterval' milliseconds 🕒
      }
    };

    checkCondition(); // Start checking!
  });
}

function deepCopyMetadata(metadata) {
  if (!metadata) return null;
  return {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    artwork: metadata.artwork?.map((art) => ({ ...art }))
  };
}

function hasMetadataChanged(currentMetadata, previousMetadata) {
  // Return true if either is null/undefined OR if their fields have truly changed
  if (!currentMetadata && !previousMetadata) return false;
  if (!currentMetadata || !previousMetadata) return true; // one is null
  return (
    currentMetadata.title !== previousMetadata.title ||
    currentMetadata.artist !== previousMetadata.artist ||
    currentMetadata.album !== previousMetadata.album ||
    JSON.stringify(currentMetadata.artwork) !== JSON.stringify(previousMetadata.artwork)
  );
}

// 🛠 Function to monitor `mediaSession` changes
async function monitorMediaSessionChanges() {
  // Grab the current mediaSession metadata + playback state
  const currentMetadata = window.navigator.mediaSession.metadata;
  const currentPlaybackState = window.navigator.mediaSession.playbackState;

  // 🐾 Compare metadata
  if (
    currentMetadata &&
    (!previousMetadata || hasMetadataChanged(currentMetadata, previousMetadata))
  ) {
    console.log("🎶 Metadata changed!");
    console.log("Title:", currentMetadata.title);
    console.log("Artist:", currentMetadata.artist);
    console.log("Album:", currentMetadata.album);
    console.log("Artwork:", currentMetadata.artwork);

    if (previousMetadata) {
        // let's get the total duration
        let totalDuration = 0;
        let currentTime = 0;
        if (!TIME_ELEMENT) {
            TIME_ELEMENT = document.querySelector('.time-info');
        }

        const timeText = TIME_ELEMENT.textContent || "";
        const parts = timeText.split("/");
        if (parts.length === 2) {
            const parseTime = (timeStr) => {
                const parts = timeStr.split(":").map(Number);
                return parts[0] * 60 + parts[1]; // mm:ss >> seconds
            };
            totalDuration = parseTime(parts[1].trim());
            currentTime = parseTime(parts[0].trim());
            console.log("Total Duration:", totalDuration);
            console.log("Current Time:", currentTime);
        }

        // let's get the video ID

        /*const script = document.createElement("script");
        script.textContent = `
        (function() {
            // Access the ytcsi variable
            const ytcsiData = window.ytcsi?.watchdata_?.gel?.gelInfos?.videoId;
            
            // Send it back via a custom event
            const event = new CustomEvent("ytVideoIdExtracted", { detail: { videoId: ytcsiData } });
            window.dispatchEvent(event);
        })();
        `;
        (document.head || document.documentElement).appendChild(script);*/

        currentVideoId = await fetchVideoId();

        // Send to your Discord syncing logic or log it!
        chrome.runtime.sendMessage({
        action: "syncAudioData",
        data: {
            title: currentMetadata.title,
            artist: currentMetadata.artist,
            album: currentMetadata.album || "Unknown Album",
            artwork: currentMetadata.artwork || [],
            duration: totalDuration,
            current_time: currentTime,
            is_playing: currentPlaybackState === "playing",
            video_id: currentVideoId || null
        },
        sync_timestamp: Date.now(),
        sync_timestamp_s: Date.now() / 1000
        });
    }

    // Update previousMetadata state
    previousMetadata = deepCopyMetadata(currentMetadata); // Deep copy the metadata
  }

  if (currentPlaybackState !== previousPlaybackState) {
    console.log("🎵 Playback state changed!");
    console.log("New state:", currentPlaybackState);

    let totalDuration = 0;
    let currentTime = 0;
    if (!TIME_ELEMENT) {
        TIME_ELEMENT = document.querySelector('.time-info');
    }

    const timeText = TIME_ELEMENT.textContent || "";
    const parts = timeText.split("/");
    if (parts.length === 2) {
        const parseTime = (timeStr) => {
            const parts = timeStr.split(":").map(Number);
            return parts[0] * 60 + parts[1]; // mm:ss >> seconds
        };
        totalDuration = parseTime(parts[1].trim());
        currentTime = parseTime(parts[0].trim());
        console.log("Total Duration:", totalDuration);
        console.log("Current Time:", currentTime);
    }

    // Send playback state changes
    chrome.runtime.sendMessage({
      action: "syncPlaybackState",
      playbackState: currentPlaybackState,
      total_duration: totalDuration,
      current_time: currentTime,
      sync_timestamp: Date.now(),
      sync_timestamp_s: Date.now() / 1000
    });

    // Update playback state
    previousPlaybackState = currentPlaybackState;
  }
}

// Set interval to monitor every X milliseconds (e.g., 500ms-1s)
setInterval(monitorMediaSessionChanges, 10 /* adjust timing */);

chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
  if (request.action === "updateLyrics") {
    const lyrics = request.lyrics;
    const lyricsString = document.querySelectorAll('[is-track-lyrics-page] yt-formatted-string.non-expandable')[0];
    // let's do this:
    // - for every lyric, create a new <yt-formatted-lyric> element and append it to the lyricsString
    if (lyricsString) {
      lyricsString.innerHTML = ""; // clear existing lyrics
      lyrics.forEach(([timestamp, line]) => {
        const lyricElement = document.createElement("yt-formatted-lyric");
        lyricElement.setAttribute("timestamp", timestamp);
        lyricElement.textContent = line;
        lyricsString.appendChild(lyricElement);
      });
    }
    currentSongLyrics = lyrics; // store the current lyrics
  }
});

// lyric daemon
setInterval(async () => {
  if (!currentVideoId) {
    currentVideoId = await fetchVideoId();
  }

  // cycle through every lyric line and check if the timestamp is less than or equal to the current time (to provide lyric highlighting)
  const time = getCurrentTime();
  if (!time) return;

  // get the lyrics container
  const lyricsContainer = document.querySelectorAll('[is-track-lyrics-page] yt-formatted-string.non-expandable')[0];
  if (!lyricsContainer) return;

  const tabRenderer = document.querySelector('#tab-renderer');
  if (!tabRenderer) return;

  if (lyricsContainer.getAttribute('is-empty') || lyricsContainer.hasAttribute('is-empty')) {
    lyricsContainer.removeAttribute('is-empty');
  }

  Array.from(lyricsContainer.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.remove();
    }
  });

  const lyricElements = lyricsContainer.querySelectorAll("yt-formatted-lyric");

  if (lyricElements.length === 0 && currentSongLyrics) {
    // if there are no lyric elements but we have lyrics data, create them
    currentSongLyrics.forEach(([timestamp, line]) => {
      const lyricElement = document.createElement("yt-formatted-lyric");
      lyricElement.setAttribute("timestamp", timestamp);
      lyricElement.textContent = line;
      lyricsContainer.appendChild(lyricElement);
      if (timestamp <= time.current) {
        //lyricElement.style.color = "var(--yt-spec-text-primary)";
        //lyricElement.style.fontWeight = "bold";
        lyricElement.classList.add("highlighted");
      } else {
        //lyricElement.style.color = "var(--yt-spec-text-secondary)";
        //lyricElement.style.fontWeight = "normal";
        lyricElement.classList.remove("highlighted");
      }
    });
  }

  lyricElements.forEach((lyricElement, index) => {
    const timestamp = parseFloat(lyricElement.getAttribute("timestamp"));
    if (timestamp <= time.current) {
      //lyricElement.style.color = "var(--yt-spec-text-primary)";
      //lyricElement.style.fontWeight = "bold";
      lyricElement.classList.add("highlighted");
      //lyricElement.scrollIntoView({ behavior: "smooth", block: "center" });
      if (tabRenderer.scrollTop < lyricElement.offsetTop - tabRenderer.offsetTop) {
        tabRenderer.scrollTop = lyricElement.offsetTop - tabRenderer.offsetTop - (tabRenderer.clientHeight / 2) + (lyricElement.clientHeight / 2);
      }
    } else {
      //lyricElement.style.color = "var(--yt-spec-text-secondary)";
      //lyricElement.style.fontWeight = "normal";
      lyricElement.classList.remove("highlighted");
    }
  });
}, 25);

let lastKnownTime = 0;

setInterval(() => {
  const time = getCurrentTime();
  if (!time) return;
  
  const diff = time.current - lastKnownTime;
  const currentPlaybackState = window.navigator.mediaSession.playbackState;
  
  // if time jumped more than 2 seconds it's a seek
  if (diff > 2 || diff < 0) {
    chrome.runtime.sendMessage({
      action: "syncTime",
      current_time: time.current,
      duration: time.duration,
      playbackState: currentPlaybackState,
      sync_timestamp: Date.now(),
      sync_timestamp_s: Date.now() / 1000
    });
  }
  
  lastKnownTime = time.current;
}, 1000);