require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- 1. CONFIGURATION (Variables) ---
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const HELIUS_KEY = process.env.HELIUS_API_KEY;

// Bot initialize tabhi hoga jab token milega
const bot = new TelegramBot(TOKEN, { polling: false });

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const CEX_SIGNATURES = ["9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p", "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Bitget"];

// --- 2. STARTUP TEST (Foran pata chalay ga bot online hai ya nahi) ---
console.log("🚀 BOT STARTING UP...");
bot.sendMessage(CHAT_ID, "✅ *Mushtaq Ahmed Bhai, Bot Online Ho Gaya Hai!* Scanning Started...", { parse_mode: 'Markdown' })
   .then(() => console.log("🔔 Startup Alert Sent!"))
   .catch((err) => console.log("❌ Startup Alert Failed (Check Token/ID):", err.message));

// --- 3. THE FORENSIC ENGINE ---
async function performEliteForensic(mint) {
    try {
        console.log(`\n🔍 SCANNING: ${mint.substring(0, 10)}...`);

        // Get Genesis Trace (Limit 1000 for True Origin)
        const sigsRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        if (!sigsRes.data.result || sigsRes.data.result.length === 0) return;

        const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        const txDetails = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

        const walletSigs = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        
        const signatures = walletSigs.data.result;
        const genesis = signatures[signatures.length - 1];
        const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;
        const isSuperActive = signatures.length === 1000;

        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));

        // --- THE DECISION ---
        if (isCEX || walletAgeMins > 1440 || isSuperActive) {
            console.log(`   ✅ DEV PASSED | Age: ${walletAgeMins.toFixed(0)}m`);
            
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const fullDump = JSON.stringify(assetRes.data.result).toLowerCase();
            const hasSocials = fullDump.includes("t.me/") || fullDump.includes("twitter.com/") || fullDump.includes("x.com/");

            if (hasSocials) {
                console.log(`   🌟 ELITE PASS - PREPARING ALERT`);

                // ==========================================
                // 🔔 ALERT SECTION (ASLI KAAM YAHAN HAI) 🔔
                // ==========================================
                const alertMessage = `🌟 *ELITE TOKEN DETECTED*\n\n` +
                                     `📍 *Mint:* \`${mint}\`\n` +
                                     `💰 *Funding:* ${isCEX ? '✅ CEX/Bridge' : '⏳ Old Wallet'}\n` +
                                     `🕒 *Age:* ${walletAgeMins.toFixed(0)} mins\n\n` +
                                     `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

                await bot.sendMessage(CHAT_ID, alertMessage, { parse_mode: 'Markdown' })
                    .then(() => console.log("🚀 ALERT SENT SUCCESSFULLY!"))
                    .catch((err) => console.log("❌ ALERT FAILED TO SEND:", err.message));
                // ==========================================

            } else {
                console.log(`   ❌ REJECTED: No Socials`);
            }
        } else {
            console.log(`   ❌ REJECTED: Risky/New Dev (${walletAgeMins.toFixed(0)}m)`);
        }
    } catch (e) { 
        console.log(`   ⚠️ Forensic Error: ${e.message}`); 
    }
}

// Keep-Alive Loop
setInterval(() => console.log("💓 Bot is active..."), 60000);

const TEST_MINTS = ["BXnUS5vNFNvnjy2hLx6UCycgH5VvMw8HkC9qfae2pump", "NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump"];
TEST_MINTS.forEach(m => performEliteForensic(m));
