# 🍵 Tea Auction Tool — Complete Guide

## What This Tool Does

This tool manages the complete tea auction workflow:
1. **Import** weekly Catalogue (every Thursday) and Sold List Excel files
2. **Map** each party/client to their preferred tea gardens
3. **Mark** lots for each party using filters + AI price suggestions
4. **Report** summaries by party and garden
5. **Print Labels** as PDF — attach to tea samples before dispatch

---

## Project Structure

```
tea-auction/
├── backend/
│   ├── server.js           ← Express API entry point
│   ├── package.json
│   ├── .env.example        ← Copy to .env and fill in
│   ├── db/
│   │   ├── pool.js         ← PostgreSQL connection
│   │   └── schema.sql      ← Run once to create tables
│   └── routes/
│       ├── import.js       ← Excel file upload
│       ├── mapping.js      ← Party-garden mapping
│       ├── marking.js      ← Create markings
│       ├── labels.js       ← PDF label generation
│       ├── reports.js      ← Summary reports
│       ├── parties.js      ← Party CRUD
│       ├── ai.js           ← AI price suggestions
│       └── catalogue.js    ← Catalogue queries
├── frontend/
│   ├── src/
│   │   ├── App.js          ← Main app + shared components
│   │   └── pages/
│   │       ├── Dashboard.js
│   │       ├── ImportPage.js
│   │       ├── MappingPage.js
│   │       ├── MarkingPage.js
│   │       ├── ReportsPage.js
│   │       └── LabelsPage.js
└── scripts/
    ├── setup.sh            ← Run once on EC2
    ├── deploy.sh           ← Run to push updates
    └── install_ollama.sh   ← Optional: local AI
```

---

## AWS EC2 Hosting — Step by Step

### Step 1: Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. **Name**: `tea-auction-server`
3. **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
4. **Instance type**:
   - Without AI: `t3.small` (2 vCPU, 2GB RAM) — ~$15/month
   - With Ollama AI: `t3.medium` (2 vCPU, 4GB RAM) — ~$30/month
5. **Key pair**: Create new → download `.pem` file → save safely
6. **Security Group** — Allow inbound:
   - SSH (port 22) from your office IP only
   - HTTP (port 80) from your LAN IP range (e.g. 192.168.1.0/24)
   - _No domain, no HTTPS needed for internal use_
7. **Storage**: 20 GB gp3 (enough for data + OS)
8. Click **Launch Instance**

### Step 2: Connect to EC2

```bash
# From your local machine (Mac/Linux):
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# From Windows: use PuTTY or Windows Terminal
```

### Step 3: Run Setup Script

```bash
# On the EC2 server:
curl -O https://raw.githubusercontent.com/... # or copy setup.sh manually
bash setup.sh
```

Or manually copy and run:
```bash
# Copy setup.sh to EC2 first:
scp -i your-key.pem scripts/setup.sh ubuntu@EC2_IP:~/
ssh -i your-key.pem ubuntu@EC2_IP
bash setup.sh
```

### Step 4: Copy Application Files

```bash
# From your LOCAL machine:
scp -i your-key.pem -r ./tea-auction ubuntu@EC2_IP:~/
```

### Step 5: Install Dependencies & Run DB Schema

```bash
# On EC2:
# Backend
cd ~/tea-auction/backend
npm install

# Run database schema (creates all tables)
psql -U teauser -d teadb -h localhost -f db/schema.sql
# Enter the password saved in ~/tea_setup_info.txt

# Frontend
cd ~/tea-auction/frontend
npm install
npm run build
```

### Step 6: Start the Application

```bash
# Start API with PM2 (keeps running after disconnect)
cd ~/tea-auction/backend
pm2 start server.js --name tea-api

# Save PM2 config (survives server restarts)
pm2 save
pm2 startup  # Follow the printed command to run it

# Check status
pm2 status
pm2 logs tea-api
```

### Step 7: Access the Application

Open in your browser:
```
http://YOUR_EC2_PUBLIC_IP
```

No domain registration needed. Share this IP with your internal team.

---

## Monthly AWS Pricing (No Domain, Internal Use)

| Component | Spec | Monthly Cost (USD) |
|-----------|------|-------------------|
| EC2 t3.small | 2 vCPU, 2GB RAM | ~$15 |
| EC2 t3.medium | 2 vCPU, 4GB RAM (if using AI) | ~$30 |
| EBS Storage | 20 GB gp3 | ~$1.60 |
| Data Transfer | First 100 GB free | $0 |
| Elastic IP | Keep IP stable | $0 (free when attached) |
| **Total (no AI)** | t3.small + storage | **~$17/month** |
| **Total (with AI)** | t3.medium + storage | **~$32/month** |

> **Tip**: To save money, stop the EC2 instance overnight using AWS scheduler (saves ~65% on compute).

---

## AI Suggestion Options

### Option 1: Rule-Based (Default, Always Free)
- No setup needed — works out of the box
- Analyzes historical sold prices, computes trends
- Suggests: if price is rising → suggest small premium; if falling → suggest last price
- Confidence level: high/medium/low based on data points

### Option 2: Ollama — Local AI (Free, Needs t3.medium+)
```bash
bash scripts/install_ollama.sh
```
Then update `.env`:
```
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
```
Restart: `pm2 restart tea-api`

**Recommended models:**
- `llama3.2:1b` — Fast, t3.small compatible, less accurate
- `llama3.2:3b` — Good balance, t3.medium (4GB RAM)
- `llama3:8b` — Best quality, needs t3.large (8GB RAM, ~$60/mo)

### Option 3: Hugging Face (Free tier, no GPU needed)
1. Sign up at huggingface.co → Get free API key
2. Update `.env`:
```
AI_PROVIDER=huggingface
HF_API_KEY=hf_your_key_here
```
- Free: 30,000 tokens/month
- Uses Mistral 7B model
- No extra hardware needed

---

## Weekly Workflow

### Every Thursday
1. Open `http://EC2_IP` → **Import**
2. Upload new **Catalogue** Excel file
3. Upload current week **Sold List** from auction software

### Creating Markings
1. Go to **Mapping** → confirm party-garden links
2. Go to **Marking**:
   - Select party and sale number
   - Set filters (grade, price bracket, broker, bags limit)
   - Check "Skip lots where last sale price is blank"
   - Click **Preview Lots**
   - Click **AI Suggest (2wk)** for price suggestions
   - Review and edit prices as needed
   - Click **Save Markings**

### Printing Labels
1. Go to **Labels**
2. Select sale number → Load
3. Select labels to print (or Select All)
4. Click **Download PDF** → Open PDF → Print

---

## PostgreSQL Backup

```bash
# Backup (run on EC2):
pg_dump -U teauser -d teadb > ~/backup_$(date +%Y%m%d).sql

# Restore:
psql -U teauser -d teadb < ~/backup_20240101.sql

# Schedule daily backup:
crontab -e
# Add: 0 2 * * * pg_dump -U teauser -d teadb > ~/backups/tea_$(date +\%Y\%m\%d).sql
```

---

## Common Issues & Fixes

**API not responding:**
```bash
pm2 logs tea-api   # check for errors
pm2 restart tea-api
```

**Database connection error:**
```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

**Nginx not working:**
```bash
sudo nginx -t                    # check config
sudo systemctl reload nginx
```

**Port 80 not accessible:**
- Check EC2 Security Group allows port 80 from your IP
- Check: `sudo ufw status` (should allow 80)

---

## EC2 Management Tips

```bash
# Check disk space
df -h

# Check memory
free -m

# View running processes
pm2 monit

# Restart everything after EC2 reboot
pm2 resurrect
sudo systemctl start postgresql nginx
```

---

## Excel File Format Tips

The system auto-detects column names but works best when your Excel files have these headers (exact names or close variants):

**Catalogue:**
`Garden, Grade, Mark, Sale No, Invoice No, Bags, Net Wt, Broker, Upset Price, Last Sale Price, Date`

**Sold List:**
`Garden, Grade, Mark, Sale No, Invoice No, Bags, Net Wt, Broker, Deal Price, Buyer Code, Date`

Column names are case-insensitive and can use spaces or underscores interchangeably.
