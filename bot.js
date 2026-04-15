require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb';
const PUMP_FUN_PROGRAM = '6EF8rrecthR5DkZ8zFm9kAnLXYvshU9S6YecYyF';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

console.log('🚀 REAL-TIME PUMP.FUN DETECTOR STARTING...');

// --- SECURITY CHECKER (RugCheck API) ---
async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 4000 });
        return {
            score: res.data.score || 0,
            risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean'
        };
    } catch (e) {
        return { score: 0, risks: 'New Token - Verify Manually' }; 
    }
}

// --- MAIN WEBSOCKET LISTENER ---
function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana via Helius');
        
        // 1. KEEP-ALIVE: Send a ping every 30 seconds to prevent "Connection Lost"
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 30000);

        // Subscribe to Pump.fun logs
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
                { mentions: [PUMP_FUN_PROGRAM] },
                { commitment: "processed" }
            ]
        }));
    });

    ws.on('message', async (data) => {
        try {
            if (!data || data.toString() === '') return;
            const json = JSON.parse(data.toString());

            // Handle subscription success
            if (json.result && !json.params) {
                console.log(`✅ Subscription Active (ID: ${json.result})`);
                return;
            }

            if (!json.params?.result) return;

            const logs = json.params.result.value.logs;
            const signature = json.params.result.value.signature;

            // Detect new mints
            if (logs.some(log => log.includes("Program log: Instruction: InitializeMint"))) {
                console.log(`✨ New Mint Detected! Sig: ${signature}`);
                // 2 second delay to ensure transaction is indexed before fetching
                setTimeout(() => processTransaction(signature), 2000);
            }
        } catch (e) {
            // Silently skip malformed or non-JSON packets
        }
    });

    ws.on('error', (e) => console.error('❌ WebSocket Error:', e.message));

    ws.on('close', () => {
        console.log('♻️ Connection lost. Reconnecting in 2s...');
        clearInterval(pingInterval); // Stop the old timer
        setTimeout(startListening, 2000);
    });
}

// --- TRANSACTION PROCESSOR ---
async function processTransaction(sig) {
    try {
        const res = await axios.post(`https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`, {
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
        });

        if (!res.data.result) return;

        const keys = res.data.result.transaction.message.accountKeys;
        const mint = keys[1]; // Pump.fun mint address index

        if (alerted.has(mint)) return;
        alerted.add(mint);

        console.log(`🎯 Token Identified: ${mint}`);
        
        const security = await checkRug(mint);
        
        // FILTER: Adjust this score (Lower = Stricter)
        if (security.score < 600) {
            sendTelegramAlert(mint, security);
        } else {
            console.log(`🚫 Skipped: ${mint} (Score: ${security.score})`);
        }

    } catch (e) {
        // Transaction might not be available yet, skip silently
    }
}

// --- TELEGRAM NOTIFIER ---
function sendTelegramAlert(mint, security) {
    const msg = `
🚨 <b>NEW PUMP.FUN TOKEN</b>

<code>${mint}</code>

<b>🛡 SECURITY REPORT:</b>
Score: <b>${security.score}</b>
Risks: <i>${security.risks}</i>

<a href="https://rugcheck.xyz/tokens/${mint}">🔎 RugCheck</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a> | <a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX (Fast)</a>`;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    }).then(() => {
        console.log('✅ Alert sent to Telegram!');
    }).catch((err) => {
        console.error('❌ Telegram Send Error:', err.message);
    });
}

// --- STARTUP ---
console.log("Testing Telegram Connection...");
bot.sendMessage(CHAT_ID, "🚀 <b>Bot is now ONLINE and Scanning!</b>\nTesting connection...", { parse_mode: 'HTML' })
   .then(() => console.log("✅ Test Message Sent!"))
   .catch((err) => console.log("❌ Test Failed. Check CHAT_ID. Error:", err.message));

startListening();
