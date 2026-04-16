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

const KNOWN_EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Coinbase', 'FixedFloat', 'ChangeNOW', 'Circle', 'Gate.io'];

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('🛡️ JUNNI V5: FORENSIC-FIRST MODE ACTIVE');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alerted.has(event.mint)) return;

            // --- STEP 1: SOL FILTER ---
            if (event.solAmount < 1.0) return;
            alerted.add(event.mint);

            console.log(`🕵️‍♂️ Starting Forensic for: ${event.name}`);

            // --- STEP 2: IMMEDIATE FORENSIC (Helius Scan) ---
            const report = await performDeepForensic(event.traderPublicKey);

            if (!report.isClean) {
                console.log(`❌ BLOCKING DIRTY WALLET: ${event.name}`);
                return;
            }

            // --- STEP 3: WAIT FOR SOCIALS (Settlement Delay) ---
            // Ab forensic ho chuka hai, hum 4-5 seconds wait karenge taake socials load ho jayein
            setTimeout(async () => {
                try {
                    const coinData = await axios.get(`https://frontend-api.pump.fun/coins/${event.mint}`).then(r => r.data);
                    
                    const hasSocials = coinData.twitter || coinData.website || coinData.telegram;

                    if (hasSocials) {
                        sendEliteAlert(event, coinData, report);
                    } else {
                        console.log(`🌑 Skipping ${event.name}: Clean wallet but NO Socials.`);
                    }
                } catch (err) {
                    console.log(`⚠️ Metadata not ready for ${event.name}`);
                }
            }, 5000);

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

async function performDeepForensic(walletAddr) {
    try {
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "scan",
            method: "getTransactions",
            params: [walletAddr, { limit: 15 }]
        });

        const txs = response.data.result || [];
        if (txs.length === 0) return { isClean: true, source: "Brand New Wallet" };

        const fundingTx = txs[txs.length - 1];
        const desc = fundingTx.description || "";
        
        let source = "Personal Wallet";
        let isClean = false;

        const match = KNOWN_EXCHANGES.find(ex => desc.includes(ex));

        if (match) {
            source = `Verified ${match}`;
            isClean = true;
        } else if (txs.length < 6) {
            source = "Fresh Wallet (Potential CEX)";
            isClean = true;
        }

        return { isClean, source };
    } catch (e) {
        return { isClean: false, source: "Scan Error" };
    }
}

function sendEliteAlert(event, coinData, report) {
    const msg = `
🌟 <b>JUNNI'S ELITE SIGNAL (V5)</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${coinData.name} (<code>${coinData.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>FORENSIC & SOCIALS:</b>
├ <b>Dev Buy:</b> <code>${event.solAmount.toFixed(2)}</code> SOL ✅
├ <b>Funding:</b> <code>${report.source}</code>
├ <b>Twitter:</b> ${coinData.twitter ? "✅" : "❌"}
├ <b>Telegram:</b> ${coinData.telegram ? "✅" : "❌"}
└ <b>Website:</b> ${coinData.website ? "✅" : "❌"}

🛠 <b>TOOLS:</b>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a> | 📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Snipe</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
