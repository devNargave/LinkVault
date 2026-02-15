#!/bin/bash

echo "=================================="
echo "PASTE.SYS Setup Script"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${BLUE}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 16+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VERSION found${NC}"

# Install backend dependencies
echo ""
echo -e "${BLUE}Installing backend dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install backend dependencies${NC}"
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo -e "${BLUE}Creating .env file...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Install frontend dependencies
echo ""
echo -e "${BLUE}Installing frontend dependencies...${NC}"
cd client
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
    exit 1
fi

cd ..

# Create necessary directories
echo ""
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p uploads
mkdir -p data
echo -e "${GREEN}✓ Directories created${NC}"

echo ""
echo "=================================="
echo -e "${GREEN}✓ Setup completed successfully!${NC}"
echo "=================================="
echo ""
echo "To start the application:"
echo ""
echo "1. Start the backend (in one terminal):"
echo "   npm start"
echo ""
echo "2. Start the frontend (in another terminal):"
echo "   cd client && npm run dev"
echo ""
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "=================================="
