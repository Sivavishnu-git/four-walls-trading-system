# 🔐 Security Best Practices

## ⚠️ CRITICAL: Protecting Your API Credentials

Your Upstox API credentials and access tokens are **extremely sensitive**. Unauthorized access could result in:
- Unauthorized trades on your account
- Loss of funds
- Account compromise

## ✅ What's Protected by .gitignore

The `.gitignore` file has been configured to **automatically exclude**:

### 1. Environment Files
- `.env`
- `.env.local`
- `.env.development`
- `.env.production`
- Any file containing `*access_token*`
- Any file containing `*api_key*` or `*api_secret*`

### 2. Sensitive Directories
- `secrets/`
- `credentials/`
- `config/secrets.json`

### 3. Log Files
- All `*.log` files
- `trading_logs/`
- `order_history/`

## 🛡️ Security Checklist

### Before Committing to Git:

- [ ] **NEVER** hardcode tokens in source files
- [ ] **NEVER** commit `.env` files
- [ ] **ALWAYS** use `.env.example` for documentation
- [ ] **ALWAYS** review files before `git add`
- [ ] **VERIFY** no tokens in commit history

### Current Code Review:

⚠️ **FOUND**: Hardcoded token in `OIMonitor.jsx` line 6:
```javascript
const [token, setToken] = useState("eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ...");
```

⚠️ **FOUND**: Hardcoded token in `App.jsx` line 84:
```javascript
<OrderPlacementDemo token="eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ..." />
```

### ⚡ ACTION REQUIRED:

**These tokens should be removed before committing to git!**

## 🔧 Recommended Implementation

### Option 1: Use Environment Variables (Recommended)

1. **Create `.env` file** (already in .gitignore):
```bash
VITE_UPSTOX_ACCESS_TOKEN=your_actual_token_here
```

2. **Update `OIMonitor.jsx`**:
```javascript
const [token, setToken] = useState(import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "");
```

3. **Update `App.jsx`**:
```javascript
<OrderPlacementDemo token={import.meta.env.VITE_UPSTOX_ACCESS_TOKEN} />
```

### Option 2: User Input (Current Approach)

Keep the token input field and let users enter their token manually:
```javascript
const [token, setToken] = useState(""); // Empty by default
```

### Option 3: Secure Token Storage

Use browser's secure storage:
```javascript
// Store token securely
localStorage.setItem('upstox_token', encryptedToken);

// Retrieve token
const token = localStorage.getItem('upstox_token');
```

## 📋 Pre-Commit Checklist

Before running `git commit`, verify:

```bash
# 1. Check for hardcoded secrets
git diff | grep -i "token\|api_key\|secret"

# 2. Verify .gitignore is working
git status

# 3. Check what will be committed
git diff --cached
```

## 🚨 If You Accidentally Committed a Token

### Immediate Actions:

1. **Revoke the token immediately** on Upstox developer portal
2. **Generate a new token**
3. **Remove from git history**:
```bash
# Remove file from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/file" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (if already pushed to remote)
git push origin --force --all
```

4. **Update `.gitignore`** to prevent future commits
5. **Notify your team** if this is a shared repository

## 🔒 Additional Security Measures

### 1. Token Rotation
- Rotate tokens regularly (weekly/monthly)
- Never reuse old tokens
- Set token expiration dates

### 2. IP Whitelisting
- Configure IP restrictions on Upstox developer portal
- Only allow access from known IPs

### 3. Rate Limiting
- Implement request rate limiting
- Monitor for unusual API activity

### 4. Audit Logging
- Log all API requests
- Monitor for unauthorized access attempts
- Review logs regularly

### 5. Two-Factor Authentication
- Enable 2FA on your Upstox account
- Use strong, unique passwords

## 📚 Resources

- [Upstox Security Guidelines](https://upstox.com/developer/security)
- [Git Secrets Tool](https://github.com/awslabs/git-secrets)
- [Environment Variables Best Practices](https://12factor.net/config)

## ⚠️ Current Status

**Files with Hardcoded Tokens:**
1. `src/components/OIMonitor.jsx` - Line 6
2. `src/App.jsx` - Line 84

**Recommendation**: Remove these tokens before committing to git!

---

**Last Updated**: January 24, 2026
**Status**: ⚠️ Action Required - Remove hardcoded tokens
