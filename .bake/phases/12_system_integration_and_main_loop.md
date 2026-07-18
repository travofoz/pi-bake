# 12_system_integration_and_main_loop

## Objective
Wire all subsystems into main setup() and loop(): NVS init → WiFi state machine → web server → button handler → WebSocket → ADB connection lifecycle, with non-blocking cooperative scheduling.

## Done When
setup() initializes serial, NVS, LittleFS, WiFi, web server, and button. loop() runs state machine tick, button tick, mDNS maintenance, and WebSocket housekeeping. No blocking delays. All subsystems respond within 50ms. LED indicates system state. Compiles cleanly for ESP32-C3 SuperMini.
