require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_KEY = 'cad2ea55-0ae1-4005-8b8a-3b04167a57fb'; 
const HELIUS_WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

// --- SECURITY CHECKER ---
async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 2500 });
        return { 
            score: res.data.score || 0, 
            risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean' 
        };
    } catch (e) { 
        return { score: 0, risks: 'New - Verify Manually' }; 
    }
}

// --- MAIN WEBSOCKET LISTENER ---
function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana (Enhanced Enhanced Mode)');
        
        // Keep-Alive Ping
        pingInterval = setInterval(() => { 
            if (ws.readyState === WebSocket.OPEN) ws.ping(); 
        }, 30000);

        // Subscribing to Pump.fun via High-Performance transactionSubscribe
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "transactionSubscribe",
            params: [
                { "accountInclude": ["6EF8rrecthR5DkZ8zFm9kAnLXYvshU9S6YecYyF"] },
                { 
                    "commitment": "processed", 
                    "encoding": "jsonParsed", 
                    "transactionDetails": "full", 
                    "maxSupportedTransactionVersion": 0 
                }
            ]
        }));
    });

    ws.on('message', async (data) => {
        try {
            const json = JSON.parse(data.toString());
            if (!json.params?.result) return;
            
            const tx = json.params.result.transaction;
            const logs = tx.meta.logMessages || [];

            // 1. DETECTION LOGIC (Using your lowercase research)
            const hasLaunch = logs.some(l => 
                l.includes("Instruction: create") || 
                l.includes("Instruction: create_v2")
            );

            // 2. INTENT LOGIC (Checking if Dev bought in same TX)
            const hasInitialBuy = logs.some(l => l.includes("Instruction: buy"));

            if (hasLaunch) {
                // In Pump.fun creation, the Mint is always Account Index 1
                const mint = tx.transaction.message.accountKeys[1].pubkey;

                if (mint && !alerted.has(mint)) {
                    alerted.add(mint);
                    
                    const logPrefix = hasInitialBuy ? "🔥 [DEV BOUGHT]" : "🆕 [FAIR]";
                    console.log(`${logPrefix} Detected: ${mint}`);
                    
                    const security = await checkRug(mint);
                    sendTelegramAlert(mint, security, hasInitialBuy);
                }
            } else {
                // Print a dot for every Pump.fun trade handled (shows bot is alive)
                process.stdout.write("."); 
            }
        } catch (e) {
            // Skip non-tx packets
        }
    });

    ws.on('close', () => {
        console.log('♻️ Connection lost. Reconnecting...');
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });

    ws.on('error', (err) => console.error('❌ WebSocket Error:', err.message));
}

// --- TELEGRAM NOTIFIER ---
function sendTelegramAlert(mint, security, isHighIntent) {
    const title = isHighIntent ? "🔥 <b>DEV BOUGHT ON LAUNCH</b> 🔥" : "🚨 <b>NEW PUMP.FUN MINT</b>";
    const intentBadge = isHighIntent ? "✅ <b>Developer Entry Detected</b>" : "⚪ Standard Launch";

    const msg = `${title}

<code>${mint}</code>

🛡 <b>RugScore: ${security.score}</b>
📊 <b>Status:</b> ${intentBadge}

<a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX (Fast Buy)</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a>`;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    }).then(() => console.log("✅ Alert Sent!"))
      .catch(e => console.error("❌ Telegram Fail:", e.message));
}

// --- STARTUP ---
bot.sendMessage(CHAT_ID, "🚀 <b>Bot Online & Optimized.</b>\nMonitoring for 'create' and 'create_v2' instructions.");
startListening();
