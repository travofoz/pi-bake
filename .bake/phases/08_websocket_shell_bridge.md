# 08_websocket_shell_bridge

## Objective
Implement /ws/console WebSocket route with binary 24-byte little-endian ADB header (command/arg0/arg1/data_length/data_crc32/magic) and hardware-accelerated CRC32 payload validation.

## Done When
WebSocket accepts raw text or JSON macro requests. Outgoing ADB packets are framed with the packed 24-byte header + payload. CRC32 is computed via ESP32 hardware crypto peripheral. Inbound ADB responses are forwarded to the WS client. Max heap allocation per frame < 512 bytes.
