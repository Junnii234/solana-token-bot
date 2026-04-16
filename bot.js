require('dotenv').config();
const axios = require('axios');

// Apna Helius API key yahan load ho jayega
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const KNOWN_EXCHANGES = [
    'Binance', 'OKX', 'Bybit', 'Kraken', 'MEXC', 
    'KuCoin', 'FixedFloat', 'ChangeNOW', 'Gate.io', 'Circle'
];

// 🛑 JUNNI BHAI YAHAN APNE TOKEN ADDRESSES (MINTS) DAALEIN 🛑
const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump", // Real Token example
     "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
     "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump" ,
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump" ,
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump" ,
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR" ,
    "3vvDYGkavdt1FNoUw1r5YxDTA6SrWRbHtUV72Ltkpump" 
];

async function runTest() {
    console.log("🚀 JUNNI'S FORENSIC TESTER STARTED...\n");

    for (let mint of TEST_TOKENS) {
        console.log(`🔍 Checking Token: ${mint}`);
        try {
            // 1. Pump.fun API se Token ka Dev/Creator Wallet nikalna
            const coinData = await axios.get(`https://frontend-api.pump.fun/coins/${mint}`, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Origin": "https://pump.fun",
        "Referer": "https://pump.fun/"
    }
}).then(r => r.data);

            if (!coinData || !coinData.creator) {
                console.log(`⚠️ Token data not found on Pump.fun API.\n`);
                continue;
            }

            const creatorWallet = coinData.creator;
            console.log(`   ├ Dev Wallet: ${creatorWallet}`);

            // 2. Wallet ka Forensic Run karna
            const report = await performAdvancedForensic(creatorWallet);

            // 3. Result Print karna
            const status = report.isClean ? "✅ PASS (CLEAN)" : "❌ FAIL (RUG/DIRTY)";
            console.log(`   ├ Result: ${status}`);
            console.log(`   └ Funding Source: ${report.source}\n`);

        } catch (error) {
            console.log(`   ❌ Error testing ${mint}: ${error.message}\n`);
        }
        
        // API rate limit se bachne ke liye 1 second ka gap
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log("🏁 TEST COMPLETE!");
}

async function performAdvancedForensic(walletAddr) {
    try {
        const response = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "test-scan",
            method: "getTransactions",
            params: [walletAddr, { limit: 10 }]
        });

        const txs = response.data.result || [];
        if (txs.length === 0) return { isClean: true, source: "Brand New" };

        const firstTx = txs[txs.length - 1];
        const description = firstTx.description || "";
        const sender = firstTx.nativeTransfers?.[0]?.fromUserAccount || "";

        const nameMatch = KNOWN_EXCHANGES.find(ex => description.toLowerCase().includes(ex.toLowerCase()));
        if (nameMatch) return { isClean: true, source: `Verified ${nameMatch}` };

        if (sender.startsWith("9Wz2") || sender.startsWith("66pP") || sender.startsWith("ASTy")) {
            return { isClean: true, source: "CEX Proxy Wallet (Verified)" };
        }

        if (txs.length <= 5) {
            return { isClean: true, source: "Fresh Professional Wallet" };
        }

        return { isClean: false, source: "Linked Personal Wallet (Risk)" };

    } catch (e) {
        return { isClean: false, source: "Scan Error" };
    }
}

// Test start karein
runTest();
