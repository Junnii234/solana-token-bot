require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_KEY = 'cad2ea55-0ae1-4005-8b8a-3b04167a57fb'; // Hardcoded for stability
const HELIUS_WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const PUMP_FUN_PROGRAM = '6EF8rrecthR5DkZ8zFm9kAnLXYvshU9S6YecYyF';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

console.log('🚀 REAL-TIME PUMP.FUN DETECTOR STARTING...');

// --- SECURITY CHECKER ---
async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 4000 });
        return {
            score: res.data.score || 0,
            risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean/New'
        };
    } catch (e) {
        return { score: 0, risks: 'Awaiting Analysis...' }; 
    }
}

// --- MAIN LISTENER ---
function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana via Helius');
        
        // Keep-Alive
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 30000);

        // Subscribe
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "logsSubscribe",
            params: [{ mentions: [PUMP_FUN_PROGRAM] }, { commitment: "processed" }]
        }));
    });

    ws.on('message', async (data) => {
        try {
            if (!data || data.toString() === '') return;
            const json = JSON.parse(data.toString());

            // --- DEBUG LOGS ---
            if (json.result && !json.params) {
                console.log(`✅ SUBSCRIPTION CONFIRMED: ID ${json.result}`);
                return;
            }

            if (!json.params?.result) return;

            const logs = json.params.result.value.logs;
            const signature = json.params.result.value.signature;

            // Expanded filter to catch all launch types
            const isNewToken = logs.some(log => 
                log.includes("Instruction: InitializeMint") || 
                log.includes("Instruction: Create")
            );

            if (isNewToken) {
                console.log(`✨ DETECTED: New Token Launch! Sig: ${signature.slice(0, 8)}...`);
                setTimeout(() => processTransaction(signature), 2000);
            } else {
                // This shows you that the bot IS working, but seeing trades, not mints
                process.stdout.write("."); // Prints a dot to keep logs clean but active
            }
        } catch (e) {
            // Heartbeat packets
        }
    });

    ws.on('error', (e) => console.error('❌ WS Error:', e.message));

    ws.on('close', () => {
        console.log('♻️ Reconnecting...');
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });
}

// --- TRANSACTION PROCESSOR ---
async function processTransaction(sig) {
    try {
        const res = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
        });

        if (!res.data.result) return;

        const keys = res.data.result.transaction.message.accountKeys;
        const mint = keys[1]; 

        if (alerted.has(mint)) return;
        alerted.add(mint);

        console.log(`\n🎯 TARGET FOUND: ${mint}`);
        
        const security = await checkRug(mint);
        
        // Lowered score to 600 for broader detection
        if (security.score < 600) {
            sendTelegramAlert(mint, security);
        } else {
            console.log(`🚫 SKIPPED: High Risk (${security.score})`);
        }
    } catch (e) {
        console.log('❌ Extraction Failed (Too early)');
    }
}

// --- TELEGRAM NOTIFIER ---
function sendTelegramAlert(mint, security) {
    const msg = `
🚨 <b>NEW PUMP.FUN TOKEN</b>
<code>${mint}</code>

<b>🛡 SECURITY:</b>
Score: <b>${security.score}</b>
Risks: <i>${security.risks}</i>

<a href="https://rugcheck.xyz/tokens/${mint}">🔎 RugCheck</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a> | <a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX</a>`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true })
       .then(() => console.log('✅ TELEGRAM NOTIFIED'))
       .catch((err) => console.error('❌ Telegram Error:', err.message));
}

// --- STARTUP TEST ---
bot.sendMessage(CHAT_ID, "🚀 <b>Bot Online.</b> Monitoring Solana Blockchain...")
   .then(() => console.log("✅ Startup Message Sent!"))
   .catch((err) => console.log("❌ Connection Error. Check Chat ID."));

startListening();
