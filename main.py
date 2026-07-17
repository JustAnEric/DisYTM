import pypresence, time, asyncio, bisect, requests, re
from pypresence.types import ActivityType, StatusDisplayType
from quart import Quart, websocket, request
from uvicorn import run, Config
from ytmusicapi import YTMusic
from difflib import SequenceMatcher


ytmusic = YTMusic()
cached_lyrics = {}

def lyric_emoji(line: str) -> str:
    line = line.lower()
    if any(w in line for w in ["boom"]):
        return "💥"
    if any(w in line for w in ["heartache", "heartbreak", "lonely"]):
        return "💔"
    if any(w in line for w in ["love", "heart", "kiss", "hold"]):
        return "❤️"
    if any(w in line for w in ["cry", "tears", "sad", "hurt", "pain"]):
        return "😢"
    if any(w in line for w in ["dance", "move", "party", "night"]):
        return "🕺"
    if any(w in line for w in ["god", "pray", "heaven", "soul"]):
        return "🙏"
    if any(w in line for w in ["fire", "burn", "flame"]):
        return "🔥"
    if any(w in line for w in ["sunlight", "sun", "shine", "bright"]):
        return "☀️"
    if any(w in line for w in ["brain"]):
        return "🧠"
    if any(w in line for w in ["rain", "storm", "cloud", "thunder"]):
        return "🌧️"
    if any(w in line for w in ["star", "moon", "night", "sky"]):
        return "🌙"
    if any (w in line for w in ["smile", "happy", "joy", "laugh"]):
        return "😊"
    if any(w in line for w in ["see", "look", "watch", "view", "eyes"]):
        return "👀"
    if any(w in line for w in ["family", "home", "together", "friend"]):
        return "🏠"
    if any(w in line for w in ["bird"]):
        return "🐦"
    if any(w in line for w in ["run", "fly", "free", "wind"]):
        return "🌬️"
    if any(w in line for w in ["money", "gold", "rich"]):
        return "💰"
    return "🎵"

def match_lyrics(ytm_lines, lrc_lines):
    used_timestamps = set()
    result = []
    
    for ytm_line in ytm_lines:
        best_match = max(
            ((ts, text) for ts, text in lrc_lines.items() if ts not in used_timestamps),
            key=lambda x: SequenceMatcher(None, ytm_line.lower(), x[1].lower()).ratio(),
            default=None
        )
        
        if best_match:
            score = SequenceMatcher(None, ytm_line.lower(), best_match[1].lower()).ratio()
            if score > 0.6:
                used_timestamps.add(best_match[0])
                result.append((best_match[0], ytm_line))
                continue
        
        result.append((None, ytm_line))
    
    return sorted(result, key=lambda x: x[0] if x[0] is not None else float('inf'))

def parse_lrc(lrc: str):
    lines = {}
    for line in lrc.split('\n'):
        match = re.match(r'\[(\d+):(\d+\.\d+)\](.*)', line)
        if match:
            minutes, seconds, text = match.groups()
            timestamp = int(minutes) * 60 + float(seconds)
            text = text.strip()
            if text:
                lines[timestamp] = text
    return lines  # {timestamp: lyric_line}

class Manager:
    def __init__(self):
        self.rpc = None
        self.rpc_client_id = None

    async def setup_discord_rpc(self, client_id: str) -> pypresence.Presence:
        """
        Sets up the Discord Rich Presence client.

        Args:
            client_id (str): The Discord application client ID.

        Returns:
            pypresence.Presence: The initialized Discord RPC client.
        """
        rpc = pypresence.AioPresence(client_id)
        await rpc.connect()
        self.rpc_client_id = client_id
        self.rpc = rpc
        return self

    async def update_discord_presence(self, details: str, state: str, large_image: str, small_image: str | None = None, small_text: str = "", large_text: str = "", start: int | None = None, end: int | None = None, buttons: list | None = None):
        """
        Updates the Discord Rich Presence status.

        Args:
            rpc (pypresence.Presence): The Discord RPC client.
            details (str): The details to display.
            state (str): The state to display.
            large_image (str): The key for the large image asset.
            small_image (str | None): The key for the small image asset.
        """
        if self.rpc is None:
            raise ValueError("Discord RPC client is not set up. Call setup_discord_rpc() first.")
        await self.rpc.update(
            details=details,
            state=state,
            large_image=large_image,
            small_image=small_image,
            large_text=large_text,
            small_text=small_text,
            activity_type=pypresence.ActivityType.LISTENING,
            start=start,
            end=end,
            buttons=buttons
        )
        return self
    
    async def clear_discord_presence(self):
        """
        Clears the Discord Rich Presence status.
        """
        if self.rpc is None:
            raise ValueError("Discord RPC client is not set up. Call setup_discord_rpc() first.")
        await self.rpc.clear()
        return self
    
class App:
    def __init__(self):
        self.app = Quart(__name__)
        self.manager = Manager()
        self.song_state = {
            "name": "",
            "artist": "",
            "album": "",
            "duration": 0,
            "current_time": 0,
            "is_playing": False,
            "album_art_url": "",
            "video_id": ""
        }
        self.lyric_lines = []
        self.current_lyrics_video_id = None
        self.last_lyric_line_idx = -1
        self.playback_start_time = None
        self.clients_connected = set()
        
        # Define routes
        
        self.app.route("/")(self.index)
        self.app.websocket("/client")(self.ws)
        
        @self.app.before_serving
        async def startup():
            await self.manager.setup_discord_rpc("1450669269791539283")  # Replace with your Discord application client ID
            asyncio.create_task(self.lyrics_loop())
            
        @self.app.after_serving
        async def shutdown():
            await self.manager.clear_discord_presence()
            if self.manager.rpc:
                await self.manager.rpc.close()
            # disconnect all ws clients
            for client in list(self.clients_connected):
                await client.close()
            self.clients_connected.clear()
            
    async def lyrics_loop(self):
        self.last_lyric_line_idx = -1
        while True:
            await asyncio.sleep(1)
            if not self.lyric_lines or not self.song_state.get("is_playing"):
                continue
            
            elapsed = time.time() - self.playback_start_time
            
            timestamps = [t for t, _ in self.lyric_lines if t is not None]
            lines = [l for t, l in self.lyric_lines if t is not None]
            
            if not timestamps:
                # no timestamps, fall back to interval math
                duration = self.song_state.get("duration", 0)
                if not duration:
                    continue
                interval = duration / len(self.lyric_lines)
                idx = min(int(elapsed / interval), len(self.lyric_lines) - 1)
                lines = [l for _, l in self.lyric_lines]
            else:
                idx = bisect.bisect_right(timestamps, elapsed) - 1
                idx = max(0, idx)
            
            if idx == self.last_lyric_line_idx:
                continue
            
            self.last_lyric_line_idx = idx
            
            await self.manager.update_discord_presence(
                details=self.song_state.get("name", ""),
                state=lyric_emoji(lines[idx]) + " • " + lines[idx],
                large_image=self.song_state.get("album_art_url", ""),
                #small_image="play_small_image",
                large_text=self.song_state.get("album", ""),
                #small_text="Playing",
                start=int(self.playback_start_time),
                end=int(self.playback_start_time + self.song_state.get("duration", 0)),
                buttons=[{"label": "Listen", "url": self.song_state.get("url", "https://music.youtube.com/")}]
            )
            
    async def get_lyrics(self, video_id, title, artist, duration):
        ytm_lines = []
        lrc_lines = {}

        def thread_0():
            nonlocal ytm_lines
            # try ytmusicapi first
            try:
                watch = ytmusic.get_watch_playlist(videoId=video_id)
                lyrics_id = watch.get('lyrics')
                if lyrics_id:
                    lyrics = ytmusic.get_lyrics(lyrics_id)
                    raw = lyrics.get('lyrics', '')
                    ytm_lines = [l for l in raw.split('\n') if l.strip()]
            except:
                pass

        def thread_1():
            nonlocal ytm_lines, lrc_lines
            # try lrclib for timestamps
            try:
                r = requests.get("https://lrclib.net/api/get", params={
                    "artist_name": artist,
                    "track_name": title,
                    "duration": duration
                })
                data = r.json()
                raw = data.get("syncedLyrics", "")
                if raw:
                    lrc_lines = parse_lrc(raw)
            except:
                pass
            
        # run both threads concurrently
        await asyncio.gather(
            asyncio.to_thread(thread_0),
            asyncio.to_thread(thread_1)
        )

        # both sources / cross reference
        if ytm_lines and lrc_lines:
            return match_lyrics(ytm_lines, lrc_lines)
        
        # only lrclib with timestamps
        if lrc_lines:
            return [(t, l) for t, l in sorted(lrc_lines.items())]
        
        # only ytmusicapi, no timestamps
        if ytm_lines:
            return [(None, l) for l in ytm_lines]

        return []
        
    async def index(self):
        return "YouTube Music Rich Presence is running."
    
    async def ws(self):
        await websocket.accept()
        self.clients_connected.add(websocket)
        
        try:
            while True:
                data = await websocket.receive_json()
                if data["type"] == "UPDATE_PRESENCE":
                    details = data.get("details", "")
                    state = data.get("state", "")
                    large_image = data.get("large_image", "")
                    small_image = data.get("small_image", "")
                    large_text = data.get("large_text", "")
                    small_text = data.get("small_text", "")
                    
                    await self.manager.update_discord_presence(
                        details=details,
                        state=state,
                        large_image=large_image,
                        small_image=small_image,
                        large_text=large_text,
                        small_text=small_text
                    )
                    await websocket.send_json({"type": "discord_presence_updated"})
                elif data["type"] == "SONG_STATE_UPDATE":
                    sync_timestamp_seconds = data.get("sync_timestamp_s", time.time())
                    self.song_state.update(data.get("song_state", {}))
                    await websocket.send_json({"type": "song_state_updated"})
                    print(self.song_state)
                    
                    is_playing = self.song_state.get("is_playing", False)
                    elapsed = self.song_state.get("current_time", 0)
                    duration = self.song_state.get("duration", 0)
                    
                    if (not is_playing) or (elapsed >= duration):
                        await self.manager.clear_discord_presence()
                        continue
                    
                    start = int(sync_timestamp_seconds - elapsed) if is_playing else None
                    end = int(sync_timestamp_seconds + (duration - elapsed)) if is_playing else None
                    
                    if (not self.song_state.get("video_id")):
                        URL = "https://music.youtube.com/"
                    else:
                        URL = "https://music.youtube.com/watch?v=" + self.song_state.get("video_id", "")
                            
                    self.playback_start_time = sync_timestamp_seconds - elapsed if is_playing else None
                    
                    await self.manager.update_discord_presence(
                        details=self.song_state.get("name", ""),
                        state=f"{self.song_state.get('artist', '')}",
                        large_image=self.song_state.get("album_art_url", ""),
                        #small_image="play_small_image" if self.song_state.get("is_playing", False) else "pause_small_image",
                        large_text=self.song_state.get("album", ""),
                        #small_text="Playing" if self.song_state.get("is_playing", False) else "Paused",
                        start=start,
                        end=end,
                        buttons=[{"label": "Listen", "url": URL}]
                    )
                    
                    # Automatically update presence based on song state
                    if (self.song_state.get("video_id")):
                        # validate whether the video ID is correct by matching the title
                        ytmsearch = ytmusic.search(self.song_state.get("name", ""), filter="songs")
                        if ytmsearch:
                            # check all the results for a match with the artist and title
                            first_result = None
                            for result in ytmsearch:
                                if (result.get("title", "").lower() == self.song_state.get("name", "").lower() and
                                    any(artist.get("name", "").lower() == self.song_state.get("artist", "").lower() for artist in result.get("artists", []))):
                                    first_result = result
                                    break
                            first_result = first_result or ytmsearch[0]
                            if first_result.get("videoId", "") != self.song_state.get("video_id", ""):
                                print(f"Video ID mismatch: expected {self.song_state.get('video_id', '')}, got {first_result.get('videoId', '')}. Updating video ID.")
                                self.song_state["video_id"] = first_result.get("videoId", "")
                        
                        #print(lyrics)
                        if (cached_lyrics.get(self.song_state.get("video_id", "")) is None):
                            lyrics = await self.get_lyrics(
                                video_id=self.song_state.get("video_id", ""),
                                title=self.song_state.get("name", ""),
                                artist=self.song_state.get("artist", ""),
                                duration=self.song_state.get("duration", 0)
                            )
                            cached_lyrics[self.song_state.get("video_id", "")] = lyrics
                            print("Fetched lyrics from API and cached them.")
                            print(cached_lyrics[self.song_state.get("video_id", "")])
                            self.lyric_lines = cached_lyrics[self.song_state.get("video_id", "")]
                            self.current_lyrics_video_id = self.song_state.get("video_id", "")
                            self.last_lyric_line_idx = -1
                        else:
                            print("Using cached lyrics.")
                            print(cached_lyrics[self.song_state.get("video_id", "")])
                            self.lyric_lines = cached_lyrics[self.song_state.get("video_id", "")]
                            self.current_lyrics_video_id = self.song_state.get("video_id", "")
                            self.last_lyric_line_idx = -1
                            
                        # lyrics transformation from tuples
                        ll = [[t, l] for t, l in self.lyric_lines if l.strip()]
                        await websocket.send_json({"type": "LYRICS_DATA", "lyrics": ll})
                        
                elif data["type"] == "PING":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json({"type": "unknown_command", "command": data["type"]})
        except Exception as e:
            print(f"WebSocket error: {e}")
            return

    def run(self, host="0.0.0.0", port=2222):
        #config = Config(self.app, host=host, port=port, log_level="info")
        run(app=self.app, host=host, port=port, log_level="info")
    
if __name__ == "__main__":
    CLIENT_ID = "1450669269791539283"  # Replace with your Discord application client ID
    app_instance = App()
    app_instance.run()