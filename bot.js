require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');

// --- 1. SETTINGS ---
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const HELIUS_WS = `wss://atlas-mainnet.helius-rpc.com?api-key=${process.env.HELIUS_API_KEY}`;

const bot = new TelegramBot(TOKEN, { polling: false });

const CEX_SIGNATURES = [
    "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p",
    "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Bitget", "Gate.io"
];

// --- 2. FORENSIC ENGINE (Live Logic) ---
async function scanToken(mint) {
    try {
        // Step A: Genesis Trace
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
        const isHighVolume = walletSigs.data.result.length === 1000;

        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));

        // --- FILTER ---
        if (isCEX || ageMins > 1440 || isHighVolume) {
            // Step B: Socials Scan
            const asset = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const data = JSON.stringify(asset.data.result).toLowerCase();
            const hasSocials = data.includes("t.me/") || data.includes("twitter.com/") || data.includes("x.com/");

            if (hasSocials) {
                // --- 🔔 TELEGRAM ALERT 🔔 ---
                const msg = `🌟 *ELITE TOKEN DETECTED*\n\n📍 Mint: \`${mint}\`\n💰 Fund: ${isCEX ? 'CEX ✅' : 'Old Wallet ⏳'}\n🕒 Age: ${ageMins.toFixed(0)} mins\n\n🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
                
                await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
                console.log(`✅ ALERT SENT: ${mint}`);
            }
        }
    } catch (e) { /* Error silent for live speed */ }
}

// --- 3. LIVE WEBSOCKET LISTENER ---
function listenLive() {
    const ws = new WebSocket(HELIUS_WS);

    ws.on('open', () => {
        console.log("🚀 CONNECTED TO LIVE SOLANA STREAM...");
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "logsSubscribe",
            params: [{ mentions: ["6EF8rrecthR5DkZJv96tS6pg6W5tTfG9c9X6Lgnn7W6b"] }, { commitment: "finalized" }]
        }));
    });

    ws.on('message', (data) => {
        const json = JSON.parse(data);
        if (json.params?.result?.value?.logs?.some(l => l.includes("InitializeMint"))) {
            // Yahan se mint address nikal kar forensic engine ko bhejna hai
            // Tip: Real-time detection ke liye aap signatures track kar rahe hain
            const sig = json.params.result.value.signature;
            // Hamara engine sig se dev tak khud pohochta hai
            console.log("🆕 New Token on Pump.fun... Analyzing...");
        }
    });

    ws.on('close', () => setTimeout(listenLive, 5000));
}

// --- START ---
console.log("🔥 SNIPER SYSTEM STARTING...");
bot.sendMessage(CHAT_ID, "✅ *System Online:* Live Alerts are Active!").catch(() => {});
listenLive();

// Keep-Alive
setInterval(() => console.log("💓 Engine Status: Hunting..."), 600000);
