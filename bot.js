require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIG ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb';
const PUMP_FUN_PROGRAM = '6EF8rrecthR5DkZ8zFm9kAnLXYvshU9S6YecYyF';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

console.log('🚀 REAL-TIME PUMP.FUN DETECTOR STARTING...');

// --- SECURITY CHECKER ---
async function checkRug(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 3000 });
        return {
            score: res.data.score || 0,
            risks: res.data.risks?.map(r => r.name).join(', ') || 'Clean'
        };
    } catch (e) {
        return { score: 0, risks: 'Check Manually' }; // Rugcheck might not index instantly
    }
}

// --- MAIN LISTENER ---
function startListening() {
    const ws = new WebSocket(HELIUS_WS_URL);

    ws.on('open', () => {
        console.log('🔗 Connected to Solana via Helius');
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
                { mentions: [PUMP_FUN_PROGRAM] },
                { commitment: "processed" }
            ]
        }));
    });

    ws.on('message', async (data) => {
        const json = JSON.parse(data);
        if (!json.params?.result) return;

        const logs = json.params.result.value.logs;
        const signature = json.params.result.value.signature;

        // "InitializeMint" is the specific log for a brand new Pump.fun token
        if (logs.some(log => log.includes("Program log: Instruction: InitializeMint"))) {
            console.log(`✨ Potential New Token! Sig: ${signature}`);
            
            // Short delay to allow the transaction to finalize so we can read it
            setTimeout(() => processTransaction(signature), 1500);
        }
    });

    ws.on('error', (e) => console.error('WS Error:', e.message));
    ws.on('close', () => {
        console.log('♻️ Reconnecting...');
        setTimeout(startListening, 2000);
    });
}

// --- EXTRACT TOKEN ADDRESS ---
async function processTransaction(sig) {
    try {
        // We use Helius to get the transaction details
        const res = await axios.post(`https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`, {
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
        });

        const keys = res.data.result.transaction.message.accountKeys;
        // The mint address is usually the first account key in a Pump.fun create instruction
        const mint = keys[1]; 

        if (alerted.has(mint)) return;
        alerted.add(mint);

        console.log(`🎯 Token Found: ${mint}`);
        
        // Run Security Check
        const security = await checkRug(mint);
        
        // ONLY ALERT IF SCORE IS OK (Adjust threshold as needed)
        if (security.score < 500) {
            sendTelegramAlert(mint, security);
        }

    } catch (e) {
        console.log('❌ Error processing tx:', e.message);
    }
}

function sendTelegramAlert(mint, security) {
    const msg = `
🚨 <b>NEW PUMP.FUN TOKEN</b>

<code>${mint}</code>

<b>🛡 Security:</b>
Score: ${security.score}
Risks: ${security.risks}

<a href="https://rugcheck.xyz/tokens/${mint}">RugCheck</a> | <a href="https://dexscreener.com/solana/${mint}">DexScreener</a> | <a href="https://bullx.io/terminal?chain=solana&address=${mint}">BullX</a>`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
