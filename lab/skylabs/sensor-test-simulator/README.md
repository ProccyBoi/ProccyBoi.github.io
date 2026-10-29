# Skylabs Sensor Test PCB simulator

Open `index.html` in a current browser with WebGL enabled. All runtime scripts and board data are included locally; no internet connection is required. Drag the board to rotate it, scroll to zoom, and use Reset View to restore the starting angle. Select a bank on the right to adjust its brightness and power. The two addressable RGB banks also support colour and spatial patterns; the four red emitters share a single fixed-red control.

The model is based on the supplied KiCad board layout, including footprint positions, front copper tracks, and board outline. Component bodies are simplified approximations. The light effects are visual illustrations, not measured brightness, electrical simulation, firmware, or a connection to the physical board. The sweep is ordered spatially, not a representation of the electrical data-chain order.

Three.js and OrbitControls are distributed under the MIT license; see `THREE-LICENSE.txt`.
