require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump",
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump",
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump",
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR",
    "3vvDYGkavdt1FNoUw1r5YxDTA6SrWRbHtUV72Ltkpump"
];

async function runTest() {
    console.log("🚀 STARTING FINAL REPAIRED TEST...\n");

    for (let mint of TEST_TOKENS) {
        try {
            const res = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: "f",
                method: "getAsset",
                params: { id: mint }
            });

            const asset = res.data.result;
            if (!asset) {
                console.log(`❌ Token ${mint} not found.\n`);
                continue;
            }

            // --- 🔎 FIX 1: FINDING THE TRUE CREATOR ---
            // Helius creators array mein aksar pehla address hi real dev hota hai
            const creatorData = asset.creators?.find(c => c.share > 0) || asset.creators?.[0];
            const creator = creatorData ? creatorData.address : "Unknown";

            // --- 🔗 FIX 2: FINDING SOCIALS (Deep Scan) ---
            // Socials kabhi content.links mein hote hain, kabhi attributes mein
            const metadataStr = JSON.stringify(asset.content?.metadata || {}).toLowerCase();
            const hasSocials = metadataStr.includes("twitter") || 
                               metadataStr.includes("t.me") || 
                               metadataStr.includes("http");

            console.log(`🔍 Mint: ${mint}`);
            console.log(`   ├ Dev Address: ${creator}`);
            console.log(`   ├ Socials: ${hasSocials ? "✅ Found" : "❌ None"}`);

            if (creator === "Unknown") {
                console.log(`   └ Result: ❌ REJECTED (Unknown Dev)\n`);
                continue;
            }

            // --- 🛡️ STEP 2: FORENSIC ---
            const forensic = await performForensic(creator);
            const status = (hasSocials && forensic.isClean) ? "🌟 ELITE PASS" : "❌ REJECTED";
            
            console.log(`   └ Forensic: ${status} (${forensic.source})\n`);

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function performForensic(walletAddr) {
    try {
        const res = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "s",
            method: "getSignaturesForAddress",
            params: [walletAddr, { limit: 20 }]
        });
        const sigs = res.data.result || [];
        
        // Elite Devs: 1-12 transactions (Binance to Pump.fun flow)
        if (sigs.length > 0 && sigs.length <= 12) {
            return { isClean: true, source: "Fresh/Elite" };
        }
        return { isClean: false, source: `Dirty (${sigs.length} TXs)` };
    } catch (e) { return { isClean: false, source: "Scan Fail" }; }
}

runTest();
