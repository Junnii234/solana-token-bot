require('dotenv').config();
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');

// ================= CONFIG =================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// 🎯 Optional: specific token (leave null for all)
//const TARGET_MINT = ""; 

// 🔥 Raydium AMM Program (migration happens here)
const RAYDIUM_PROGRAM = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Prevent duplicates
const seenTxs = new Set();

// Logging
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);

// ================= TELEGRAM =================
async function sendAlert(mint, signature) {
    try {
        const message = `🚀 *PUMP.FUN MIGRATION DETECTED*

🪙 Mint: \`${mint}\`
🔗 TX: https://solscan.io/tx/${signature}

📊 DexScreener:
https://dexscreener.com/solana/${mint}

⚡ Status: LIVE ON RAYDIUM`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
            parse_mode: "Markdown",
            disable_web_page_preview: true
        });

        log("📤 Alert sent!");
    } catch (e) {
        error(`Telegram error: ${e.message}`);
    }
}

// ================= MIGRATION DETECTOR =================
function startSniper() {
    const ws = new WebSocket("wss://api.mainnet-beta.solana.com");

    let reconnectAttempts = 0;

    ws.on('open', () => {
        log("🚀 Connected to Solana RPC");
        reconnectAttempts = 0;

        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
                { mentions: [RAYDIUM_PROGRAM] },
                { commitment: "confirmed" }
            ]
        }));

        log("👀 Listening for Raydium pool creations...");
    });

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data.toString());

            if (!msg.params) return;

            const value = msg.params.result.value;
            const logs = value.logs || [];
            const signature = value.signature;

            if (seenTxs.has(signature)) return;
            seenTxs.add(signature);

            // 🔥 Detect migration event
            const isMigration = logs.some(log =>
                log.toLowerCase().includes("initialize") ||
                log.toLowerCase().includes("initialize2") ||
                log.toLowerCase().includes("create_pool")
            );

            if (!isMigration) return;

            const fullLog = logs.join(" ");

            // 🎯 Extract mint (basic detection)
            let detectedMint = null;

            if (TARGET_MINT) {
                if (!fullLog.includes(TARGET_MINT)) return;
                detectedMint = TARGET_MINT;
            } else {
                // Try extract mint (rough method)
                const match = fullLog.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
                if (match) detectedMint = match[0];
            }

            if (!detectedMint) return;

            log(`\n🎓 MIGRATION DETECTED!`);
            log(`🪙 Mint: ${detectedMint}`);
            log(`🔗 TX: ${signature}`);

            await sendAlert(detectedMint, signature);

        } catch (e) {
            // silent ignore minor parsing errors
        }
    });

    ws.on('error', (err) => {
        error(`WebSocket error: ${err.message}`);
    });

    ws.on('close', () => {
        log("⚠️ Disconnected. Reconnecting...");

        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000);

        setTimeout(startSniper, delay);
    });
}

// ================= START =================
function startup() {
    console.clear();

    console.log(`
╔══════════════════════════════════════╗
║   🚀 MIGRATION SNIPER v1.0           ║
║   Pump.fun → Raydium Detector       ║
║   ⚡ Ultra Fast (Sub-second)         ║
╚══════════════════════════════════════╝
    `);

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        error("Missing TELEGRAM credentials in .env");
        process.exit(1);
    }

    log("✅ System Ready");
    startSniper();
}

startup();
