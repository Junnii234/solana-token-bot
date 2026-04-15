require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data'; // Dedicated fast feed

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

// DASHBOARD COUNTERS
let totalSeen = 0;
let totalPassed = 0;
let totalSkipped = 0;

async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 2000 });
        return { score: res.data.score || 0 };
    } catch (e) { return { score: 0 }; }
}

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('✅ Connected to Direct Pump.fun Stream');
        console.log('📊 LIVE LOGS ACTIVE: Monitoring every launch...');
        
        // Subscribing to only New Token Creations
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            totalSeen++;
            const mint = event.mint;

            if (alerted.has(mint)) return;
            alerted.add(mint);

            // SECURITY FILTER
            const security = await checkRug(mint);
            
            if (security.score < 800) {
                totalPassed++;
                const isDevBuy = event.solAmount > 0;
                console.log(`\n🚀 [${totalPassed}] NEW TOKEN: ${mint} | Dev Buy: ${event.solAmount} SOL`);
                
                sendTelegramAlert(event, security.score);
            } else {
                totalSkipped++;
                process.stdout.write(`\r📊 STATS: ${totalSeen} Seen | ${totalSkipped} Scams Skipped | ${totalPassed} Alerts Sent`);
            }
        } catch (e) { /* Ignore non-JSON */ }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

function sendTelegramAlert(token, score) {
    const msg = `🚨 <b>NEW PUMP.FUN MINT</b>\n\n<code>${token.mint}</code>\n\n🛡 <b>RugScore: ${score}</b>\n💰 <b>Initial Buy:</b> ${token.solAmount} SOL\n\n<a href="https://bullx.io/terminal?chain=solana&address=${token.mint}">⚡ BullX</a> | <a href="https://dexscreener.com/solana/${token.mint}">📊 DexScreener</a>`;
    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
