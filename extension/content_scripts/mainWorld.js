function getVideoId() {
  return window.ytcsi?.data_?.gel?.gelInfos?.videoId ?? new URLSearchParams(window.location.search).get('v') ?? null;
}

// forward it to the isolated world via CustomEvent
window.addEventListener("__requestVideoId__", () => {
  window.dispatchEvent(new CustomEvent("__videoIdResponse__", {
    detail: { videoId: getVideoId() }
  }));
});

setInterval(() => {
  const videoId = getVideoId();
}, 1000);