(() => {
  const board = window.tramTraceBoardData;
  if (!board) return;

  board.components = [
    ["J1", "USB-C receptacle", "5 V input, USB 2.0 programming and serial debugging", 120.1247, 91.935],
    ["R2 / R3", "USB-C CC pulldowns", "5.1 kΩ resistors that identify TramTrace as a USB-C power sink", 112.7647, 90.03],
    ["F1", "Resettable polyfuse", "Limits fault current from the USB 5 V input and recovers after the fault is removed", 117.7047, 84.265],
    ["D1", "SMF5.0A TVS diode", "Clamps fast voltage spikes on the protected 5 V rail", 117.6847, 79.585],
    ["U2", "AMS1117-3.3", "Linear regulator that converts USB 5 V into the ESP32's 3.3 V supply", 123.6647, 78.665],
    ["LED1", "WS2812C status pixel", "Local RGB indicator for connection and board state", 126.8947, 73.505],
    ["U4", "CH340C", "USB-to-serial bridge for firmware upload and debugging", 130.7197, 85.64],
    ["Q1 / Q2", "BC817 transistor pair", "Drives ESP32 EN and IO0 from the serial control lines for automatic uploads", 134.8047, 74.1875],
    ["U3", "ESP32-WROOM-32E", "Wi-Fi, live position processing and LED frame generation", 149.8547, 83.185],
    ["U5", "MC14504B", "Translates the ESP32's 3.3 V data into 5 V logic for the LEDs", 130.8647, 67.4925]
  ];
})();
