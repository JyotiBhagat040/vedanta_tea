#!/bin/bash
# ============================================================
#  Vedanta Tea Auction Tool - START (WSL)
#  Developed by Jyoti Bhagat
#
#  Runs inside a WSL (Ubuntu) terminal but reads the REAL
#  Windows laptop hardware UUID via powershell.exe, so the
#  license binds to the physical machine, not the WSL VM.
# ============================================================

echo "Reading machine identifier (Windows host)..."

# Call Windows PowerShell from inside WSL to get the real host UUID.
HOSTID=$(powershell.exe -NoProfile -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID" 2>/dev/null | tr -d '\r\n ')

# --- If you signed UUID + BIOS serial, use this instead:
# HOSTID=$(powershell.exe -NoProfile -Command "\$u=(Get-CimInstance Win32_ComputerSystemProduct).UUID; \$b=(Get-CimInstance Win32_BIOS).SerialNumber; Write-Output \"\$u|\$b\"" 2>/dev/null | tr -d '\r\n ')

if [ -z "$HOSTID" ]; then
  echo ""
  echo "ERROR: Could not read the Windows machine ID."
  echo "Make sure you are running this inside WSL on Windows,"
  echo "and that powershell.exe is reachable from WSL."
  echo ""
  exit 1
fi

# Write the identifier into .env for docker compose to read
echo "HOST_ID=$HOSTID" > .env

echo "Starting Tea Sampling Tool..."
sudo docker compose up -d

if [ $? -ne 0 ]; then
  echo ""
  echo "ERROR: Docker failed to start the app."
  echo "Check that Docker Desktop (with WSL integration) is running."
  echo ""
  exit 1
fi

echo ""
echo "============================================================"
echo " App started."
echo " Open this address in your browser:  http://localhost:3000"
echo " To stop the app later, run:  ./stop.sh"
echo "============================================================"
echo ""
