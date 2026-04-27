#!/usr/bin/env bash
# Render build script.
# Set Build Command in Render dashboard to: bash build.sh
set -e

pip install -r requirements.txt
playwright install chromium
