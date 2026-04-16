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
        console.log('💎 MUSHTAQ DUAL-FORENSIC SNIPER LIVE');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            if (!mint || alerted.has(mint)) return;

            const devBuy = event.solAmount || 0;
            if (devBuy < 1.0) return; // 1.0 SOL filter

            alerted.add(mint);

            // --- STAGE 1: INSTANT ALERT ---
            const initialMsg = await sendInitialAlert(event);

            // --- STAGE 2: BACKGROUND FORENSIC ---
            // 2 seconds wait for transaction to settle on chain
            setTimeout(async () => {
                const report = await performDeepForensic(event.traderPublicKey);
                updateAlertWithForensic(initialMsg.message_id, event, report);
            }, 2500);

        } catch (e) { console.error("Msg Error:", e.message); }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

/**
 * Deep Forensic using Helius API
 */
async function performDeepForensic(walletAddr) {
    try {
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0",
            id: "my-id",
            method: "getSignaturesForAddress",
            params: [walletAddr, { limit: 10 }]
        });

        const signatures = response.data.result || [];
        
        // Agar signatures 3 se kam hain, yaani naya/fresh wallet hai
        if (signatures.length <= 3) {
            return { risk: "Low", source: "CEX / Fresh Wallet", status: "✅ CLEAN" };
        } 
        
        // Agar bohot zyada transactions hain, to risk zyada hai
        return { risk: "Medium/High", source: "Linked Wallet", status: "⚠️ SERIAL DEV?" };

    } catch (e) {
        return { risk: "Unknown", source: "Scan Failed", status: "❓ UNCERTAIN" };
    }
}

async function sendInitialAlert(event) {
    const msg = `
🚀 <b>NEW HIGH-BUY DETECTED</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name}
<b>Mint:</b> <code>${event.mint}</code>
<b>Dev Buy:</b> ${event.solAmount.toFixed(2)} SOL
<b>Forensic:</b> ⏳ Scanning Wallet...
    `;
    return bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
}

async function updateAlertWithForensic(msgId, event, report) {
    const twitter = event.twitter ? `<a href="${event.twitter}">Twitter</a>` : "None";
    
    const updatedMsg = `
${report.status} <b>FORENSIC COMPLETE</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${event.name} (<code>${event.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>ANALYSIS:</b>
├ <b>Funding:</b> <code>${report.source}</code>
├ <b>Risk Level:</b> <code>${report.risk}</code>
└ <b>Twitter:</b> ${twitter}

🚨 <b>ADVICE:</b>
Check Solscan for funding. If linked to old rugs, <b>DO NOT BUY.</b>

💰 <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Snipe</b></a> | ⛓ <a href="https://solscan.io/token/${event.mint}"><b>Solscan</b></a>
    `;
    
    bot.editMessageText(updatedMsg, {
        chat_id: CHAT_ID,
        message_id: msgId,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    }).catch(e => console.log("Edit Error"));
}

startListening();
