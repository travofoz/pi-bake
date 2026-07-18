# 06_adb_cryptographic_handshake

## Objective
Implement SPAKE2 PAKE handshake using 6-digit PIN, upgrade to mTLS 1.3, auto-generate RSA-2048 identity keypair and X.509 certificate, and persist trusted thumbprint in NVS.

## Done When
Raw TCP socket to resolved pairing port sends 'STLS\n', SPAKE2 derives session key from PIN, TLS 1.3 mutual-auth channel established, RSA-2048 keypair generated if missing, cert served to Android daemon, pairing link severs cleanly.
