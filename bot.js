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

// --- DASHBOARD COUNTERS ---
let totalSeen = 0;
let totalSkipped = 0;
let totalViral = 0;

/**
 * Security Check via RugCheck API
 * Filters out Mint/Freeze risks automatically
 */
async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 2000 });
        return { score: res.data.score || 0 };
    } catch (e) { 
        return { score: 0 }; // Default to 0 for brand new tokens
    }
}

/**
 * Main Logic: Connects to the direct Pump.fun stream
 */
function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🎯 VIRAL HUNTER ACTIVE: Monitoring High-Intent Launches');
        console.log('-------------------------------------------------------');
        // Subscribe specifically to New Token Creations
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            totalSeen++;

            // --- THE VIRAL FILTERS (ACtf...pump Style) ---
            
            // 1. SOCIALS CHECK: Professional launches always have metadata links
            const hasSocials = event.twitter || event.website || event.telegram;
            
            // 2. CONVICTION CHECK: Dev must buy at least 0.5 SOL to show they are serious
            const MIN_DEV_BUY = 0.5; 

            if (!hasSocials || event.solAmount < MIN_DEV_BUY) {
                totalSkipped++;
                // Update live status line
                process.stdout.write(`\r📊 [${totalSeen}] Scanning... | Skipped: ${totalSkipped} | Viral Found: ${totalViral}`);
                return;
            }

            const mint = event.mint;
            if (alerted.has(mint)) return;
            alerted.add(mint);

            // 3. SECURITY CHECK
            const security = await checkRug(mint);
            
            // Strictly alert only on Low-Risk (Score < 400)
            if (security.score < 400) {
                totalViral++;
                console.log(`\n\n💎 VIRAL MATCH: ${event.name} (${event.symbol})`);
                console.log(`📍 Mint: ${mint}`);
                console.log(`💰 Dev Buy: ${event.solAmount} SOL | Socials: ✅`);
                
                sendViralAlert(event, security.score);
            } else {
                totalSkipped++;
            }

        } catch (e) {
            // Skip non-event messages
        }
    });

    ws.on('close', () => {
        console.log('\n♻️ Connection lost. Reconnecting to stream...');
        setTimeout(startListening, 2000);
    });

    ws.on('error', (err) => console.error('❌ WS Error:', err.message));
}

/**
 * Sends the rich-format Telegram Alert
 */
function sendViralAlert(token, score) {
    const twitterLink = token.twitter ? `<a href="${token.twitter}">🐦 Twitter</a>` : "<s>Twitter</s>";
    const webLink = token.website ? `<a href="${token.website}">🌐 Website</a>` : "<s>Website</s>";
    const tgLink = token.telegram ? `<a href="${token.telegram}">💬 Telegram</a>` : "<s>Telegram</s>";

    const msg = `💎 <b>VIRAL POTENTIAL DETECTED</b> 💎

<b>Token:</b> ${token.name} (${token.symbol})
<code>${token.mint}</code>

🛡 <b>RugScore: ${score}</b>
💰 <b>Dev Buy:</b> ${token.solAmount} SOL

🔗 ${twitterLink} | ${webLink} | ${tgLink}

<a href="https://bullx.io/terminal?chain=solana&address=${token.mint}">⚡ BullX (Instant Snipe)</a>
<a href="https://dexscreener.com/solana/${token.mint}">📊 DexScreener</a>`;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    }).then(() => console.log("✅ Telegram Notified!"))
      .catch(e => console.error("❌ Telegram Error:", e.message));
}

// --- STARTUP ---
bot.sendMessage(CHAT_ID, "🚀 <b>Viral Hunter Online.</b>\nFilters: Socials required + Min 0.5 SOL Dev Buy.");
startListening();
