#!/bin/bash
# ============================================================
# Tea Auction Tool - Deploy Update Script
# Run from your LOCAL machine: bash deploy.sh ubuntu@EC2_IP
# ============================================================
EC2_HOST=${1:-"ubuntu@YOUR_EC2_IP"}
APP_DIR="~/tea-auction"

echo "Deploying to $EC2_HOST..."

# Step 1: Copy files
echo "[1/4] Syncing files..."
rsync -avz --exclude=node_modules --exclude=.env --exclude=uploads \
  ./tea-auction/ ${EC2_HOST}:${APP_DIR}/

# Step 2: Install backend deps & run schema
echo "[2/4] Installing backend dependencies..."
ssh $EC2_HOST "cd ${APP_DIR}/backend && npm install --production"

# Step 3: Build React frontend
echo "[3/4] Building React frontend..."
ssh $EC2_HOST "cd ${APP_DIR}/frontend && npm install && npm run build"

# Step 4: Restart API
echo "[4/4] Restarting API..."
ssh $EC2_HOST "pm2 restart tea-api || pm2 start ${APP_DIR}/backend/server.js --name tea-api"

echo "Deploy complete! http://$(ssh $EC2_HOST 'curl -s ifconfig.me 2>/dev/null')"
