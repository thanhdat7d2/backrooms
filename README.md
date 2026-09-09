# Backrooms 3D

A first-person 3D procedural maze and liminal-horror web game built with **Three.js (WebGL)** and vanilla **ES Modules** — zero build step required.

Navigate procedurally generated non-uniform mazes, explore furnished liminal rooms, interact with doors, evade a pathfinding chase entity, and locate the glowing exit pit to descend to deeper, larger levels.

---

## Key Features

### Procedural World & Architecture
- **Non-Uniform Maze Generation (`src/world/maze.js`):** Generates randomized column widths and row heights so corridors genuinely vary from wide halls to narrow passages and `0.5m` impassable gaps.
- **Guaranteed Solvability:** Uses a passability-aware **BFS connectivity solver** to guarantee every generated level is 100% solvable without routing through impassable gaps, plus loop-carving and a center island loop to defeat wall-following heuristics.
- **Furnished Liminal Rooms (`src/world/furniture.js`):** Every generated room is populated with realistic CC0 PBR 3D models (sofas, armchairs, tables, desks, lamps, bookshelves, CRT TVs, rollershutter windows, clocks, mirrors) and PBR carpets, with exit-clearance zones and 3D AABB collision.
- **Interactive & "Weird" Doors (`src/world/door.js`):** Press `E` near door handles to swing doors open/closed with spatial audio and dynamic collider updates. Includes floating, horizontally-hinged, and "weird" doors that defy physical expectations.

### Rendering, Physics & AI
- **Dynamic PointLight Pooling (`src/world/lights.js`):** Dynamically activates/deactivates the nearest shadow-casting and bounce `PointLight`s to maintain smooth WebGL performance across large mazes.
- **First-Person Physics (`src/systems/physics.js`):** Sliding 3D AABB collision against a spatial grid hash (`gridColliders`), jumping with gravity, stride-synced alternating footsteps, and smooth POV view bobbing.
- **Pathfinding Monster AI & Spatial Audio (`src/systems/spooky.js`):** A chasing entity navigates corridors using real-time **BFS pathfinding** with level-scaled speed, paired with a centralized exclusive `THREE.PositionalAudio` manager.
- **Live Navigation & Skin System (`src/systems/navigation.js`, `src/systems/texture.js`):** Toggle a real-time BFS pathfinding line to the exit (`Ctrl` / `N`), ping Euclidean distance (`Tab`), and hot-swap between 4 environment themes (*Backrooms*, *Bathroom*, *Dungeon*, *School*) at any time.

---

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / Arrow Keys | Move |
| `Mouse` | Look around (Pointer Lock) |
| `Shift` | Sprint |
| `Space` | Jump |
| `E` | Open / close nearby door |
| `Tab` (hold) | Distance-to-exit sonar ping |
| `Ctrl` or `N` | Toggle BFS pathfinding guide line |
| `Esc` | Pause / switch skin / restart level |

---

## Project Structure

```text
backrooms/
├── index.html                  # Entry point & Three.js import map
├── server.py                   # Optional Python LiveReload dev server
├── requirements.txt            # Python dev server dependency
├── styles/
│   └── main.css                # HUD, overlays, and hazard-yellow theme
├── src/
│   ├── main.js                 # Engine bootstrap, asset preloading, main loop
│   ├── state.js                # Centralized config, state, and DOM references
│   ├── world/
│   │   ├── maze.js             # Non-uniform maze & room generator + BFS solver
│   │   ├── builder.js          # Three.js scene assembly & GPU resource disposal
│   │   ├── furniture.js        # GLTF model loader & room furnishing engine
│   │   ├── door.js             # Interactive doors & dynamic colliders
│   │   └── lights.js           # Dynamic PointLight pool manager
│   └── systems/
│       ├── physics.js          # Movement, jumping, 3D AABB collision, bobbing
│       ├── controls.js         # PointerLock, keyboard/mouse, and UI bindings
│       ├── navigation.js       # Cached BFS pathfinder & floor guide line
│       ├── spooky.js           # Monster BFS AI, wall pictures, spooky audio
│       ├── audio.js            # Background track, footsteps, and mute state
│       └── texture.js          # Texture loader & live skin switcher
├── assets/
│   ├── audio/                  # Ambient audio, footsteps, doors, horror SFX
│   ├── fonts/                  # Custom display typeface
│   ├── images/                 # Environment skins, carpets, wall & monster art
│   └── models/                 # CC0 GLTF 3D furniture & interior models
└── lib/                        # Vendored Three.js r184 + addons (GLTFLoader, PointerLockControls)
```

---

## Getting Started

Because the project uses native ES Modules and loads local GLTF/texture assets, serve it over HTTP (opening `index.html` via `file://` will be blocked by browser CORS policies).

### Option 1: Built-in Python HTTP Server (no install needed)
```bash
python -m http.server 8000
```
Then open `http://127.0.0.1:8000/` in your browser.

### Option 2: LiveReload Dev Server
```bash
pip install -r requirements.txt
python server.py
```
Starts a LiveReload server on `http://127.0.0.1:8000/` and automatically opens Chrome.

### Option 3: Node.js
```bash
npx serve .
```

---

## Tech Stack
- **3D Engine:** Three.js (r184, WebGLRenderer, ACESFilmicToneMapping, PCFSoftShadowMap, PositionalAudio)
- **Language:** Vanilla JavaScript (ES2022 Modules), HTML5, CSS3
- **Dev Tooling:** Python `livereload`

---

## Credits & Licensing
- **3D Furniture Models & Carpet PBR Textures:** [Poly Haven](https://polyhaven.com/) (CC0 Public Domain)
- **3D Engine:** [Three.js](https://threejs.org/) (MIT License)
- **Source Code:** Licensed under the [MIT License](LICENSE).
