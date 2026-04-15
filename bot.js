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

// --- DASHBOARD COUNTERS ---
let totalSeen = 0;
let totalSkipped = 0;
let totalDetected = 0;

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
        console.log('🔗 Connected to Solana (Enhanced Enhanced Mode)');
        // Print header for the dashboard
        console.log('--------------------------------------------------');
        console.log('STATS: SEEN | SKIPPED | DETECTED');
        console.log('--------------------------------------------------');
        
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
            
            totalSeen++;
            const tx = json.params.result.transaction;
            const logs = tx.meta.logMessages || [];

            // Detect 'create' or 'create_v2' per your research
            const isLaunch = logs.some(l => 
                l.includes("Instruction: create") || 
                l.includes("Instruction: create_v2")
            );

            if (isLaunch) {
                // More robust Mint extraction
                const mint = tx.transaction.message.accountKeys[1].pubkey;

                if (mint && !alerted.has(mint)) {
                    totalDetected++;
                    alerted.add(mint);
                    const hasBuy = logs.some(l => l.includes("Instruction: buy"));
                    
                    console.log(`\n✨ [${totalDetected}] DETECTED: ${mint} | Dev Buy: ${hasBuy}`);
                    const security = await checkRug(mint);

                    // If it passes the filter, send it!
                    if (security.score < 800) {
                        sendTelegramAlert(mint, security, hasBuy);
                    } else {
                        console.log(`🚫 [SKIP] ${mint} failed filter (Score: ${security.score})`);
                    }
                }
            } else {
                totalSkipped++;
                // Update the log line every 10 trades so it doesn't spam but shows activity
                if (totalSeen % 10 === 0) {
                    process.stdout.write(`\r📊 STATS: ${totalSeen} Seen | ${totalSkipped} Skipped | ${totalDetected} Detected`);
                }
            }
        } catch (e) { /* Heartbeat packets */ }
    });

    ws.on('close', () => {
        console.log('\n♻️ Reconnecting...');
        clearInterval(pingInterval);
        setTimeout(startListening, 2000);
    });
}

function sendTelegramAlert(mint, security, isHighIntent) {
    const title = isHighIntent ? "🔥 <b>DEV BOUGHT ON LAUNCH</b>" : "🚨 <b>NEW PUMP.FUN MINT</b>";
    const msg = `${title}\n\n<code>${mint}</code>\n\n🛡 <b>Score: ${security.score}</b>\n\n<a href="https://bullx.io/terminal?chain=solana&address=${mint}">⚡ BullX</a> | <a href="https://dexscreener.com/solana/${mint}">📊 DexScreener</a>`;
    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
