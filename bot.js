require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_API_KEY = "cad2ea55-0ae1-4005-8b8a-3b04167a57fb";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let scannedMints = new Set();

const SAFE_FUNDS = ["9Wz2n", "66pPj", "5VC9e", "FixedFloat", "ChangeNOW", "SideShift", "Binance", "Bybit", "OKX"];

// --- 1. CORE DETECTION (RE-BUILT) ---
async function findNewTokens() {
    try {
        // Direct Method: Pump.fun Program ki accounts list se naye mints uthana
        const response = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
            params: [
                "6EF8rrecthR5DkZJv96tS6pg6W5tTfG9c9X6Lgnn7W6b",
                {
                    filters: [{ dataSize: 217 }], // Pump.fun Mint account size
                    encoding: "base64"
                }
            ]
        });

        const accounts = response.data.result;
        if (!accounts) return;

        // Sirf aakhri 5 naye accounts check karein speed ke liye
        const latest = accounts.slice(-5); 

        for (let acc of latest) {
            const mint = acc.pubkey;
            if (!scannedMints.has(mint)) {
                console.log(`\n🎯 NEW TOKEN DETECTED: ${mint.substring(0,10)}...`);
                scannedMints.add(mint);
                performForensic(mint);
            }
        }
        if (scannedMints.size > 2000) scannedMints.clear();
    } catch (e) {
        process.stdout.write("!"); // API Limit/Error indicator
    }
}

// --- 2. FORENSIC ENGINE ---
async function performForensic(mint) {
    try {
        // Helius Asset API se metadata aur socials check karein
        const assetRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: "my-id", method: "getAsset",
            params: { id: mint }
        });

        const data = assetRes.data.result;
        const info = JSON.stringify(data).toLowerCase();
        const hasSocials = info.includes("t.me/") || info.includes("x.com/") || info.includes("twitter.com/");

        // Dev Check
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });

        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        const devHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 100 }]
        });

        const txCount = devHistory.data.result.length;
        const genesis = devHistory.data.result[devHistory.data.result.length - 1];
        const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        console.log(`   📊 Stats: Age: ${ageMins.toFixed(0)}m | Txs: ${txCount} | Socials: ${hasSocials ? '✅' : '❌'}`);

        // AGGRESSIVE CRITERIA: 3h+ Age YA 20+ Txs AND Socials
        if ((ageMins > 180 || txCount > 20) && hasSocials) {
            const msg = `🚀 *ELITE ALERT: PUMP.FUN MOON*\n\n` +
                        `📍 Mint: \`${mint}\`\n` +
                        `🕒 Dev Age: ${ageMins.toFixed(0)} mins\n` +
                        `📊 Dev History: ${txCount} txs\n\n` +
                        `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
            
            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            console.log(`🌟 ALERT SENT!`);
        }
    } catch (e) { console.log("   ⚠️ Scan Error"); }
}

// --- START ---
console.log("🔥 SNIPER V43 STARTING (DEEP STREAM MODE)...");
bot.sendMessage(TELEGRAM_CHAT_ID, "✅ *System Online (V43):* Deep Stream Hunting Active!");

// Har 5 second baad check (Pump.fun ki speed ke liye)
setInterval(findNewTokens, 5000);
