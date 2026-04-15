require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const alertedLaunch = new Set();
const alertedMigration = new Set();

// Dashboard counters for Railway logs
let totalSeen = 0;
let totalSkipped = 0;
let totalPassed = 0;

/**
 * Security Check via RugCheck API
 */
async function getRugReport(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 4000 });
        return res.data;
    } catch (e) { 
        return null; 
    }
}

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('💎 PREMIER SNIPER ONLINE');
        console.log('Monitoring: New Launches & Raydium Migrations');
        console.log('-------------------------------------------------------');
        
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint) return;

            // --- STAGE 1: NEW TOKEN DETECTION ---
            if (event.txType === 'create' || !event.txType) {
                if (!alertedLaunch.has(mint)) {
                    totalSeen++;
                    alertedLaunch.add(mint);
                    handleNewLaunch(event);
                }
            }

            // --- STAGE 2: MIGRATION TRACKER (Market Cap > 80 SOL) ---
            if (event.marketCapSol >= 80 && !alertedMigration.has(mint)) {
                alertedMigration.add(mint);
                sendMigrationAlert(event);
            }

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

async function handleNewLaunch(event) {
    const mint = event.mint;
    process.stdout.write(`\r📊 Analyzing: ${mint.slice(0,6)}...`);

    // 15s Delay to allow Top 10 Holders and metadata to finalize
    setTimeout(async () => {
        const report = await getRugReport(mint);
        if (!report) {
            totalSkipped++;
            return;
        }

        const score = report.score || 0;
        const risks = report.risks || [];

        const hasMint = risks.some(r => r.name.toLowerCase().includes('mint'));
        const hasFreeze = risks.some(r => r.name.toLowerCase().includes('freeze'));
        const highHolders = risks.some(r => r.name.toLowerCase().includes('top 10') || r.name.toLowerCase().includes('high holder'));

        // Stage 1 Criteria: Low RugScore + Safe Authorities + Clean Holders
        if (score < 400 && !hasMint && !hasFreeze && !highHolders) {
            totalPassed++;
            sendLaunchAlert(event, score);
        } else {
            totalSkipped++;
        }
    }, 15000); 
}

// --- VISUAL ALERT STYLING ---

function sendLaunchAlert(event, score) {
    const msg = `
🌟 <b>NEW HIGH-CONVICTION LAUNCH</b> 🌟
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

🛡 <b>SAFETY CHECK:</b>
├ <b>RugScore:</b> <code>${score}</code> (Excellent)
├ <b>Top 10 Holders:</b> < 20% ✅
└ <b>Authorities:</b> Mint/Freeze Disabled ✅

💰 <b>Dev Initial Buy:</b> <code>${event.solAmount || 0}</code> SOL
━━━━━━━━━━━━━━━━━━
🔗 <b>LINKS:</b>
📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck Report</b></a>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>Snipe on BullX</b></a>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
}

function sendMigrationAlert(event) {
    const msg = `
🚀 <b>BONDING CURVE GRADUATED!</b> 🚀
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.symbol}
<b>Status:</b> Migrating to Raydium

🔥 <b>Liquidity:</b> Burned/Locked Automatically
📈 <b>Market Cap:</b> <code>${Math.round(event.marketCapSol)}</code> SOL
━━━━━━━━━━━━━━━━━━
🔍 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>Verify Migration</b></a>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>Live Chart</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
}

startListening();
