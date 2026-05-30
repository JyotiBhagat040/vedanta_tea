#!/bin/bash
# ============================================================
# Install Ollama (free local AI) on EC2
# Run AFTER setup.sh on the EC2 instance
# Recommended EC2 type for AI: t3.large (2vCPU, 8GB RAM)
# ============================================================

echo "Installing Ollama (local AI)..."
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
sudo systemctl start ollama
sudo systemctl enable ollama

# Wait for Ollama to start
sleep 3

# Pull a lightweight model (choose one based on your RAM)
echo ""
echo "Which AI model to install?"
echo "  1) llama3.2:1b  - Very fast, 1GB RAM    (t3.small OK)"
echo "  2) llama3.2:3b  - Good quality, 2GB RAM  (t3.medium OK)"
echo "  3) llama3:8b    - Best quality, 5GB RAM  (t3.large needed)"
echo ""
read -p "Enter choice [1-3, default=2]: " choice

case $choice in
  1) MODEL="llama3.2:1b" ;;
  3) MODEL="llama3:8b" ;;
  *) MODEL="llama3.2:3b" ;;
esac

echo "Downloading $MODEL (this may take a few minutes)..."
ollama pull $MODEL

echo ""
echo "Ollama installed with model: $MODEL"
echo ""
echo "Update your .env file:"
echo "  AI_PROVIDER=ollama"
echo "  OLLAMA_URL=http://localhost:11434"
echo ""
echo "Also update the model name in backend/routes/ai.js:"
echo "  model: '${MODEL}'"
echo ""
echo "Restart API: pm2 restart tea-api"
