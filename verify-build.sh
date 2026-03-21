#!/bin/bash

# Migoo.OS - Pre-Deployment Build Verification Script
# This script tests that your project builds correctly before deploying to Vercel

echo "🔍 Starting Migoo.OS Build Verification..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Node version
echo "1️⃣  Checking Node.js version..."
NODE_VERSION=$(node -v)
echo "   Node version: $NODE_VERSION"
if [[ "$NODE_VERSION" < "v18" ]]; then
    echo -e "   ${YELLOW}⚠️  Warning: Node 18+ recommended${NC}"
fi
echo ""

# Step 2: Check if node_modules exists
echo "2️⃣  Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   📦 Installing dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✅ Dependencies installed${NC}"
    else
        echo -e "   ${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
else
    echo -e "   ${GREEN}✅ Dependencies already installed${NC}"
fi
echo ""

# Step 3: Run build
echo "3️⃣  Building project..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✅ Build successful!${NC}"
else
    echo -e "   ${RED}❌ Build failed!${NC}"
    echo "   Please fix build errors before deploying to Vercel"
    exit 1
fi
echo ""

# Step 4: Check dist folder
echo "4️⃣  Verifying build output..."
if [ -d "dist" ]; then
    echo -e "   ${GREEN}✅ dist/ folder created${NC}"
    
    # Check for index.html
    if [ -f "dist/index.html" ]; then
        echo -e "   ${GREEN}✅ index.html exists${NC}"
    else
        echo -e "   ${RED}❌ index.html missing${NC}"
        exit 1
    fi
    
    # Check for assets
    if [ -d "dist/assets" ]; then
        echo -e "   ${GREEN}✅ assets/ folder exists${NC}"
        FILE_COUNT=$(ls -1 dist/assets | wc -l)
        echo "   📁 Asset files: $FILE_COUNT"
    else
        echo -e "   ${YELLOW}⚠️  No assets folder${NC}"
    fi
else
    echo -e "   ${RED}❌ dist/ folder not created${NC}"
    exit 1
fi
echo ""

# Step 5: Check critical files
echo "5️⃣  Checking critical files..."
CRITICAL_FILES=(
    "package.json"
    "vite.config.ts"
    "vercel.json"
    "index.html"
    "src/main.tsx"
    "src/app/App.tsx"
    ".gitignore"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "   ${GREEN}✅${NC} $file"
    else
        echo -e "   ${RED}❌${NC} $file (missing)"
    fi
done
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 BUILD VERIFICATION COMPLETE!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Your Migoo.OS project is ready for Vercel deployment!"
echo ""
echo "Next steps:"
echo "  1. git add ."
echo "  2. git commit -m \"Ready for deployment\""
echo "  3. git push origin main"
echo "  4. Deploy to Vercel via dashboard or CLI"
echo ""
echo "📖 See VERCEL_DEPLOYMENT_INSTRUCTIONS.md for detailed steps"
echo ""
