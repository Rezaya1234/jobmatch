#!/usr/bin/env bash
# Render build script.
# Set Build Command in Render dashboard to: bash build.sh
set -e

pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
playwright install chromium
