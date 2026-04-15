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
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 2000 });
        return { score: res.data.score || 0, risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean' };
    } catch (e) { return { score: 0, risks: 'New Token - Fast Alert' }; }
}

function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);
    let pingInterval;

    ws.on('open', () => {
        console.log('🔗 Connected to Solana (Enhanced Mode)');
        
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 30000);

        // This subscribes to FULLY PARSED transactions mentioning Pump.fun
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "transactionSubscribe",
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
            if (json.result && !json.params) return; // Subscription confirmation
            
            const tx = json.params.result.transaction;
            const logMessages = tx.meta.logMessages || [];

            // Identify the "Create" instruction in Pump.fun
            if (logMessages.some(log => log.includes("Program log: Instruction: Create"))) {
                // In a 'Create' tx, the Mint account is usually the 1st or 2nd account index
                // We pull it directly from the parsed account keys
                const mint = tx.transaction.message.accountKeys[1].pubkey;

                if (alerted.has(mint)) return;
                alerted.add(mint);

                console.log(`✨ DETECTED: ${mint}`);
                const security = await checkRug(mint);
                sendTelegramAlert(mint, security);
            }
        } catch (e) { /* Ignore non-tx data */ }
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });
}

function sendTelegramAlert(mint, security) {
    const msg = `🚨 <b>NEW PUMP.FUN MINT</b>\n\n<code>${mint}</code>\n\n🛡 <b>Score: ${security.score}</b>\n\n<a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a>`;
    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
