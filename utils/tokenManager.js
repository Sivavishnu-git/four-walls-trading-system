import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');

/** Prefer .env.local when present (local-only Upstox app), else .env */
function resolveEnvPath() {
    const localPath = path.join(projectRoot, '.env.local');
    const basePath = path.join(projectRoot, '.env');
    if (fs.existsSync(localPath)) return localPath;
    return basePath;
}

/**
 * Updates the env file with a new access token (writes to .env.local if it exists)
 * @param {string} newToken - The new access token to save
 */
export function updateEnvToken(newToken) {
    try {
        const envPath = resolveEnvPath();

        // Read current env file (create empty if missing)
        let envContent = '';
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch {
            envContent = '';
        }

        // Update both token variables
        const tokenRegex = /^(UPSTOX_ACCESS_TOKEN|VITE_UPSTOX_ACCESS_TOKEN)=.*$/gm;

        // Check if tokens exist
        if (envContent.match(/UPSTOX_ACCESS_TOKEN=/)) {
            envContent = envContent.replace(/^UPSTOX_ACCESS_TOKEN=.*$/m, `UPSTOX_ACCESS_TOKEN=${newToken}`);
        } else {
            envContent += `\nUPSTOX_ACCESS_TOKEN=${newToken}`;
        }

        if (envContent.match(/VITE_UPSTOX_ACCESS_TOKEN=/)) {
            envContent = envContent.replace(/^VITE_UPSTOX_ACCESS_TOKEN=.*$/m, `VITE_UPSTOX_ACCESS_TOKEN=${newToken}`);
        } else {
            envContent += `\nVITE_UPSTOX_ACCESS_TOKEN=${newToken}`;
        }

        // Write back to .env file
        fs.writeFileSync(envPath, envContent, 'utf8');

        console.log('✅ Access token updated in .env file');
        console.log('⚠️  Please restart the frontend to use the new token');

        return true;
    } catch (error) {
        console.error('❌ Error updating .env file:', error.message);
        return false;
    }
}

/**
 * Reads the current access token from .env
 */
export function getCurrentToken() {
    try {
        const envPath = resolveEnvPath();
        const envContent = fs.readFileSync(envPath, 'utf8');

        const match = envContent.match(/^UPSTOX_ACCESS_TOKEN=(.*)$/m);
        return match ? match[1].trim() : null;
    } catch (error) {
        console.error('❌ Error reading token from .env:', error.message);
        return null;
    }
}

export default { updateEnvToken, getCurrentToken };
