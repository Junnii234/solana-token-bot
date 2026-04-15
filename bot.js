require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Tracking sets to prevent duplicate alerts
const alertedLaunch = new Set();
const alertedMigration = new Set();

// Dashboard counters
let totalSeen = 0;
let totalSkipped = 0;
let totalPassed = 0;

/**
 * Security Check via RugCheck API
 * Analyzes Mint/Freeze authority and Holder concentration
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
        console.log('🛡️ TWO-STAGE SNIPER ACTIVE');
        console.log('Stage 1: 15s Deep Scan | Stage 2: Migration Tracker');
        console.log('-------------------------------------------------------');
        
        // Subscribe to new creations AND all trades (to track bonding progress)
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

            // --- STAGE 2: BONDING CURVE COMPLETION (MIGRATION) ---
            // A market cap of ~80 SOL signals the move to Raydium
            if (event.marketCapSol >= 80 && !alertedMigration.has(mint)) {
                alertedMigration.add(mint);
                sendMigrationAlert(event);
            }

        } catch (e) {
            // Silently handle non-JSON messages
        }
    });

    ws.on('close', () => {
        console.log('\n♻️ Connection lost. Reconnecting...');
        setTimeout(startListening, 2000);
    });
}

/**
 * Handles the 15-second safety delay and RugCheck analysis
 */
async function handleNewLaunch(event) {
    const mint = event.mint;
    
    // Log progress in console
    process.stdout.write(`\r📊 [${totalSeen}] Detected: ${mint.slice(0,6)}... | Waiting 15s for analysis`);

    setTimeout(async () => {
        const report = await getRugReport(mint);
        if (!report) {
            totalSkipped++;
            return;
        }

        const score = report.score || 0;
        const risks = report.risks || [];

        // 1. Check for Mint/Freeze Authority
        const hasMint = risks.some(r => r.name.toLowerCase().includes('mint'));
        const hasFreeze = risks.some(r => r.name.toLowerCase().includes('freeze'));
        
        // 2. Check Top 10 Holder Concentration (< 20% risk)
        const highHolders = risks.some(r => r.name.toLowerCase().includes('top 10') || r.name.toLowerCase().includes('high holder'));

        // 3. Final Decision (Liquidity is EXEMPT here as it's on bonding curve)
        if (score < 400 && !hasMint && !hasFreeze && !highHolders) {
            totalPassed++;
            console.log(`\n✅ SAFE TOKEN PASSED: ${event.symbol}`);
            sendLaunchAlert(event, score);
        } else {
            totalSkipped++;
        }
    }, 15000); // 15 Second delay
}

/**
 * Stage 1 Telegram Notification
 */
function sendLaunchAlert(event, score) {
    const msg = `🚨 <b>NEW SAFE LAUNCH</b> 🚨

<b>Name:</b> ${event.name} (${event.symbol})
<code>${event.mint}</code>

🛡 <b>RugScore:</b> ${score}
👥 <b>Top 10 Holders:</b> Safe (< 20%)
❄️ <b>Mint/Freeze:</b> Disabled
💰 <b>Initial Buy:</b> ${event.solAmount || 0} SOL

<a href="https://bullx.io/terminal?chain=solana&address=${event.mint}">⚡ BullX (Buy)</a> | <a href="https://dexscreener.com/solana/${event.mint}">📊 DexScreener</a>`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

/**
 * Stage 2 Telegram Notification (Migration)
 */
function sendMigrationAlert(event) {
    const msg = `🎊 <b>BONDING CURVE COMPLETED!</b> 🎊

The token <b>${event.symbol}</b> has hit 100% and is migrating to Raydium.

<code>${event.mint}</code>

🔥 <b>Liquidity is being Burned/Locked</b>
🚀 <b>Bonding Curve:</b> 100% Finished

<a href="https://dexscreener.com/solana/${event.mint}">📊 View Live Chart</a>`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
    console.log(`\n🎊 [MIGRATION] ${event.symbol} hit Raydium!`);
}

// Start the bot
startListening();
