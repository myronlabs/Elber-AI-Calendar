"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
const supabase_js_1 = require("@supabase/supabase-js");
const passwordValidator_1 = require("../utils/passwordValidator");
const rateLimiter_1 = require("../services/rateLimiter");
// Create a dedicated client with explicitly disabled RLS just for verification codes
const createRlsDisabledClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error('Missing Supabase configuration');
        throw new Error('Missing Supabase configuration');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        db: {
            schema: 'public',
        },
        global: {
            headers: {
                Authorization: `Bearer ${supabaseServiceRoleKey}`
            }
        }
    });
};
const handler = async (event, _context) => {
    console.log('--- signup.ts function invoked - Custom Email Verification Flow ---');
    if (event.httpMethod !== "POST") {
        console.log("Method not allowed for signup:", event.httpMethod);
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed" }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    // Get client identifier for rate limiting (IP address)
    const clientIP = event.headers['x-forwarded-for'] ||
        event.headers['client-ip'] ||
        event.headers['x-real-ip'] ||
        'unknown';
    // Check IP rate limit first
    const ipRateLimit = await rateLimiter_1.authRateLimiter.isAllowed(clientIP, 'signup', rateLimiter_1.RATE_LIMITS.signup);
    if (!ipRateLimit.allowed) {
        console.warn(`Rate limit exceeded for IP: ${clientIP} on signup endpoint`);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (ipRateLimit.retryAfter !== undefined) {
            headers['Retry-After'] = String(ipRateLimit.retryAfter);
        }
        return {
            statusCode: 429,
            body: JSON.stringify({
                message: "Too many signup attempts. Please try again later.",
                toast: { type: "error", message: "Too many attempts. Please wait before trying again." },
                retryAfter: ipRateLimit.retryAfter
            }),
            headers,
        };
    }
    // Add progressive delay if enabled
    if (ipRateLimit.delay && ipRateLimit.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, ipRateLimit.delay));
    }
    let requestBody;
    try {
        if (!event.body) {
            console.error("Signup error: Request body is missing.");
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Request body is missing.",
                    toast: { type: "error", message: "Missing request data" }
                }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        requestBody = JSON.parse(event.body);
        console.log("Signup request body parsed:", { email: requestBody.email, firstName: requestBody.firstName });
    }
    catch (error) {
        console.error("Signup error: Failed to parse request body.", error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Invalid request body. Failed to parse JSON.",
                toast: { type: "error", message: "Invalid request format" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    const { email, password, firstName, lastName } = requestBody;
    // Add email-based rate limiting to prevent account enumeration
    if (email) {
        const emailIdentifier = email.toLowerCase().trim();
        const emailRateLimit = await rateLimiter_1.authRateLimiter.isAllowed(`email:${emailIdentifier}`, 'signup', rateLimiter_1.RATE_LIMITS.signup);
        if (!emailRateLimit.allowed) {
            console.warn(`Rate limit exceeded for email pattern on signup endpoint`);
            const headers = {
                'Content-Type': 'application/json'
            };
            if (emailRateLimit.retryAfter !== undefined) {
                headers['Retry-After'] = String(emailRateLimit.retryAfter);
            }
            return {
                statusCode: 429,
                body: JSON.stringify({
                    message: "Too many signup attempts. Please try again later.",
                    toast: { type: "error", message: "Too many attempts. Please wait before trying again." },
                    retryAfter: emailRateLimit.retryAfter
                }),
                headers,
            };
        }
        // Add progressive delay if enabled
        if (emailRateLimit.delay && emailRateLimit.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, emailRateLimit.delay));
        }
    }
    if (!email || !password || !firstName || !lastName) {
        console.error("Signup error: Missing required fields.", { email: !!email, password: !!password, firstName: !!firstName, lastName: !!lastName });
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Missing required fields: email, password, firstName, and lastName are required.",
                toast: { type: "error", message: "Please fill in all required fields" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    // Validate password strength
    const passwordStrength = (0, passwordValidator_1.validatePassword)(password);
    if (!passwordStrength.isValid) {
        console.error("Signup error: Password does not meet requirements", { feedback: passwordStrength.feedback });
        // Track failed attempt for rate limiting
        await rateLimiter_1.authRateLimiter.isAllowed(clientIP, 'signup', rateLimiter_1.RATE_LIMITS.signup, true);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Password does not meet security requirements",
                errors: passwordStrength.feedback,
                toast: { type: "error", message: "Password is too weak" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    // Check if password has been breached
    const isBreached = await (0, passwordValidator_1.checkPasswordBreach)(password);
    if (isBreached) {
        console.error("Signup error: Password has been found in a data breach");
        // Track failed attempt for rate limiting
        await rateLimiter_1.authRateLimiter.isAllowed(clientIP, 'signup', rateLimiter_1.RATE_LIMITS.signup, true);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "This password has been found in data breaches. Please choose a different password.",
                toast: { type: "error", message: "Password is not secure - found in data breaches" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    try {
        console.log(`Attempting to sign up user: ${email}`);
        const { data, error: signUpError } = await services_1.supabaseAdmin.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                },
                emailRedirectTo: "https://elber-ai.netlify.app/verify-email",
            },
        });
        if (signUpError) {
            console.error("Supabase signup error:", signUpError.message, signUpError.status);
            const errorMessage = signUpError.message || "An unknown error occurred during signup.";
            const statusCode = signUpError.status || 500;
            // Track failed attempt for rate limiting if it's a client error (4xx)
            if (statusCode >= 400 && statusCode < 500) {
                await rateLimiter_1.authRateLimiter.isAllowed(clientIP, 'signup', rateLimiter_1.RATE_LIMITS.signup, true);
            }
            return {
                statusCode: statusCode,
                body: JSON.stringify({
                    message: `Signup failed: ${errorMessage}`,
                    toast: { type: "error", message: errorMessage }
                }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (data.user) {
            console.log(`User ${data.user.id} signed up successfully (Supabase record created). Email: ${data.user.email}`);
            const verificationToken = (0, services_1.generateVerificationToken)();
            try {
                const now = new Date();
                const noRlsClient = createRlsDisabledClient();
                console.log("Using dedicated service role client for verification code insert");
                // Use the noRlsClient to update the profile to bypass RLS policies
                // Using upsert with onConflict to handle cases where the profile already exists
                const { error: profileError } = await noRlsClient
                    .from('profiles')
                    .upsert({
                    id: data.user.id,
                    first_name: firstName,
                    last_name: lastName,
                    is_custom_verified: false,
                    updated_at: now.toISOString()
                }, {
                    onConflict: 'id',
                    ignoreDuplicates: false // update the record if it exists
                });
                if (profileError) {
                    console.error(`Error creating profile for user ${data.user.id}:`, profileError);
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            message: "Server error creating user profile. Please try again later.",
                            toast: { type: "error", message: "Account creation error" }
                        }),
                    };
                }
                // Use the noRlsClient for inserting verification codes to bypass RLS policies
                const { error: verificationError } = await noRlsClient
                    .from('verification_codes')
                    .insert({
                    user_id: data.user.id,
                    email: email, // Make sure the email is included as it's required
                    code: verificationToken,
                    created_at: now.toISOString(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                });
                if (verificationError) {
                    console.error(`Error storing verification code for user ${data.user.id}:`, verificationError);
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            message: "Failed to store verification token.",
                            toast: { type: "error", message: "Error processing signup (code storage)" }
                        }),
                        headers: { 'Content-Type': 'application/json' },
                    };
                }
                else {
                    console.log(`Verification code stored successfully for user ${data.user.id}`);
                }
            }
            catch (dbError) {
                console.error(`Exception storing verification code for user ${data.user.id}:`, dbError);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        message: "Server error during verification code storage.",
                        toast: { type: "error", message: "Error processing signup (db exception)" }
                    }),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
            const emailResult = await (0, services_1.sendVerificationEmail)(email, firstName, data.user.id, verificationToken);
            if (!emailResult.success) {
                console.warn(`Resend verification email failed for user ${data.user.id}:`, emailResult.error);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: "Signup initiated. Account created, but verification email could not be sent. Please try requesting a new verification email.",
                        userId: data.user.id,
                        toast: {
                            type: "warning",
                            message: "Account created, but please request a new verification email."
                        }
                    }),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
            else {
                console.log(`Resend verification email sent successfully to ${email} for user ${data.user.id}`);
            }
            // Reset rate limiters on successful signup
            await rateLimiter_1.authRateLimiter.reset(clientIP, 'signup');
            if (email) {
                const emailIdentifier = email.toLowerCase().trim();
                await rateLimiter_1.authRateLimiter.reset(`email:${emailIdentifier}`, 'signup');
            }
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Signup initiated. Please check your email to verify your account.",
                    userId: data.user.id,
                    toast: {
                        type: "success",
                        message: "Verification email sent! Please check your inbox to complete registration."
                    }
                }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        else {
            console.warn("Supabase signup: User object was not returned from signUp, and no explicit Supabase error. This is unexpected.");
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: "Signup request processed, but user creation failed unexpectedly.",
                    toast: { type: "error", message: "Server error during user creation." }
                }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
    }
    catch (error) {
        let errorMessage = "An unexpected error occurred.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        console.error("Outer catch block error in signup handler:", errorMessage, error instanceof Error ? error.stack : undefined);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "An unexpected server error occurred.",
                toast: { type: "error", message: "Server error during signup" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=signup.js.map