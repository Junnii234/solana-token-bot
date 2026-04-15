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
        return { score: res.data.score || 0, risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean' };
    } catch (e) { return { score: 0, risks: 'New - Verify Manually' }; }
}

function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana (Enhanced Mode)');
        pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 30000);

        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "transactionSubscribe",
            params: [
                { "accountInclude": ["6EF8rrecthR5DkZ8zFm9kAnLXYvshU9S6YecYyF"] },
                { "commitment": "processed", "encoding": "jsonParsed", "transactionDetails": "full", "maxSupportedTransactionVersion": 0 }
            ]
        }));
    });

    ws.on('message', async (data) => {
        try {
            const json = JSON.parse(data.toString());
            if (!json.params?.result) return;
            
            const tx = json.params.result.transaction;
            const logs = tx.meta.logMessages || [];

            // Detect Pump.fun "Create" instruction
            if (logs.some(l => l.includes("Instruction: Create"))) {
                // Broad search for the Mint: It's usually a new account with 0 lamports or specific state
                // In Pump.fun Create, the Mint is consistently at index 1 in the accountKeys
                const mint = tx.transaction.message.accountKeys[1].pubkey;

                if (mint && !alerted.has(mint)) {
                    alerted.add(mint);
                    console.log(`✨ DETECTED: ${mint}`);
                    
                    const security = await checkRug(mint);
                    
                    // Filter: Only alert if score is decent
                    if (security.score < 800) {
                        sendTelegramAlert(mint, security);
                    }
                }
            }
        } catch (e) { /* Non-critical data */ }
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });
}

function sendTelegramAlert(mint, security) {
    const msg = `🚨 <b>NEW PUMP.FUN MINT</b>\n\n<code>${mint}</code>\n\n🛡 <b>Score: ${security.score}</b>\n\n<a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a>`;
    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true })
       .then(() => console.log("✅ Alert Sent!"))
       .catch(e => console.error("❌ Telegram Fail:", e.message));
}

// Initial Test
bot.sendMessage(CHAT_ID, "🚀 <b>Enhanced Bot Online.</b> Waiting for launches...");
startListening();
