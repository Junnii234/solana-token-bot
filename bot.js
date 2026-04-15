require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_KEY = 'cad2ea55-0ae1-4005-8b8a-3b04167a57fb';
const HELIUS_WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

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

function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana (Enhanced Mode)');
        
        // Keep-Alive
        pingInterval = setInterval(() => { 
            if (ws.readyState === WebSocket.OPEN) ws.ping(); 
        }, 30000);

        // Subscription for Pump.fun transactions
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

            // Case-sensitive check for the instructions you found on Solscan
            const isLaunch = logs.some(l => 
                l.includes("Instruction: create") || 
                l.includes("Instruction: create_v2") ||
                l.includes("Instruction: InitializeMint")
            );

            if (isLaunch) {
                // Extracting Mint: In Pump.fun 'create' txs, the Mint is index 1 of accountKeys
                const mint = tx.transaction.message.accountKeys[1].pubkey;

                if (mint && !alerted.has(mint)) {
                    alerted.add(mint);
                    console.log(`🚀 LAUNCH DETECTED: ${mint}`);
                    
                    const security = await checkRug(mint);
                    sendTelegramAlert(mint, security);
                }
            } else {
                // Heartbeat indicator in logs
                process.stdout.write("."); 
            }
        } catch (e) {
            // Ignore non-transactional packets
        }
    });

    ws.on('close', () => {
        console.log('♻️ Connection lost. Reconnecting...');
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });

    ws.on('error', (err) => console.error('❌ WebSocket Error:', err.message));
}

function sendTelegramAlert(mint, security) {
    const msg = `🚨 <b>NEW PUMP.FUN MINT</b>\n\n<code>${mint}</code>\n\n🛡 <b>Score: ${security.score}</b>\n\n<a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a>`;
    
    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    }).then(() => console.log("✅ Alert Sent!"))
      .catch(e => console.error("❌ Telegram Fail:", e.message));
}

// Initial Startup
bot.sendMessage(CHAT_ID, "🚀 <b>Enhanced Bot Online.</b> Case-sensitive 'create' filters active.");
startListening();
