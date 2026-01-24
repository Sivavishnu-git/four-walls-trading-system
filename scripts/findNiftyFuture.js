// Script to find current month Nifty Future instrument key
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findNiftyFutures = () => {
    try {
        // Read NSE.json
        const nseDataPath = path.join(__dirname, '../docs/NSE.json');
        const nseData = JSON.parse(fs.readFileSync(nseDataPath, 'utf8'));

        console.log('📊 Searching for Nifty Futures...\n');

        // Filter Nifty Futures
        const niftyFutures = nseData.filter(inst =>
            inst.segment === 'NSE_FO' &&
            inst.name === 'NIFTY' &&
            inst.instrument_type === 'FUT'
        );

        if (niftyFutures.length === 0) {
            console.log('❌ No Nifty Futures found in NSE.json');
            return;
        }

        // Sort by expiry date
        niftyFutures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

        console.log(`✅ Found ${niftyFutures.length} Nifty Futures\n`);
        console.log('═'.repeat(80));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        niftyFutures.forEach((future, index) => {
            const expiryDate = new Date(future.expiry);
            const isExpired = expiryDate < today;
            const isCurrent = !isExpired && index === niftyFutures.findIndex(f => new Date(f.expiry) >= today);

            console.log(`\n${isCurrent ? '🎯 CURRENT MONTH' : isExpired ? '❌ EXPIRED' : '📅 FUTURE'}`);
            console.log(`Instrument Key: ${future.instrument_key}`);
            console.log(`Name: ${future.name}`);
            console.log(`Expiry: ${future.expiry}`);
            console.log(`Exchange Token: ${future.exchange_token}`);
            console.log(`Lot Size: ${future.lot_size}`);
            console.log(`Tick Size: ${future.tick_size}`);

            if (isCurrent) {
                console.log('\n💡 Use this instrument key in your OIMonitor.jsx:');
                console.log(`   const instrumentKey = "${future.instrument_key}";`);
            }

            console.log('─'.repeat(80));
        });

        // Find current month future
        const currentFuture = niftyFutures.find(f => new Date(f.expiry) >= today);

        if (currentFuture) {
            console.log('\n\n📋 QUICK COPY (Current Month Future):');
            console.log('═'.repeat(80));
            console.log(`Instrument Key: ${currentFuture.instrument_key}`);
            console.log(`Expiry Date: ${currentFuture.expiry}`);
            console.log(`Lot Size: ${currentFuture.lot_size}`);
            console.log('═'.repeat(80));
        }

    } catch (error) {
        console.error('❌ Error reading NSE.json:', error.message);
        console.log('\n💡 Make sure docs/NSE.json exists in your project');
    }
};

// Run the script
findNiftyFutures();
