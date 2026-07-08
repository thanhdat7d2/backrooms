from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
import webbrowser
from pathlib import Path
from livereload import Server  # Requires: pip install livereload

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))


def open_browser() -> None:
    url = f"http://{HOST}:{PORT}/"

    # Give the server a moment to start accepting requests before opening the tab.
    time.sleep(1.0)

    chrome_candidates = [
        shutil.which("chrome"),
        os.path.join(os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
    ]

    for chrome_path in chrome_candidates:
        if chrome_path and os.path.exists(chrome_path):
            subprocess.Popen([chrome_path, "--new-tab", url])
            return

    try:
        webbrowser.get("chrome").open_new_tab(url)
        return
    except webbrowser.Error:
        pass

    webbrowser.open_new_tab(url)


def main() -> None:
    root = Path(__file__).resolve().parent
    os.chdir(root)

    # Initialize the LiveReload server targeting the root directory
    server = Server()

    # The magic trick: 
    # "**/*" means search recursively through all subfolders.
    # "*" means match any file name and any file extension.
    server.watch("**/*")

    # Start the browser-opening thread
    threading.Thread(target=open_browser, daemon=True).start()

    print(f"Serving and watching {root} at http://{HOST}:{PORT}/")
    try:
        # Run the server (it defaults to hosting the current directory)
        server.serve(host=HOST, port=PORT, root=str(root))
    except KeyboardInterrupt:
        print("\nShutting down.")


if __name__ == "__main__":
    main()