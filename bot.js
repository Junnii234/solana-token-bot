require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const KNOWN_EXCHANGES = ['Binance', 'OKX', 'Bybit', 'FixedFloat', 'MEXC', 'Kraken'];

// TEST ADDRESSES
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
    console.log("🚀 STARTING HELIUS-BASED FORENSIC TEST...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Analyzing: ${mint}`);

            // STEP 1: Get Metadata & Creator via Helius
            const response = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0",
                id: "my-id",
                method: "getAsset",
                params: { id: mint }
            });

            const asset = response.data.result;
            if (!asset) {
                console.log("   ❌ Error: Asset not found on Helius.\n");
                continue;
            }

            const creator = asset.authorities?.[0]?.address || "Unknown";
            const metadata = asset.content?.metadata || {};
            const twitter = metadata.twitter || "None";

            console.log(`   ├ Dev: ${creator}`);
            console.log(`   ├ Socials: ${twitter !== "None" ? "✅ Found" : "❌ None"}`);

            // STEP 2: Run Forensic
            const report = await performForensic(creator);
            console.log(`   └ Forensic: ${report.isClean ? "✅ PASS" : "❌ FAIL"} (${report.source})\n`);

        } catch (err) {
            console.log(`   ❌ API Error: ${err.message}\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function performForensic(walletAddr) {
    try {
        const res = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "f",
            method: "getSignaturesForAddress",
            params: [walletAddr, { limit: 10 }]
        });
        const sigs = res.data.result || [];
        
        if (sigs.length > 0 && sigs.length <= 10) {
            return { isClean: true, source: "Fresh Professional Wallet" };
        }
        return { isClean: false, source: "Linked/Old Wallet" };
    } catch (e) { return { isClean: false, source: "Scan Error" }; }
}

runTest();
