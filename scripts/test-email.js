#!/usr/bin/env node

/**
 * Email Testing Script
 * Tests all email templates by sending them to a test recipient
 *
 * Usage: node scripts/test-email.js
 * Set TEST_EMAIL in .env to receive test emails
 */

import dotenv from "dotenv";
import {
    sendOTPEmail,
    sendPasswordResetEmail,
    sendSigninConfirmationEmail,
    sendSignupConfirmationEmail,
} from "../src/lib/email.js";

dotenv.config();

const TEST_EMAIL = process.env.TEST_EMAIL || process.env.SMTP_FROM_EMAIL;
const RECIPIENT_NAME = "Test User";

async function runTests() {
    console.log("🧪 Email Testing Suite");
    console.log("=".repeat(60));
    console.log(`📧 Test Email: ${TEST_EMAIL}`);
    console.log("=".repeat(60));

    const testCases = [
        {
            name: "OTP Verification Email",
            fn: async () => {
                console.log("\n📮 Sending OTP email...");
                await sendOTPEmail(TEST_EMAIL, RECIPIENT_NAME, "123456");
                console.log("✅ OTP email sent successfully");
            },
        },
        {
            name: "Password Reset Email",
            fn: async () => {
                console.log("\n📮 Sending password reset email...");
                const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=test_token_12345`;
                await sendPasswordResetEmail(
                    TEST_EMAIL,
                    RECIPIENT_NAME,
                    resetLink,
                );
                console.log("✅ Password reset email sent successfully");
            },
        },
        {
            name: "Sign Up Confirmation Email",
            fn: async () => {
                console.log("\n📮 Sending signup confirmation email...");
                const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=test_verification_token`;
                await sendSignupConfirmationEmail(
                    TEST_EMAIL,
                    RECIPIENT_NAME,
                    verificationLink,
                );
                console.log("✅ Signup confirmation email sent successfully");
            },
        },
        {
            name: "Sign In Confirmation Email",
            fn: async () => {
                console.log("\n📮 Sending signin confirmation email...");
                await sendSigninConfirmationEmail(
                    TEST_EMAIL,
                    RECIPIENT_NAME,
                    "192.168.1.100",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                );
                console.log("✅ Signin confirmation email sent successfully");
            },
        },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        try {
            await testCase.fn();
            passed++;
        } catch (error) {
            failed++;
            console.error(`❌ ${testCase.name} failed:`, error);
        }

        // Small delay between emails to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch((error) => {
    console.error("💥 Test suite error:", error);
    process.exit(1);
});
