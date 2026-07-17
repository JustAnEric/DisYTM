# DisYTM

## 📝 About

This project allows you to add live lyrics to YouTube Music, and provides a rich presence for Discord!

## ❓ How it works

The extension allows YouTube Music to communicate with the backend. The backend script contacts YouTube Music and lyrics services to find the best option. Current sources include:

- 👑 LRCLib
- YouTube Music (if it ships with timestamps)

> Lyric sources may be inaccurate, please consult the source code if you would like to add a reputable lyrics source.

## 💻 Run

> For both of these solutions, they will **not launch on startup.** A guide for this for each platform is coming soon.

In order to run this,

### For Windows

1. `git clone https://github.com/JustAnEric/DisYTM && cd DisYTM` - clone the repository
2. `python -m venv venv && .\venv\Scripts\pip install -r requirements.txt` - create virtual environment and install dependencies
3. `.\venv\Scripts\python main.py` - run the backend script
4. Open Chrome or your Chromium-based web browser and go to `chrome://extensions`
5. Load unpacked -> select `DisYTM/extension` folder
6. Go to YouTube Music and you've installed DisYTM.

### For Mac OS/Linux

1. `git clone https://github.com/JustAnEric/DisYTM && cd DisYTM` - clone the repository
2. `python -m venv venv && ./venv/bin/pip install -r requirements.txt` - create virtual environment and install dependencies
3. `./venv/bin/python main.py` - run the backend script
4. Open Chrome or your Chromium-based web browser and go to `chrome://extensions`
5. Load unpacked -> select `DisYTM/extension` folder
6. Go to YouTube Music and you've installed DisYTM.
