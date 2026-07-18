# 11_deep_sleep_and_power_management

## Objective
Implement Phase 5 deep sleep (Coffin Mode): disable radio, register RTC GPIO9 wake interrupt, call esp_deep_sleep_start(). Handle wake-from-sleep reboot into Phase 1.

## Done When
After ap_watchdog expiry with 0 clients, radio is powered down, RTC interrupt on GPIO9 falling edge is configured, and esp_deep_sleep_start() drops consumption to µA. Any button press during sleep reboots CPU into normal execution. Powerdown via double-click also enters this state.
