require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 2000 });
        return { score: res.data.score || 0 };
    } catch (e) { return { score: 0 }; }
}

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🎯 VIRAL HUNTER ACTIVE');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            // --- THE VIRAL FILTERS ---
            
            // 1. MUST HAVE SOCIALS (Website or Twitter or Telegram)
            // Viral tokens like the one you mentioned ALWAYS have these.
            const hasSocials = event.twitter || event.website || event.telegram;
            
            // 2. MINIMUM DEV BUY (Conviction)
            // Developers of solid coins usually put at least 0.5 - 1 SOL.
            const minBuy = 0.5;

            if (!hasSocials || event.solAmount < minBuy) {
                // Silently skip "anonymous" or "low-buy" junk
                return;
            }

            const mint = event.mint;
            if (alerted.has(mint)) return;
            alerted.add(mint);

            const security = await checkRug(mint);
            
            // 3. RUGCHECK FILTER
            if (security.score < 400) {
                console.log(`🚀 TARGET MATCH: ${event.symbol} (${mint})`);
                sendViralAlert(event, security.score);
            }
        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

function sendViralAlert(token, score) {
    const twitter = token.twitter ? `<a href="${token.twitter}">🐦 Twitter</a>` : "No Twitter";
    const web = token.website ? `<a href="${token.website}">🌐 Website</a>` : "No Web";

    const msg = `💎 <b>VIRAL POTENTIAL DETECTED</b> 💎
    
<b>Token:</b> ${token.name} (${token.symbol})
<code>${token.mint}</code>

🛡 <b>Score: ${score}</b>
💰 <b>Dev Buy:</b> ${token.solAmount} SOL

🔗 ${twitter} | ${web}

<a href="https://bullx.io/terminal?chain=solana&address=${token.mint}">⚡ BullX (Snipe)</a> | <a href="https://dexscreener.com/solana/${token.mint}">📊 DexScreener</a>`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
