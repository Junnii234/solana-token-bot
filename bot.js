require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

/**
 * Sniper Engine with Social & Rug Filters
 */
function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🛡️ ELITE ANTI-RUG SNIPER ACTIVE');
        console.log('Logic: Socials + High Buy = Instant | No Socials = 15s Scan');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint || alerted.has(mint)) return;

            const devBuy = event.solAmount || 0;
            // Socials check (Twitter/Website/Telegram)
            const hasSocials = !!(event.twitter || event.website || event.telegram);

            // --- 🎯 THE ELITE ANTI-RUG FILTERS ---

            // TRACK 1: INSTANT ALERT (The Real Professional Standard)
            // Dev Buy >= 1.5 SOL AUR Social Links lazmi hain.
            if (devBuy >= 1.5 && hasSocials) {
                alerted.add(mint);
                sendEliteAlert(event, "🚀 ELITE BUNDLE (INSTANT)", "ULTRA-HIGH");
            } 

            // TRACK 2: VERIFIED TRACK (Potential Rugs or Small Bundles)
            // Agar dev buy acha hai (0.8+ SOL) lekin SOCIALS NAHI hain (Jaise GOONICIDE)
            // To hum isay 15 seconds wait karwayenge aur RugCheck score scan karenge.
            else if (devBuy >= 0.8) {
                alerted.add(mint);
                console.log(`⏳ Scanning ${event.name} (Waiting for RugCheck)...`);
                
                setTimeout(async () => {
                    const report = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`)
                        .then(r => r.data)
                        .catch(() => null);

                    // Score < 400 (Good/Warning) pass hoga. Danger/Rug block hoga.
                    if (report && report.score < 400) {
                        sendEliteAlert(event, "🚨 SAFE VERIFIED LAUNCH", "MEDIUM", report.score);
                    } else {
                        console.log(`❌ BLOCKING RUG: ${event.name} (Score: ${report ? report.score : 'High Risk'})`);
                    }
                }, 15000); // 15s delay to let RugCheck index the transactions
            }

        } catch (e) { }
    });

    ws.on('close', () => {
        console.log('♻️ Reconnecting...');
        setTimeout(startListening, 2000);
    });
}

/**
 * Enhanced Alert Template
 */
function sendEliteAlert(event, title, conviction, score = "N/A") {
    const twitter = event.twitter ? `<a href="${event.twitter}">Twitter</a>` : "None";
    const website = event.website ? `<a href="${event.website}">Website</a>` : "None";

    const msg = `
${title}
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>ANALYSIS:</b>
├ <b>Conviction:</b> <code>${conviction}</code>
├ <b>Dev Buy:</b> <code>${(event.solAmount || 0).toFixed(2)}</code> SOL ✅
├ <b>RugScore:</b> <code>${score}</code>
├ <b>Twitter:</b> ${twitter}
└ <b>Website:</b> ${website}

🛠 <b>TOOLS:</b>
📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a> | ⛓ <a href="https://solscan.io/token/${event.mint}"><b>Solscan</b></a>

💰 <b>TRADE:</b>
🪐 <a href="https://jup.ag/swap/SOL-${event.mint}"><b>Jupiter</b></a> | ⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX</b></a>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
}

startListening();
