# 07_adb_command_macro_database

## Objective
Store all ADB shell command arrays (Sections 6.1–6.5) as PROGMEM read-only flash strings with metadata: macro name, target shell code, expected output profile, and purpose description.

## Done When
All 23 command macros from the five tables are accessible via a lookup-by-name API; each stores command string, expected output pattern, and category; commands are executed over the active ADB TLS connection.
