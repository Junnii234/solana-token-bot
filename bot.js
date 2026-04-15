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
 * Main function to start the sniper
 */
function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('💎 ELITE HYBRID SNIPER ONLINE');
        console.log('Targeting: Atomic Bundles (create_v2 + High Buy + Socials)');
        console.log('-------------------------------------------------------');
        
        // Donon methods subscribe karna zaroori hai bundles ki monitoring ke liye
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint || alerted.has(mint)) return;

            // --- THE FORENSIC ALPHA FILTER ---
            
            const devBuy = event.solAmount || 0;
            const isV2 = event.vSolReserves !== undefined;
            const hasSocials = (event.twitter || event.website || event.telegram);

            // 1. "CREATE ONLY" DISCARD: Agar dev buy 0.8 SOL se kam hai to skip (Scam prevention)
            if (devBuy < 0.8) return;

            // 2. ALPHA TRACK: create_v2 + High Buy (1.5+ SOL) + Socials
            // Ye wahi signature hai jo ACtf aur 34q2 jaise tokens ka hota hai.
            if (isV2 && devBuy >= 1.5 && hasSocials) {
                alerted.add(mint);
                sendEliteAlert(event, "🚀 ELITE ATOMIC BUNDLE (INSTANT)", "ULTRA-HIGH");
            } 
            
            // 3. VERIFIED TRACK: Agar dev buy acha hai (0.8 - 1.5) lekin v2 nahi ya socials late hain
            else if (devBuy >= 0.8) {
                alerted.add(mint);
                // 15 seconds wait for RugCheck to index first 50 transactions
                setTimeout(async () => {
                    const report = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`)
                        .then(r => r.data)
                        .catch(() => null);

                    if (report && report.score < 400) {
                        sendEliteAlert(event, "🚨 SAFE VERIFIED LAUNCH", "MEDIUM", report.score);
                    }
                }, 15000);
            }

        } catch (e) {
            // Ignore non-JSON messages
        }
    });

    ws.on('close', () => {
        console.log('♻️ Connection lost. Reconnecting in 2s...');
        setTimeout(startListening, 2000);
    });
}

/**
 * Styled Telegram Alert with all required links
 */
function sendEliteAlert(event, title, conviction, score = "N/A") {
    const msg = `
${title}
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>FORENSIC ANALYSIS:</b>
├ <b>Conviction:</b> <code>${conviction}</code>
├ <b>Dev Initial Buy:</b> <code>${(event.solAmount || 0).toFixed(2)}</code> SOL ✅
└ <b>RugScore:</b> <code>${score}</code>

🛠 <b>VERIFICATION TOOLS:</b>
📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck (Check 1st 50 Tx)</b></a>
⛓ <a href="https://solscan.io/token/${event.mint}"><b>Solscan (Check Funding)</b></a>

💰 <b>TRADE & CHARTS:</b>
🪐 <a href="https://jup.ag/swap/SOL-${event.mint}"><b>Jupiter Swap</b></a>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Snipe</b></a>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
}

// Start the bot
startListening();
