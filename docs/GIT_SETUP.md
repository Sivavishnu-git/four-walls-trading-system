# Git Setup Guide for LiveTrading

## 📋 Pre-Commit Checklist

Before initializing git, you **MUST** remove hardcoded tokens!

### ⚠️ CRITICAL: Remove Hardcoded Tokens

**Files that need to be updated:**

1. **`src/components/OIMonitor.jsx`** - Line 6
2. **`src/App.jsx`** - Line 84

**Current Issue:**
```javascript
// ❌ NEVER commit this!
const [token, setToken] = useState("eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ...");
```

**Solution:**
```javascript
// ✅ Safe to commit
const [token, setToken] = useState("");
```

---

## 🚀 Git Initialization Steps

### Step 1: Remove Hardcoded Tokens

**Option A: Remove tokens manually**
1. Open `src/components/OIMonitor.jsx`
2. Change line 6 to: `const [token, setToken] = useState("");`
3. Open `src/App.jsx`
4. Change line 84 to: `<OrderPlacementDemo token="" />`

**Option B: Use environment variables (recommended)**
1. Create `.env` file (already in .gitignore)
2. Add: `VITE_UPSTOX_ACCESS_TOKEN=your_token_here`
3. Update code to use: `import.meta.env.VITE_UPSTOX_ACCESS_TOKEN`

### Step 2: Initialize Git Repository

```bash
# Initialize git repository
git init

# Verify .gitignore is present
cat .gitignore

# Check what files will be tracked
git status
```

### Step 3: Verify No Secrets Will Be Committed

```bash
# Search for potential secrets in files to be committed
git diff --cached | grep -i "token\|api_key\|secret\|password"

# If any secrets found, DO NOT COMMIT!
```

### Step 4: Make Initial Commit

```bash
# Add all files (respecting .gitignore)
git add .

# Verify what's being added
git status

# Create initial commit
git commit -m "Initial commit: LiveTrading application with OI monitoring and order placement"
```

### Step 5: (Optional) Connect to Remote Repository

```bash
# Add remote repository
git remote add origin https://github.com/yourusername/LiveTrading.git

# Push to remote
git push -u origin main
```

---

## 📁 What Will Be Committed

### ✅ Included (Safe):
- Source code files (`src/**/*.jsx`, `src/**/*.js`)
- Configuration files (`package.json`, `vite.config.js`)
- Documentation (`docs/*.md`, `README.md`)
- Scripts (`scripts/*.js`)
- Proxy server (`proxy-server.js`)
- Public assets (`public/**`)
- `.gitignore` and `.env.example`

### ❌ Excluded (Protected):
- `node_modules/` - Dependencies (too large, can be reinstalled)
- `.env` - Environment variables with secrets
- `*.log` - Log files
- `dist/` - Build output
- Any files with tokens, API keys, or secrets
- `docs/NSE.json` - Large data file (optional, can include if needed)

---

## 🔍 Verify Before Committing

Run these commands to ensure no secrets are being committed:

```bash
# 1. Check git status
git status

# 2. Search for tokens in staged files
git diff --cached | grep -E "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"

# 3. Search for API keys
git diff --cached | grep -i "api[_-]?key"

# 4. List all files to be committed
git diff --cached --name-only

# 5. Review specific file
git diff --cached src/components/OIMonitor.jsx
```

---

## 🛡️ Git Security Tools (Optional)

### Install git-secrets

Prevents committing secrets:

```bash
# Install git-secrets (Windows with Git Bash)
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install

# Configure for your repo
cd /path/to/LiveTrading
git secrets --install
git secrets --register-aws
git secrets --add 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
```

---

## 📝 Recommended .gitignore Additions

If you need to exclude additional files:

```bash
# Add to .gitignore
echo "my_notes.txt" >> .gitignore
echo "test_tokens.json" >> .gitignore
```

---

## 🔄 Daily Git Workflow

### Before Starting Work:
```bash
git pull origin main
```

### After Making Changes:
```bash
# Check what changed
git status

# Review changes
git diff

# Add specific files
git add src/components/MyComponent.jsx

# Or add all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add new feature description"

# Push to remote
git push origin main
```

---

## 🚨 Emergency: Token Accidentally Committed

If you accidentally commit a token:

### 1. Revoke the Token Immediately
- Go to Upstox Developer Portal
- Revoke the compromised token
- Generate a new token

### 2. Remove from Git History
```bash
# For the most recent commit (not yet pushed)
git reset --soft HEAD~1
git reset HEAD src/components/OIMonitor.jsx
# Edit file to remove token
git add src/components/OIMonitor.jsx
git commit -m "fix: Remove hardcoded token"

# If already pushed to remote (DANGEROUS - rewrites history)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch src/components/OIMonitor.jsx" \
  --prune-empty --tag-name-filter cat -- --all

git push origin --force --all
```

### 3. Update .gitignore
Ensure the file pattern is in `.gitignore` to prevent future commits.

---

## 📊 Git Commit Message Convention

Use conventional commits:

```bash
# Features
git commit -m "feat: Add order placement functionality"

# Bug fixes
git commit -m "fix: Correct OI data calculation"

# Documentation
git commit -m "docs: Update API documentation"

# Refactoring
git commit -m "refactor: Improve code structure"

# Performance
git commit -m "perf: Optimize polling interval"

# Tests
git commit -m "test: Add unit tests for order placement"
```

---

## ✅ Final Checklist Before First Commit

- [ ] `.gitignore` file is present
- [ ] `.env.example` is present (without real secrets)
- [ ] All hardcoded tokens are removed
- [ ] `node_modules/` is excluded
- [ ] `.env` file is excluded
- [ ] Ran `git status` to verify files
- [ ] Searched for secrets: `git diff --cached | grep -i token`
- [ ] Reviewed `SECURITY.md` document
- [ ] Ready to commit!

---

## 🎯 Quick Start Commands

```bash
# Complete setup in one go (after removing tokens!)
git init
git add .
git status
# Review the output carefully!
git commit -m "Initial commit: LiveTrading application"

# Optional: Connect to GitHub
git remote add origin https://github.com/yourusername/LiveTrading.git
git branch -M main
git push -u origin main
```

---

**Status**: ⚠️ **DO NOT INITIALIZE GIT UNTIL TOKENS ARE REMOVED!**

**Next Steps**:
1. Remove hardcoded tokens from `OIMonitor.jsx` and `App.jsx`
2. Verify with `grep -r "eyJ" src/`
3. Then initialize git with `git init`

---

**Last Updated**: January 24, 2026
