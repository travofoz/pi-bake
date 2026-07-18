# 10_web_server_and_ota_integration

## Objective
Wire AsyncWebServer to serve LittleFS assets, integrate AsyncElegantOTA for independent firmware and filesystem updates, and bind the state machine controller to HTTP routes.

## Done When
Server serves /index.html from LittleFS root. /update route accepts both firmware (.bin) and filesystem (littlefs.bin) uploads via AsyncElegantOTA. OTA does not block main loop. WiFi state machine reports status via HTTP /api/status. Default routes serve 404 for unknown paths.
