#!/bin/bash
# ============================================================
# Tea Auction Tool - EC2 Setup Script
# Run as: bash setup.sh
# Tested on: Ubuntu 22.04 LTS (t3.medium)
# ============================================================
set -e

echo "========================================"
echo "  Tea Auction Tool - Server Setup"
echo "========================================"

# ── 1. System update ────────────────────────────────────────
echo "[1/10] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Install Node.js 20 LTS ───────────────────────────────
echo "[2/10] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version && npm --version

# ── 3. Install PostgreSQL ────────────────────────────────────
echo "[3/10] Installing PostgreSQL..."
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# ── 4. Setup PostgreSQL DB & User ───────────────────────────
echo "[4/10] Creating database and user..."
DB_PASS=$(openssl rand -base64 20 | tr -dc 'A-Za-z0-9' | head -c 20)
echo "⚠️  SAVE THIS PASSWORD: $DB_PASS"
echo "DB_PASSWORD=$DB_PASS" >> ~/tea_setup_info.txt

sudo -u postgres psql << EOF
CREATE USER teauser WITH PASSWORD '${DB_PASS}';
CREATE DATABASE teadb OWNER teauser;
GRANT ALL PRIVILEGES ON DATABASE teadb TO teauser;
\c teadb
GRANT ALL ON SCHEMA public TO teauser;
EOF

echo "Database created. Connection details saved to ~/tea_setup_info.txt"

# ── 5. Install Nginx ─────────────────────────────────────────
echo "[5/10] Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# ── 6. Install PM2 (process manager) ────────────────────────
echo "[6/10] Installing PM2..."
sudo npm install -g pm2

# ── 7. Clone / copy application ─────────────────────────────
echo "[7/10] Setting up application directory..."
APP_DIR="/home/ubuntu/tea-auction"
mkdir -p $APP_DIR

echo "⚠️  Copy your application files to: $APP_DIR"
echo "   scp -r ./tea-auction/* ubuntu@YOUR_EC2_IP:~/tea-auction/"

# ── 8. Setup .env ────────────────────────────────────────────
echo "[8/10] Creating .env file..."
cat > $APP_DIR/backend/.env << ENVFILE
NODE_ENV=production
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=teadb
DB_USER=teauser
DB_PASSWORD=${DB_PASS}
AI_PROVIDER=rule-based
OLLAMA_URL=http://localhost:11434
MAX_FILE_SIZE_MB=50
UPLOAD_DIR=./uploads
ENVFILE

echo ".env created at $APP_DIR/backend/.env"

# ── 9. Install Nginx config ──────────────────────────────────
echo "[9/10] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/tea-auction << 'NGINXCONF'
server {
    listen 80;
    server_name _;

    client_max_body_size 60M;

    # React frontend (built static files)
    location / {
        root /home/ubuntu/tea-auction/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Node.js API proxy
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:5000/health;
    }
}
NGINXCONF

sudo ln -sf /etc/nginx/sites-available/tea-auction /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "[10/10] Setup complete!"
echo ""
echo "========================================"
echo "  NEXT STEPS:"
echo "========================================"
echo "1. Copy app files:  scp -r ./tea-auction ubuntu@EC2_IP:~/"
echo "2. Install deps:    cd ~/tea-auction/backend && npm install"
echo "3. Run DB schema:   psql -U teauser -d teadb -h localhost -f db/schema.sql"
echo "4. Build frontend:  cd ~/tea-auction/frontend && npm install && npm run build"
echo "5. Start API:       cd ~/tea-auction/backend && pm2 start server.js --name tea-api"
echo "6. Save PM2:        pm2 save && pm2 startup"
echo "7. Access at:       http://$(curl -s ifconfig.me)"
echo ""
echo "DB Password saved to: ~/tea_setup_info.txt"
