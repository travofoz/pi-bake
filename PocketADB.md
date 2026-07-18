# Comprehensive Engineering & Orientation Specification: Autonomous ADB/Shizuku Hardware Companion
This document serves as the absolute master orientation blueprint for the iteratr automated agent loop. It codifies the entire system architecture, context boundaries, low-level physical constraints, user experience mechanics, and the exhaustive command payload database for the ESP32-C3 Headless Automation Companion.
## 1. Context, Orientation & System Paradigm
### 1.1 The Core Problem & Design Rationale
Modern Android systems (Android 11+) isolate the execution architecture of privileged background automation tools like Shizuku. While Shizuku can run natively on-device using Android's internal Wireless Debugging loops, the Android operating system enforces an architectural safety barrier: **Wireless Debugging automatically disables itself the moment the device disconnects from a Wi-Fi network.** Furthermore, switching apps during a pairing handshake frequently causes Android to drop the volatile pairing port and reset its security keys.
This hardware device solves these operational bottlenecks by acting as an un-networked, ultra-portable, physical network anchor. It creates an isolated, zero-internet local area network (LAN) that fools the Android OS into permitting the initialization of Developer loops.
### 1.2 System Constraints & Hardware Platform
The target deployment platform is an unbranded ESP32-C3 "SuperMini" module featuring:
 * **Processor:** Single-core RISC-V 32-bit microcontroller clocked up to 160 MHz.
 * **Memory:** 400 KB of SRAM available for active runtime buffers.
 * **Storage:** 4 MB of internal SPI Flash memory (PROGMEM capacity).
 * **Peripherals:** Onboard user programmable LED (GPIO8) and a physical Boot button (GPIO9).
 * **Form Factor:** Headless, enclosed in a custom compact 3D-printed case, utilizing direct USB-C input from a power bank or the phone itself. No hardware toggles, displays, or external resets are exposed.
## 2. Advanced Memory Partitioning & Asset Optimization
To support seamless Over-The-Air (OTA) firmware deployment alongside an isolated, rich documentation web dashboard, the storage structure is split cleanly into a multi-slot partition table.
### 2.1 Custom Hardware Partition Table (partitions.csv)
The factory configuration table lacks file system allocation blocks. The system uses a specialized 4 MB memory alignment scheme:
```csv
# Name,   Type, SubType, Offset,  Size,     Flags
nvs,      data, nvs,     ,        0x4000,
otadata,  data, ota,     ,        0x2000,
ota_0,    app,  ota_0,   ,        0x160000,  # 1.40 MB Application Slot A
ota_1,    app,  ota_1,   ,        0x160000,  # 1.40 MB Application Slot B
storage,  data, littlefs,,        0x120000,  # 1.12 MB Asset/Dashboard Space
```
### 2.2 Storage Engine Selection
 * **LittleFS Deployment:** SPIFFS is explicitly banned. SPIFFS is deprecated, cannot compute directory-tree hierarchies without severe character overhead, and exhibits high corruption rates when power lines are abruptly terminated (the standard method of powering down this companion tool). LittleFS implements logging-based allocation mechanics, protecting files mid-write and offering near-instant asset mapping.
 * **Independent Frontend Upgrades:** Because AsyncElegantOTA is bound directly into the asynchronous web engine, the asset space acts as an independent target. If the web terminal dashboard layout or the embedded instruction documentation changes, a littlefs.bin file is uploaded wirelessly to the /update route. This rewrites the frontend application files without resetting or compiling the main C++ firmware application core.
## 3. Wi-Fi Lifecycle & Non-Blocking State Machine
The firmware uses a fully asynchronous tracking model managed via non-blocking microsecond timers (millis()). No blocking delays (delay()) are permitted, preventing the main application loop from choking network buffers or missing input interrupts.
```
                  [ Power On / System Wake ]
                              │
                    Query `wifi_mode` inside NVS
                    ├── Mode 1: PERM_SOFTAP ──┐
                    └── Mode 0: DEFAULT_STA   │
                         │                    │
            [ Phase 1: Initialize STA Mode ]  │
            (Retrieve saved SSID & Password)   │
                         │                    │
            [ Phase 2: Connection Monitor ]   │
            (Dynamic Window: `sta_timeout`)   │
               ├── Success                    │
               │    ▼                         │
               │ [ Active Connected State ]   │
               │                              │
               └── Timeout / Failure          │
                    │                         │
                    └─────────────────────────┼────────────────► [ Phase 3: Spin Up SoftAP Mode ]
                                                                 (Host IP: 192.168.4.1)
                                                                           │
                                                                 [ Phase 4: Inactivity Watchdog ]
                                                                 (Window: `ap_watchdog`)
                                                                    ├── Phone Connects within window
                                                                    │    ▼
                                                                    │ [ Active Web Dashboard State ]
                                                                    │
                                                                    └── Timer Expires with 0 Clients
                                                                         ▼
                                                                  [ Phase 5: Deep Sleep / Coffin ]
```
### 3.1 Step-by-Step State Transition Logic
 1. **Phase 1 (Initialization Execution):** The system mounts the NVS workspace using the Preferences library and evaluates the wifi_mode key. If wifi_mode == 1, the device bypasses network scanning and jumps instantly to Phase 3. If wifi_mode == 0, the device boots into Station mode (WiFi.mode(WIFI_STA)) and calls WiFi.begin() with parameters parsed from NVS keys sta_ssid and sta_pass.
 2. **Phase 2 (Asynchronous Connection Monitor):** The execution loop evaluates WiFi.status() against a dynamic countdown register calculated via millis() + NVS(sta_timeout). If connection locks successfully, the system transitions to an **Active Connected Client State**, flashing the onboard LED once per second. If the timer hits zero without a valid connection, the device drops the station stack via WiFi.disconnect(true, true) and automatically steps into Phase 3.
 3. **Phase 3 (SoftAP Safe Fallback):** The device establishes a standalone wireless network boundary (WiFi.mode(WIFI_AP)) configured via NVS properties ap_ssid and ap_pass. It instantiates a fixed processing gateway:
   * **Fixed Host Address:** 192.168.4.1
   * **Network Mask Configuration:** 255.255.255.0
   * **Onboard DHCP Pool Range:** 192.168.4.2 to 192.168.4.10
 4. **Phase 4 (Headless Activity Watchdog):** The moment Phase 3 initializes, a tracking timestamp is stamped. The execution frame continuously assesses WiFi.softAPgetStationNum(). If the connected client volume stays continuously at 0 for a duration matching the user-defined ap_watchdog register (default: 5 minutes), the state engine transitions to Phase 5.
 5. **Phase 5 (Deep Sleep / Coffin Mode):** To safeguard external battery blocks from drawing unneeded current inside backpacks or pockets, the device terminates the radio module completely, registers a low-level hardware interrupt on the physical button, and calls esp_deep_sleep_start(), dropping power consumption to microamps.
## 4. Low-Level Button Control Deck (GPIO9 Strapping Pin Interlock)
To maximize interaction capability while utilizing a single, headless casing layout, the system incorporates the OneButton pattern to parse multi-state operations over the physical boot pin (GPIO9).
### 4.1 Button Interaction Matrix

| Current State | Interaction Type | Threshold Limits | System Action Path |
| :--- | :--- | :--- | :--- |
| **Deep Sleep** | Any Contact Edge | Signal drop to LOW | Pin triggers RTC hardware alarm vector. Reboots CPU immediately into standard Phase 1 execution context. |
| **Awake (Any)** | Single Click | Release duration < 600ms | **Radio Toggle:** Switches active behavior on the fly between SoftAP hotspot broadcast and immediate Station network reconnection scans. |
| **Awake (Any)** | Double Click | Two down-up cycles < 350ms | **Forced Shutdown:** Dispatches payload {"event":"powerdown"} across open WebSockets, waits 100ms for network transmission clearing, then shuts down into Phase 5. |
| **Awake (Any)** | Long Press | Maintained for 10 seconds | **Factory Clear:** Completely reformats NVS storage properties, cycles the onboard LED at 25Hz for 3 seconds, and forces a software esp_restart(). |
| **Awake (Any)** | Super-Long Press | Maintained for 20 seconds | **Safety Rollback Handshake:** Arms the background OTA alternative boot target index flip routine (See Section 4.2). |

### 4.2 The 20-Second "Release-to-Rollback" Handshake Protocol
GPIO9 is a hardware **strapping pin** for the ESP32-C3 architecture. If this pin is forced to Ground (LOW) at the exact millisecond the CPU executes a reset sequence, the chip bypasses application memory entirely and boots into ROM Serial Download Mode. It then locks up until manual power cycles are initiated.
To integrate a physical partition rollback utility without hitting this strapping pin lockup, the agent loop must implement this explicit state-machine sequence:
```
[ User Holds Button for 20 Seconds ]
                  │
  Flag `rollback_armed` sets to TRUE
                  │
  LED shifts to high-visibility strobe (3 rapid flashes, 500ms pause)
                  │
  User releases button (GPIO9 returns to safe HIGH via internal pull-up)
                  │
  System catches `ButtonUp` transition event
                  │
  Enters non-blocking wait cycle: `vTaskDelay(pdMS_TO_TICKS(2000))`
                  │
  Validates GPIO9 pin remains physically HIGH
                  │
  Executes `esp_ota_set_boot_partition(inactive_slot)`
                  │
  Calls `esp_restart()` -> Clean boot into older firmware image
```
## 5. Modern Android Wireless Debugging Crypto Architecture
Android 11+ completely removes legacy, unauthenticated wireless debug endpoints over fixed ports. Devices must negotiate access using a Password-Authenticated Key Exchange (PAKE) known as **SPAKE2**, before escalating to an encrypted Mutual TLS (mTLS) 1.3 processing envelope.
### 5.1 Dynamic Network Resolution Layer
The ESP32-C3 uses its embedded mDNS responder engine to monitor and track the ephemeral ports chosen at random by the Android host OS when Wireless Debugging functions are active.
 * **Pairing Phase Sweep:** The background thread invokes mdns_query_ptr() targeting service definition _adb-tls-pairing._tcp. The engine extracts the host's dynamic port, mapping the results back to the frontend console dashboard array.
 * **Persistent Shell Session Sweep:** Following initial certificate authorization, standard data commands run over port bounds tracked using the service identifier profile string _adb-tls-connect._tcp.
### 5.2 Cryptographic Session Handshake Sequence
 1. The user enters the 6-digit numeric pairing code displayed on the Android configuration screen into the device web dashboard console interface.
 2. The ESP32 opens a raw TCP client socket connecting to the target port extracted via the _adb-tls-pairing._tcp mDNS resolution block.
 3. The device initiates the protocol upgrade request by streaming a flat 5-byte ASCII token array downstream: STLS\n.
 4. The system transitions the stream to the SPAKE2 processing layer. It uses the 6-digit passcode as a shared credential seed across standard elliptic curve definitions (mbedtls_ecp_group). This derives a cryptographically secure, high-entropy symmetric master session key without sending the raw PIN over the air.
 5. The shared secret configures a temporary secure handshake stream, escalating the connection context to a standard, mutual-authentication TLS 1.3 container.
 6. Inside the TLS container, the ESP32-C3 auto-generates a persistent RSA-2048 identity keypair (if missing from NVS storage blocks) and serves its public X.509 certificate signature to the phone. The Android daemon validates the payload, adds the certificate thumbprint to its internal permanent whitelist, and severs the configuration pairing link.
### 5.3 High-Efficiency mbedtls Static Allocations
Because cryptographic computation layers are prone to consuming excessive amounts of heap space, the project parameters inside the core toolset configuration configuration (sdkconfig) must restrict individual transaction footprint limits:
```ini
# Force mbedtls to limit frame allocation thresholds to survive inside 400KB SRAM
CONFIG_MBEDTLS_ASYMMETRIC_CONTENT_LEN=y
CONFIG_MBEDTLS_SSL_IN_CONTENT_LEN=4096
CONFIG_MBEDTLS_SSL_OUT_CONTENT_LEN=4096
CONFIG_MBEDTLS_DYNAMIC_BUFFER_ALIGNMENT=y
CONFIG_MBEDTLS_DYNAMIC_FREE_CA_CERT=y
CONFIG_MBEDTLS_DYNAMIC_FREE_CONFIG_DATA=y
```
## 6. The Exhaustive ADB Command Macro & Payload Database
Once communication bridges stabilize over an active connection resolved via _adb-tls-connect._tcp, commands wrap into standard packet formats. To eliminate runtime memory strain, all fixed control shell strings compile natively as read-only arrays inside program flash storage memory boundaries using the PROGMEM descriptor syntax.
The agent loop must map the following absolute array manifest directly to the UI execution deck layout properties:
### 6.1 Core Bootloaders & Environment Probes

| Action Macro Name | Target Shell Code Array (PROGMEM) | Expected Console Output Profile | Purpose / Target Context |
| :--- | :--- | :--- | :--- |
| **Launch Shizuku** | shell:sh /storage/emulated/0/Android/data/moe.shizuku.privileged.api/start.sh\n | Starting Shizuku... / shizuku_started | Calls Shizuku's native privilege daemon starter script directly inside the phone's storage. |
| **Verify Shell Identity** | shell:id\n | uid=2000(shell) gid=2000(shell) groups=2000(shell)... | Validates that connection states are successfully authenticated with full ADB developer rights. |
| **Get Device Model** | shell:getprop ro.product.model\n | Pixel 6a / Galaxy S23 | Queries system properties to update the top configuration tracking banner on the frontend dashboard web canvas. |
| **Get Battery Status** | shell:dumpsys battery | grep level\n | level: 84 | Displays current device battery telemetry within the management console dashboard pane. | <br> ### 6.2 Application Controls & De-Bloat Pipeline
| Action Macro Name | Target Shell Code Array (PROGMEM) | Expected Console Output Profile | Purpose / Target Context |
| :--- | :--- | :--- | :--- |
| **Enumerate User Apps** | shell:pm list packages -3\n | package:com.example.app | Extracts a clean string collection listing all user-installed applications across the local target device storage blocks. |
| **Enumerate System Apps** | shell:pm list packages -s\n | package:com.android.carrier | Extracts a clean string compilation parsing all carrier and factory-installed system application packages. |
| **Nuke Target Bloat** | shell:pm uninstall --user 0 | Success | Strips out system-level bloatware apps completely from the current active user block allocation boundary. |
| **Freeze Package** | shell:pm disable-user --user 0 | Package state changed to disabled | Completely halts background execution loops of system apps without triggering stability crashes. |
| **Thaw Package** | shell:pm enable | Package state changed to enabled | Restores an app to normal execution behavior after a freeze window. |
| **Force Stop App** | shell:am force-stop | *Empty Stream / Success* | Instantly terminates all background threads and processes bound to a specific package identification signature. |
| **Clear App Storage** | shell:pm clear | Success | Completely purges all user cache, local state files, database structures, and runtime configuration data flags from an application. | <br> ### 6.3 Advanced Permission Injection ("God-Mode" Controls)
| Action Macro Name | Target Shell Code Array (PROGMEM) | Expected Console Output Profile | Purpose / Target Context |
| :--- | :--- | :--- | :--- |
| **Inject Secure Settings** | shell:pm grant  android.permission.WRITE_SECURE_SETTINGS\n | *Empty Stream / Success* | Bypasses Android UI blocks to give automation clients authority to alter global device settings (GPS, Display states). |
| **Inject Log Access** | shell:pm grant  android.permission.READ_LOGS\n | *Empty Stream / Success* | Bypasses UI limits to let target utilities review system exception dumps and trace output blocks live. |
| **Inject System Dumps** | shell:pm grant  android.permission.DUMP\n | *Empty Stream / Success* | Permits automation clients to query low-level service diagnostics tables natively. |
| **Inject Overlay Rights** | shell:appops set  SYSTEM_ALERT_WINDOW allow\n | *Empty Stream / Success* | Overrides target Android protection policies to force support for floating control overlay windows. | <br> ### 6.4 Input Simulation & Remote Automation Layer
| Action Macro Name | Target Shell Code Array (PROGMEM) | Expected Console Output Profile | Purpose / Target Context |
| :--- | :--- | :--- | :--- |
| **Simulate Click** | shell:input tap   \n | *Empty Stream / Success* | Programmatically forces a physical tap gesture coordinate execution over the device screen plane array. |
| **Simulate Gesture** | shell:input swipe     \n | *Empty Stream / Success* | Injects a linear motion drag action string directly into the device touch controller hardware framework. |
| **Inject String Entry** | shell:input text "\"\n | *Empty Stream / Success* | Mimics physical keyboard entry processing arrays to populate targeted focus fields with string variables. |
| **Extract Screen Map** | shell:uiautomator dump /data/local/tmp/uidump.xml && cat /data/local/tmp/uidump.xml\n | <?xml version="1.0" ... | Captures and dumps the absolute layout hierarchy of the screen to identify specific user elements. |
| **Simulate Back Click** | shell:input keyevent 4\n | *Empty Stream / Success* | Dispatches a hardware back-key navigation event registration token down the OS event loop. |
| **Simulate Home Click** | shell:input keyevent 3\n | *Empty Stream / Success* | Forces immediate system return handling variables straight back to the default launcher screen canvas layout. | <br> ### 6.5 Display Modification & Interface Architecture
| Action Macro Name | Target Shell Code Array (PROGMEM) | Expected Console Output Profile | Purpose / Target Context |
| :--- | :--- | :--- | :--- |
| **Override Screen Size** | shell:wm size \n | *Empty Stream / Success* | Manually overrides display configuration size frameworks (e.g., forcing standard layout space constraints: 1080x1920). |
| **Override Density DPI** | shell:wm density \n | *Empty Stream / Success* | Dynamically modifies runtime text UI scaling scaling behaviors (e.g., adjusting device pixel structure: 420). |
| **Reset Display Size** | shell:wm size reset\n | *Empty Stream / Success* | Clears all dynamic width/height sizing rules, dropping resolution properties straight back to factory scale defaults. |
| **Reset Density DPI** | shell:wm density reset\n | *Empty Stream / Success* | Clears custom DPI density configurations, dropping UI rendering scaling parameters to factory specifications. |

## 7. Bidirectional WebSocket/Shell Bridge Engineering
To bypass the overhead of HTTP transaction formatting, raw interactive terminal navigation uses a persistent, low-overhead WebSocket route /ws/console.
### 7.1 Little Endian Binary Header Layout
All communication arrays passed between the ESP32-C3 client stack and the target phone daemon use a standard, un-padded 24-byte header packet map. All fields are parsed using strict Little Endian transformation patterns:
```cpp
struct __attribute__((packed)) adb_header {
    uint32_t command;     // Unique token byte tag string: 'CNXN', 'OPEN', 'WRTE', 'OKAY', 'CLSE'
    uint32_t arg0;        // Session tracking index address assigned dynamically by the client core
    uint32_t arg1;        // Verification channel destination routing offset map parameter
    uint32_t data_length; // Integer recording the exact size footprint of the following data payload
    uint32_t data_crc32;  // Math verification check checksum compiled across the raw payload array length
    uint32_t magic;       // Bitwise payload security check value calculated via: (command ^ 0xFFFFFFFF)
};
```
### 7.2 Hardware Accelerated Packet Validation
When streaming arbitrary input data entries typed natively into the browser dashboard interface, the ESP32 core processor handles processing optimization via these low-level steps:
 1. The browser sends text data down the /ws/console path.
 2. The ESPAsyncWebServer interrupt grabs the text array and routes it to an active application memory page without allocating a heap object.
 3. The core uses the ESP32-C3 hardware cryptography peripheral blocks to compute a rapid CRC32 check calculation across the payload buffer array string.
 4. The system builds the 24-byte header structure directly into a contiguous block, attaches the read-only flash string or dynamic input data buffer immediately behind it, and transmits the compiled unit downstream to the active TLS socket layer.
## 8. Frontend Single Page Application (SPA) Blueprint
The entire management environment lives inside a single, highly structured file asset payload stored within the /index.html section of the LittleFS cluster block.
### 8.1 Modern Web UI Presentation Framework
The UI styling is constructed using flat, dark-themed utility variables, explicitly avoiding any dependency on external CDN resources. The code uses modern, semantic structures with clear styling variables:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>ADB Companion Dashboard</title>
    <style>
        :root {
            --bg-main: #121214;
            --bg-panel: #1a1a1e;
            --accent-green: #00e676;
            --accent-blue: #2979ff;
            --text-primary: #e2e8f0;
            --text-muted: #64748b;
            --terminal-border: #2d2d34;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background-color: var(--bg-main); color: var(--text-primary); padding: 12px; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; background: var(--bg-panel); padding: 12px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); }
        .status-badge { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 14px; }
        .status-indicator { width: 10px; height: 10px; border-radius: 50%; background: #ff1744; }
        .status-indicator.connected { background: var(--accent-green); animation: pulse 2s infinite; }
        .macro-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
        .btn-macro { background: var(--bg-panel); border: 1px solid var(--terminal-border); color: var(--text-primary); padding: 14px 10px; border-radius: 6px; font-weight: 6px; text-align: left; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s ease; font-size: 13px; }
        .btn-macro:active { transform: scale(0.98); background: #23232a; border-color: var(--accent-blue); }
        .info-icon { font-style: normal; font-weight: bold; background: var(--text-muted); color: var(--bg-main); width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
        .terminal-container { flex: 1; background: #0a0a0c; border: 1px solid var(--terminal-border); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        .terminal-output { flex: 1; padding: 12px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 12px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; color: #f1f5f9; }
        .terminal-input-row { display: flex; border-top: 1px solid var(--terminal-border); background: #0e0e12; }
        .prompt { padding: 12px 6px 12px 12px; font-family: monospace; color: var(--accent-green); font-weight: bold; }
        .term-input { flex: 1; background: transparent; border: none; outline: none; color: #ffffff; font-family: monospace; padding: 12px 12px 12px 0; font-size: 13px; }
        .sliding-drawer { position: absolute; bottom: 0; left: 0; right: 0; background: var(--bg-panel); border-top: 2px solid var(--accent-blue); border-radius: 12px 12px 0 0; transform: translateY(calc(100% - 40px)); transition: transform 0.3s cubic-bezier(0.1, 0.76, 0.55, 0.94); display: flex; flex-direction: column; max-height: 70%; z-index: 100; }
        .sliding-drawer.open { transform: translateY(0); }
        .drawer-header { height: 40px; padding: 0 16px; display: flex; justify-content: space-between; align-items: center; background: #202026; cursor: pointer; border-radius: 10px 10px 0 0; }
        .drawer-title { font-size: 12px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; color: var(--text-muted); }
        .drawer-content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .accordion-item { border: 1px solid var(--terminal-border); border-radius: 6px; overflow: hidden; }
        .accordion-trigger { width: 100%; text-align: left; padding: 10px 12px; background: #1e1e24; border: none; color: var(--text-primary); font-weight: bold; font-size: 13px; display: flex; justify-content: space-between; }
        .accordion-content { background: #141418; padding: 4px; display: none; flex-direction: column; gap: 4px; }
        .accordion-content.active { display: flex; }
        .command-row { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #1a1a22; }
        .command-row:last-child { border-bottom: none; }
        .cmd-label { font-size: 12px; color: var(--text-primary); }
        .btn-inject { background: #2a2a35; border: 1px solid var(--terminal-border); color: var(--accent-blue); padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .btn-inject:break { background: var(--accent-blue); color: white; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000; justify-content: center; align-items: center; padding: 20px; }
        .modal-content { background: var(--bg-panel); border: 1px solid var(--terminal-border); border-radius: 10px; width: 100%; max-width: 450px; padding: 18px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .modal-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid var(--terminal-border); padding-bottom: 6px; color: var(--accent-blue); }
        .modal-body { font-size: 13px; line-height: 1.5; color: var(--text-primary); margin-bottom: 16px; }
        .btn-close { width: 100%; padding: 10px; background: #2a2a35; border: none; color: white; border-radius: 6px; font-weight: bold; cursor: pointer; }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
    </style>
</head>
<body>
    <div class="top-bar">
        <div id="device-banner" style="font-weight: bold;">Device: Scanning...</div>
        <div class="status-badge">
            <div id="status-dot" class="status-indicator"></div>
            <span id="status-text">DISCONNECTED</span>
        </div>
    </div>
    <div class="macro-grid">
        <button class="btn-macro" onclick="runMacro('shizuku')">
            <span>Start Shizuku Launcher</span>
            <i class="info-icon" onclick="showHelp(event, 'shizuku')">?</i>
        </button>
        <button class="btn-macro" onclick="runMacro('debloat')">
            <span>Execute Global De-Bloat</span>
            <i class="info-icon" onclick="showHelp(event, 'debloat')">?</i>
        </button>
        <button class="btn-macro" onclick="runMacro('sec_settings')">
            <span>Grant Secure Settings</span>
            <i class="info-icon" onclick="showHelp(event, 'sec_settings')">?</i>
        </button>
        <button class="btn-macro" onclick="runMacro('overlay')">
            <span>Grant Overlay Window</span>
            <i class="info-icon" onclick="showHelp(event, 'overlay')">?</i>
        </button>
    </div>
    <div class="terminal-container">
        <div class="terminal-output" id="terminal-out">Companion terminal initialized. Connect phone using dynamic wireless port to map stream.</div>
        <div class="terminal-input-row">
            <span class="prompt">adb$</span>
            <input type="text" class="term-input" id="terminal-in" placeholder="Enter custom terminal command..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="sliding-drawer" id="drawer">
            <div class="drawer-header" onclick="toggleDrawer()">
                <div class="drawer-title">Automation Reference Drawer</div>
                <div id="drawer-arrow" style="font-size: 12px;">▲</div>
            </div>
            <div class="drawer-content">
                <div class="accordion-item">
                    <button class="accordion-trigger" onclick="toggleAccordion('acc-pkg')">Package Tools</button>
                    <div class="accordion-content" id="acc-pkg">
                        <div class="command-row">
                            <span class="cmd-label">List User Applications</span>
                            <button class="btn-inject" onclick="injectCmd('pm list packages -3')">Inject</button>
                        </div>
                        <div class="command-row">
                            <span class="cmd-label">List System Applications</span>
                            <button class="btn-inject" onclick="injectCmd('pm list packages -s')">Inject</button>
                        </div>
                        <div class="command-row">
                            <span class="cmd-label">Nuke Selected App Target</span>
                            <button class="btn-inject" onclick="injectCmd('pm uninstall --user 0 ')">Inject</button>
                        </div>
                    </div>
                </div>
                <div class="accordion-item">
                    <button class="accordion-trigger" onclick="toggleAccordion('acc-input')">Input Automation</button>
                    <div class="accordion-content" id="acc-input">
                        <div class="command-row">
                            <span class="cmd-label">Capture Screen XML Layout</span>
                            <button class="btn-inject" onclick="injectCmd('uiautomator dump /data/local/tmp/uidump.xml && cat /data/local/tmp/uidump.xml')">Inject</button>
                        </div>
                        <div class="command-row">
                            <span class="cmd-label">Inject Touch Input Gesture</span>
                            <button class="btn-inject" onclick="injectCmd('input tap 540 960')">Inject</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal" id="help-modal">
        <div class="modal-content">
            <div class="modal-title" id="modal-header">Documentation Info</div>
            <div class="modal-body" id="modal-text">Documentation string context.</div>
            <button class="btn-close" onclick="closeModal()">Dismiss Documentation</button>
        </div>
    </div>
    <script>
        let ws;
        const helpData = {
            shizuku: "Fires the native background startup wrapper located inside Shizuku's application context directories. This switches the local daemon on without needing root access.",
            debloat: "Triggers package management uninstallation loops across carrier pre-installs under user allocation block 0. Safer than a systemic root delete.",
            sec_settings: "Forces permission authorization hooks for advanced operating profiles. Allows background managers to change location settings, animation layers, and locale flags automatically.",
            overlay: "Gives application targets window alert draw privileges. Essential to let overlay controllers hover input tracking icons over system config paths."
        };
        function initWebSocket() {
            ws = new WebSocket(`ws://${window.location.host}/ws/console`);
            ws.onopen = () => {
                document.getElementById('status-dot').classList.add('connected');
                document.getElementById('status-text').innerText = "CONNECTED";
            };
            ws.onclose = () => {
                document.getElementById('status-dot').classList.remove('connected');
                document.getElementById('status-text').innerText = "DISCONNECTED";
                setTimeout(initWebSocket, 2000);
            };
            ws.onmessage = (evt) => {
                const out = document.getElementById('terminal-out');
                out.innerText += evt.data;
                out.scrollTop = out.scrollHeight;
            };
        }
        function runMacro(type) {
            if(ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({type: 'macro', target: type}));
            }
        }
        function toggleDrawer() {
            const dr = document.getElementById('drawer');
            const ar = document.getElementById('drawer-arrow');
            dr.classList.toggle('open');
            ar.innerText = dr.classList.contains('open') ? "▼" : "▲";
        }
        function toggleAccordion(id) {
            document.querySelectorAll('.accordion-content').forEach(el => {
                if(el.id !== id) el.classList.remove('active');
            });
            document.getElementById(id).classList.toggle('active');
        }
        function injectCmd(str) {
            const inp = document.getElementById('terminal-in');
            inp.value = str;
            inp.focus();
            inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            toggleDrawer();
        }
        function showHelp(e, key) {
            e.stopPropagation();
            document.getElementById('modal-header').innerText = key.toUpperCase() + " Operational Vector";
            document.getElementById('modal-text').innerText = helpData[key];
            document.getElementById('help-modal').style.display = 'flex';
        }
        function closeModal() {
            document.getElementById('help-modal').style.display = 'none';
        }
        document.getElementById('terminal-in').addEventListener('keydown', function(e) {
            if(e.key === 'Enter' && this.value.trim() !== "") {
                if(ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({type: 'raw', cmd: this.value}));
                    this.value = "";
                }
            }
        });
        window.onload = initWebSocket;
    </script>
</body>
</html>
```
### 8.2 The Split-Screen Configuration Flow
Because switching away from the Android Developer options view drops active pairing loops, the user experience model expects single-device deployments to manage configuration parameters through standard split-screen layout windows:
 1. The user anchors the native Android system settings panel inside the upper processing screen frame via **Split Screen** or a **Floating View container**.
 2. The user activates the browser window containing this web dashboard app directly inside the lower panel frame boundary.
 3. The user clicks Pair Device on the upper system pane, notes down the active dynamic port integer and the volatile 6-digit numeric token, types them directly into the lower configuration form field, and presses **Authenticate**.
 4. The system discovers the active port, executes the SPAKE2 transaction, upgrades the link to an encrypted TLS container, and returns a verified status message without dropping the browser window out of focus.
## 9. Data Storage & Operational Settings Manifest
System parameters map to a clean string organization structure handled via the Espressif Preferences library system.
### 9.1 Memory Map Keys Table

| Structural NVS Allocation Key | Variable Primitive Datatype | Initial Default Factory String | Operational Purpose & Validation Bound Limits |
| :--- | :--- | :--- | :--- |
| wifi_mode | uint8_t | 0 | Mode identification registry code. 0 = Station network connection search; 1 = Standalone SoftAP hotspot lock. |
| sta_ssid | char[32] | "" | Home or mobile network identification character string space. |
| sta_pass | char[64] | "" | WPA2/WPA3 access point validation password storage layer. |
| sta_timeout | uint32_t | 30000 | Millisecond window tracking station connection timeout. Bound parameters: 10000 to 120000. |
| ap_watchdog | uint32_t | 300000 | Inactivity countdown boundary tracking current connected user count (5 minutes). |
| ap_ssid | char[32] | "ADB-Companion-C3" | Direct hotspot broadcast beacon identification tag. |
| ap_pass | char[64] | "shizuku123" | Encryption entry restriction parameter guarding companion connection safety. |

## 10. Direct Compilation Environment Settings
To process building the output firmware targets cleanly over the integrated agent development system pipelines, the underlying compilation task configuration parameters inside the root environmental manifest initialization block (platformio.ini) must match these configuration settings:
```ini
[env:esp32-c3-supermini]
platform = espressif32 @ ^6.5.0
board = esp32-c3-devkitm-1
framework = arduino
board_build.partitions = partitions.csv
board_build.filesystem = littlefs
# Pull down explicitly validated asynchronous framework libraries
lib_deps =
    me-no-dev/ESP Async WebServer @ ^1.2.4
    me-no-dev/AsyncTCP @ ^1.1.1
    ayushsharma82/AsyncElegantOTA @ ^2.2.8
    mathertel/OneButton @ ^2.5.0
build_flags =
    -D CORE_DEBUG_LEVEL=0
    -D ARDUINO_USB_MODE=1
    -D ARDUINO_USB_CDC_ON_BOOT=1
```
This absolute technical specification provides everything required to feed into the iteratr agent framework. It maps out all hardware contexts, protocol handshakes, interface assets, and macro command sets without skipping details or leaving code gaps. Use this documentation array as the continuous target reference file to guide the autonomous design, iteration, and deployment generation phases.
