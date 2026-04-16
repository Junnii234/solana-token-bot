require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🚀 UNSTOPPABLE SNIPER: No Socials Required');
        console.log('Targeting: Create + Buy > 1.5 SOL (Instant)');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint || alerted.has(mint)) return;

            const devBuy = event.solAmount || 0;

            // --- 🎯 THE ABSOLUTE ALPHA RULE ---
            
            // Agar Dev Buy 1.5 SOL ya usse zyada hai (Instant Alert)
            // Ab hum Socials (Twitter/Web) ka bilkul wait nahi karenge.
            if (devBuy >= 1.5) {
                alerted.add(mint);
                sendEliteAlert(event, "🚀 HIGH-CONVICTION BUNDLE (INSTANT)", "ULTRA-HIGH");
            } 

            // Agar Dev Buy 0.8 - 1.5 SOL hai, to Safety ke liye 15s wait.
            else if (devBuy >= 0.8) {
                alerted.add(mint);
                setTimeout(async () => {
                    const report = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`).then(r => r.data).catch(() => null);
                    if (report && report.score < 400) {
                        sendEliteAlert(event, "🚨 SAFE VERIFIED LAUNCH", "MEDIUM", report.score);
                    }
                }, 15000);
            }

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

function sendEliteAlert(event, title, conviction, score = "N/A") {
    // Socials check sirf display ke liye hai, filter ke liye nahi
    const twitter = event.twitter ? `<a href="${event.twitter}">Twitter</a>` : "None";
    const website = event.website ? `<a href="${event.website}">Website</a>` : "None";

    const msg = `
${title}
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>ANALYSIS:</b>
├ <b>Conviction:</b> <code>${conviction}</code>
├ <b>Dev Initial Buy:</b> <code>${(event.solAmount || 0).toFixed(2)}</code> SOL ✅
├ <b>Twitter:</b> ${twitter}
└ <b>Website:</b> ${website}

🛠 <b>LINKS:</b>
📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a> | ⛓ <a href="https://solscan.io/token/${event.mint}"><b>Solscan</b></a>

💰 <b>TRADE:</b>
🪐 <a href="https://jup.ag/swap/SOL-${event.mint}"><b>Jupiter</b></a> | ⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX</b></a>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
