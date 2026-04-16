require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

/**
 * 🏦 TARGET EXCHANGES & BRIDGES
 * In addresses ke signatures bot detect karega
 */
const KNOWN_SOURCES = [
    'Binance', 'OKX', 'Bybit', 'Coinbase', 'Kraken', 
    'KuCoin', 'Gate.io', 'FixedFloat', 'ChangeNOW', 
    'Circle', 'Wormhole', 'MEXC'
];

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🚀 MUSHTAQ ELITE FORENSIC ACTIVE');
        console.log('Target: CEX/Bridge Funding + Socials Only');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alerted.has(event.mint)) return;

            // 1. SOL FILTER (Min 1.0 SOL)
            if (event.solAmount < 1.0) return;

            // 2. WAIT FOR METADATA SETTLEMENT (6 Seconds)
            setTimeout(async () => {
                const coinData = await axios.get(`https://frontend-api.pump.fun/coins/${event.mint}`).then(r => r.data).catch(() => null);
                
                // SOCIALS CHECK: Twitter/Web/TG mein se aik lazmi ho
                if (!coinData || !(coinData.twitter || coinData.website || coinData.telegram)) return;

                // 3. DEEP FUNDING FORENSIC (The Real Test)
                const report = await performAdvancedForensic(event.traderPublicKey);

                if (report.isClean) {
                    alerted.add(event.mint);
                    sendEliteAlert(event, coinData, report);
                } else {
                    console.log(`❌ BLOCKED: Dirty/Personal Funding for ${event.name}`);
                }
            }, 6000);

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

/**
 * Helius Forensic Engine
 */
async function performAdvancedForensic(walletAddr) {
    try {
        // Helius se wallet ki transaction history fetch karna
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0",
            id: "forensic-scan",
            method: "getTransactions",
            params: [walletAddr, { limit: 20 }]
        });

        const txs = response.data.result || [];
        if (txs.length === 0) return { isClean: true, source: "Brand New Wallet", risk: "Low" };

        // Sab se purani (pehli) transaction check karna (Funding Transaction)
        const fundingTx = txs[txs.length - 1];
        const description = fundingTx.description || "";
        
        // Check if description mentions any exchange or bridge
        let detectedSource = "Personal Wallet";
        let isClean = false;

        const foundSource = KNOWN_SOURCES.find(s => description.includes(s));
        
        if (foundSource) {
            detectedSource = `Verified ${foundSource}`;
            isClean = true;
        } else if (txs.length < 5) {
            // Agar CEX mention nahi hai par wallet bilkul naya hai (likely fresh CEX withdrawal)
            detectedSource = "Fresh Wallet (Potential CEX)";
            isClean = true;
        }

        return { isClean, source: detectedSource, risk: isClean ? "Low" : "High" };
    } catch (e) {
        return { isClean: false, source: "Scan Error", risk: "Unknown" };
    }
}

function sendEliteAlert(event, coinData, report) {
    const msg = `
🌟 <b>ELITE CLEAN LAUNCH</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${coinData.name} (<code>${coinData.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>FORENSIC ANALYSIS:</b>
├ <b>Dev Buy:</b> <code>${event.solAmount.toFixed(2)}</code> SOL ✅
├ <b>Funding:</b> <code>${report.source}</code>
├ <b>Risk Level:</b> <code>${report.risk}</code>
└ <b>Twitter:</b> ${coinData.twitter ? "✅" : "❌"} | <b>TG:</b> ${coinData.telegram ? "✅" : "❌"}

🛠 <b>LINKS:</b>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a> | 📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a>

💰 <b>TRADE:</b>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Terminal</b></a> | 🪐 <a href="https://jup.ag/swap/SOL-${event.mint}"><b>Jupiter</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
