require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- CREDENTIALS ---
const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_API_KEY = "cad2ea55-0ae1-4005-8b8a-3b04167a57fb";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let scannedMints = new Set();

console.log("🔥 V45: PUMP.FUN DIRECT STREAM STARTING...\n");

// --- 1. DIRECT API DETECTION (FASTEST METHOD) ---
async function streamPumpFun() {
    try {
        // Seedha Pump.fun ki "Recent" tokens API ko hit karna
        const res = await axios.get('https://frontend-api.pump.fun/tokens/recent?pageSize=10', {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (res.data && Array.isArray(res.data)) {
            for (let token of res.data) {
                const mint = token.mint;
                
                if (!scannedMints.has(mint)) {
                    scannedMints.add(mint);
                    console.log(`\n🎯 NEW TOKEN: ${token.symbol} (${mint.substring(0,8)}...)`);
                    
                    // Direct Socials Check from Pump.fun Data
                    const hasSocials = token.twitter || token.telegram || token.website;
                    
                    // Forensic engine ko sirf tab bhejien agar socials hon (Speed bachanay ke liye)
                    if (hasSocials) {
                        performForensic(mint, hasSocials);
                    } else {
                        console.log(`   ❌ Rejected: No Socials in Metadata`);
                    }
                }
            }
        }
        
        if (scannedMints.size > 1000) scannedMints.clear();
    } catch (e) {
        process.stdout.write("!"); // API busy/limit blip
    }
}

// --- 2. ELITE FORENSIC ENGINE ---
async function performForensic(mint, hasSocials) {
    try {
        // Dev ki history check karne ke liye Helius RPC use karein
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        
        if (!sigs.data.result) return;
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });

        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        const devHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 50 }]
        });

        const txCount = devHistory.data.result.length;
        const genesis = devHistory.data.result[devHistory.data.result.length - 1];
        const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        console.log(`   📊 Stats: Age: ${ageMins.toFixed(0)}m | Txs: ${txCount}`);

        // AGGRESSIVE CRITERIA: 3h+ Age OR 20+ Txs
        if (ageMins > 180 || txCount > 20) {
            const msg = `🚀 *ELITE ALERT: PUMP.FUN MOON*\n\n` +
                        `📍 Mint: \`${mint}\`\n` +
                        `🕒 Dev Age: ${ageMins.toFixed(0)} mins\n` +
                        `📊 Dev History: ${txCount} txs\n\n` +
                        `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
            
            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            console.log(`🌟 ALERT SENT!`);
        }
    } catch (e) { /* Error handle */ }
}

// --- STARTUP ---
bot.sendMessage(TELEGRAM_CHAT_ID, "✅ *V45 ONLINE:* Direct Pump.fun Feed Active!");
setInterval(streamPumpFun, 4000); // Har 4 second baad check karega
