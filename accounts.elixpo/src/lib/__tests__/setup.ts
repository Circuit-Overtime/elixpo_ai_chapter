import crypto from "node:crypto";

// Override encrypted SOPS variables to prevent parsing issues (e.g. NaN in parseInt)
process.env.JWT_EXPIRATION_MINUTES = "15";
process.env.REFRESH_TOKEN_EXPIRATION_DAYS = "30";
process.env.ENVIRONMENT = "test";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

// Generate a temporary Ed25519 keypair for signing/verifying JWTs in tests
const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
});

process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
