require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIG ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUMP_WS_URL = 'wss://pumpportal.fun/api/data';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();

// Professional Sources List
const KNOWN_EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Coinbase', 'FixedFloat', 'ChangeNOW', 'Circle', 'Gate.io'];

function startListening() {
    const ws = new WebSocket(PUMP_WS_URL);

    ws.on('open', () => {
        console.log('💎 JUNNI ELITE SNIPER: Forensic + Socials Active');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alerted.has(event.mint)) return;

            // 1. Min 1.0 SOL Dev Buy Requirement
            if (event.solAmount < 1.0) return;

            // 2. WAIT 6 SECONDS (For metadata & on-chain settlement)
            setTimeout(async () => {
                try {
                    // Fetch Socials from Pump.fun API
                    const coinData = await axios.get(`https://frontend-api.pump.fun/coins/${event.mint}`).then(r => r.data);
                    
                    // SOCIALS CHECK (At least one must exist)
                    const hasSocials = coinData.twitter || coinData.website || coinData.telegram;
                    if (!hasSocials) {
                        console.log(`🌑 Skipping ${event.name}: No Block-0 Socials.`);
                        return;
                    }

                    // 3. DEEP FUNDING FORENSIC
                    const report = await performDeepForensic(event.traderPublicKey);

                    // AGAR FUNDING DIRTY HAI, TO REJECT
                    if (!report.isClean) {
                        console.log(`❌ BLOCKED: Dirty/Personal Funding for ${event.name}`);
                        return;
                    }

                    // 4. ALL CLEAR -> SEND ALERT
                    alerted.add(event.mint);
                    sendEliteAlert(event, coinData, report);

                } catch (err) { console.log("Processing error or token not found yet."); }
            }, 6000);

        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startListening, 2000));
}

async function performDeepForensic(walletAddr) {
    try {
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "scan",
            method: "getTransactions",
            params: [walletAddr, { limit: 20 }]
        });

        const txs = response.data.result || [];
        if (txs.length === 0) return { isClean: true, source: "Brand New Wallet" };

        // Sab se purani (First) transaction dekhna
        const fundingTx = txs[txs.length - 1];
        const desc = fundingTx.description || "";
        
        let source = "Personal Wallet";
        let isClean = false;

        // Check if description matches our exchange list
        const match = KNOWN_EXCHANGES.find(ex => desc.includes(ex));

        if (match) {
            source = `Verified ${match}`;
            isClean = true;
        } else if (txs.length < 6) {
            // Likely fresh CEX withdrawal (No heavy history)
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
🌟 <b>JUNNI'S ELITE PICK</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${coinData.name} (<code>${coinData.symbol}</code>)
<b>Mint:</b> <code>${event.mint}</code>

📊 <b>FORENSIC & SOCIALS:</b>
├ <b>Dev Buy:</b> <code>${event.solAmount.toFixed(2)}</code> SOL ✅
├ <b>Funding:</b> <code>${report.source}</code>
├ <b>Twitter:</b> ${coinData.twitter ? "✅" : "❌"}
├ <b>Telegram:</b> ${coinData.telegram ? "✅" : "❌"}
└ <b>Website:</b> ${coinData.website ? "✅" : "❌"}

🛠 <b>LINKS:</b>
📊 <a href="https://dexscreener.com/solana/${event.mint}"><b>DexScreener</b></a> | 📦 <a href="https://rugcheck.xyz/tokens/${event.mint}"><b>RugCheck</b></a>

💰 <b>TRADE:</b>
⚡ <a href="https://bullx.io/terminal?chain=solana&address=${event.mint}"><b>BullX Snipe</b></a>
    `;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

startListening();
