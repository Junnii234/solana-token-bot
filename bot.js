require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- 1. Configuration ---
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });
const CHAT_ID = process.env.CHAT_ID;

const CEX_SIGNATURES = ["9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p", "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX"];

// --- 2. The Elite Forensic Engine ---
async function performEliteForensic(mint) {
    try {
        console.log(`🔍 Scanning: ${mint.substring(0, 8)}...`);

        // Phase 1: Dev Funding
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
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 20 }]
        });
        
        const genesis = walletSigs.data.result[walletSigs.data.result.length - 1];
        const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;
        
        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();
        
        // 🚀 SMART CEX DETECTION
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));

        if (!isCEX && walletAgeMins < 1440) {
            console.log(`❌ REJECTED: Internal/New Wallet (${walletAgeMins.toFixed(0)}m)`);
            return;
        }

        // Phase 2: Socials
        const assetRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const fullDump = JSON.stringify(assetRes.data.result).toLowerCase();
        const hasTG = fullDump.includes("t.me/");
        const hasX = fullDump.includes("twitter.com/") || fullDump.includes("x.com/");

        if (hasTG || hasX) {
            console.log(`🌟 ELITE PASS: Sending Alert!`);
            const message = `🌟 *ELITE TOKEN DETECTED*\n\n` +
                            `📍 *Mint:* \`${mint}\`\n` +
                            `💰 *Funding:* ${isCEX ? "✅ CEX/Bridge" : "⏳ Old Wallet"}\n` +
                            `🕒 *Age:* ${walletAgeMins.toFixed(0)} mins\n\n` +
                            `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
            
            await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
        }

    } catch (e) {
        console.log(`⚠️ Error: ${e.message}`);
    }
}

// --- 3. THE TRIGGER & KEEP-ALIVE ---
const TEST_MINTS = [
    "BXnUS5vNFNvnjy2hLx6UCycgH5VvMw8HkC9qfae2pump",
    "NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump"
];

console.log("🚀 MOON-TOKEN SNIPER ENGINE LIVE");

// Yeh loop har 2 minute baad check karega taake bot online rahe
setInterval(async () => {
    for (const mint of TEST_MINTS) {
        await performEliteForensic(mint);
    }
}, 120000); // 120 seconds interval

// Pehli baar foran chalao
TEST_MINTS.forEach(mint => performEliteForensic(mint));
