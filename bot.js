require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- CONFIGURATION ---
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });
const CHAT_ID = process.env.CHAT_ID;

const CEX_SIGNATURES = ["9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p", "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Bitget"];

async function performEliteForensic(mint) {
    try {
        console.log(`\n🔍 SCANNING: ${mint.substring(0, 10)}...`);

        // 1. Get Dev Wallet
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

        // 2. 🚨 THE FIX: Get True Genesis (Limit 1000) 🚨
        const walletSigs = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        
        const signatures = walletSigs.data.result;
        const genesis = signatures[signatures.length - 1]; // Sabse purani transaction
        const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;
        
        // Agar 1000 txs poori hain, iska matlab wallet bohot active aur purana hai
        const isSuperActive = signatures.length === 1000;

        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));

        // 3. Dev Decision Logic
        if (isCEX || walletAgeMins > 1440 || isSuperActive) {
            console.log(`   ✅ DEV PASSED (${isCEX ? 'CEX' : 'Old/Active Wallet'}) | Age: ${walletAgeMins.toFixed(0)}m`);
            
            // 4. Socials Check
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const fullDump = JSON.stringify(assetRes.data.result).toLowerCase();
            const hasSocials = fullDump.includes("t.me/") || fullDump.includes("twitter.com/") || fullDump.includes("x.com/");

            if (hasSocials) {
                console.log(`   🌟 ELITE PASS - ALERT SENT!`);
                const msg = `🌟 *ELITE TOKEN FOUND*\n\n` +
                            `📍 Mint: \`${mint}\`\n` +
                            `💰 Funding: ${isCEX ? 'CEX ✅' : 'Old/Active Wallet ⏳'}\n` +
                            `🕒 Age: ${walletAgeMins.toFixed(0)} mins\n\n` +
                            `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
                
                bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' }).catch(err => console.log("Telegram Error:", err.message));
            } else {
                console.log(`   ❌ REJECTED: No Socials Found`);
            }
        } else {
            console.log(`   ❌ REJECTED: Internal/New Wallet (${walletAgeMins.toFixed(0)}m)`);
        }
    } catch (e) { 
        console.log(`   ⚠️ Error: ${e.message}`); 
    }
}

// --- LIVE ENGINE ---
console.log("🚀 MOON-TOKEN SNIPER ENGINE LIVE & ONLINE");

setInterval(() => {
    console.log("💓 Bot is active... Heartbeat Check");
}, 60000);

const TEST_MINTS = [
    "BXnUS5vNFNvnjy2hLx6UCycgH5VvMw8HkC9qfae2pump", // Elite
    "NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump"  // Elite
];

// Start
TEST_MINTS.forEach(m => performEliteForensic(m));
