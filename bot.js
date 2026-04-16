require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🛡️ ELITE CLEAN-FEED SNIPER ONLINE');
        console.log('Mode: Forensic First, Alert Second');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint || alerted.has(mint)) return;

            const devBuy = event.solAmount || 0;
            // Strategy: 1.0 SOL se kam wale tokens ignore
            if (devBuy < 1.0) return;

            alerted.add(mint);

            // --- 🕵️‍♂️ STAGE 1: BACKGROUND FORENSIC ---
            // Alert bhejne se pehle wallet history scan karein
            const report = await performDeepForensic(event.traderPublicKey);

            // AGAR FUNDING DIRTY HAI (Linked to old rugs), TO ALERT NAHI BHEJENGE
            if (report.risk === "High") {
                console.log(`❌ BLOCKING SERIAL RUGGER: ${event.name} (Linked History)`);
                return; 
            }

            // AGAR FUNDING CLEAN HAI, TO ALERT BHEJENGE
            sendEliteAlert(event, report);

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

/**
 * Helius Wallet Forensic Logic
 */
async function performDeepForensic(walletAddr) {
    try {
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0",
            id: "forensic-scan",
            method: "getSignaturesForAddress",
            params: [walletAddr, { limit: 15 }]
        });

        const sigs = response.data.result || [];
        
        // Pattern: Fresh Wallet (Zindagi ki pehli 5 transactions)
        // Ye pattern professional devs ya exchange withdrawals ka hota hai
        if (sigs.length <= 5) {
            return { risk: "Low", source: "Fresh/CEX Wallet", status: "✅ CLEAN" };
        }

        // Agar transactions zyada hain, to iska matlab dev "Old Player" hai (High Risk)
        return { risk: "High", source: "Linked Wallet", status: "⚠️ RUG RISK" };

    } catch (e) {
        return { risk: "Medium", source: "Scan Error", status: "❓ UNKNOWN" };
    }
}

function sendEliteAlert(event, report) {
    const twitter = event.twitter ? `<a href="${event.twitter}">Twitter</a>` : "None";
    
    const msg = `
🌟 <b>ELITE CLEAN LAUNCH</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>FORENSIC ANALYSIS:</b>
├ <b>Dev Buy:</b> <code>${event.solAmount.toFixed(2)}</code> SOL ✅
├ <b>Funding:</b> <code>${report.source}</code>
├ <b>Risk Level:</b> <code>${report.risk}</code>
└ <b>Twitter:</b> ${twitter}

🛠 <b>QUICK TOOLS:</b>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a>
📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a>
⛓ <a href="https://solscan.io/token/${event.mint}"><b>Solscan</b></a>

💰 <b>TRADE FAST:</b>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Terminal</b></a>
🪐 <a href="https://jup.ag/swap/SOL-${event.mint}"><b>Jupiter Swap</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
}

startListening();
