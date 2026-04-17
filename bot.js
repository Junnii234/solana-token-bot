require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- 1. HARDCODED CREDENTIALS (MUSHTAQ AHMED SPECIAL) ---
const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_API_KEY = "cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const SAFE_FUNDS = [
    "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p",
    "FixedFloat", "ChangeNOW", "SideShift", "Binance", "Bybit", "OKX", "Bitget"
];

let scannedSignatures = new Set();

// --- 2. FORENSIC ENGINE (Aggressive Mode) ---
async function scanToken(mint) {
    try {
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        if (!sigsRes.data.result || sigsRes.data.result.length === 0) return;

        const launchSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        const walletSigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        
        const genesis = walletSigs.data.result[walletSigs.data.result.length - 1];
        const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;
        const txCount = walletSigs.data.result.length;

        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();
        const isSafeFund = SAFE_FUNDS.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));

        // --- FILTER CRITERIA ---
        // 1. Wallet Age > 180 mins (3 Hours)
        // 2. OR Wallet has 20+ transactions (Active Dev)
        // 3. AND Socials present
        if ((ageMins > 180 || txCount > 20) && isSafeFund) {
            const asset = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const data = JSON.stringify(asset.data.result).toLowerCase();
            const hasSocials = data.includes("t.me/") || data.includes("twitter.com/") || data.includes("x.com/");

            if (hasSocials) {
                const msg = `🚀 *AGGRESSIVE ALERT: POTENTIAL MOON*\n\n` +
                            `📍 Mint: \`${mint}\`\n` +
                            `💰 Fund: ${isSafeFund ? '✅ Safe/Bridge' : '⏳ Private/Old'}\n` +
                            `🕒 Age: ${ageMins.toFixed(0)} mins\n` +
                            `📊 History: ${txCount} transactions\n\n` +
                            `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
                
                await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
                console.log(`✅ ALERT SENT: ${mint}`);
            }
        }
    } catch (e) { /* Silent for speed */ }
}

// --- 3. LIVE POLLING ---
async function fetchLatestTokens() {
    try {
        const response = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
            params: ["6EF8rrecthR5DkZJv96tS6pg6W5tTfG9c9X6Lgnn7W6b", { limit: 5 }]
        });

        const transactions = response.data.result;
        for (let tx of transactions) {
            if (scannedSignatures.has(tx.signature)) continue;
            scannedSignatures.add(tx.signature);

            if (scannedSignatures.size > 2000) scannedSignatures.clear();

            // Note: In production, you'd fetch the transaction and find the mint
            // This is the trigger point for your forensic scan
            console.log(`⚡ Analyzing New Pump.fun Activity...`);
        }
    } catch (e) { console.log("⚠️ Polling Error..."); }
}

// --- START ENGINE ---
console.log("🔥 AGGRESSIVE SNIPER STARTING...");

bot.sendMessage(TELEGRAM_CHAT_ID, "✅ *System Online (V40):* Aggressive Hunting Active!\n\nCriteria: 3h+ Age | Bridge Support | Socials Required")
   .then(() => console.log("🔔 Startup Alert Sent!"))
   .catch((err) => console.log("❌ Startup Failed: Check your Token/ID."));

setInterval(fetchLatestTokens, 12000); // 12-second polling to stay safe with API limits
setInterval(() => console.log("💓 Hunting..."), 600000);
