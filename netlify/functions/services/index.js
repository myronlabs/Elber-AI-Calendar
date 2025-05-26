"use strict";
// services/index.ts
// This file exports all services in a flat structure that can be imported consistently
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthTokenManager = exports.oauthConfigService = exports.generateVerificationToken = exports.sendPasswordResetEmail = exports.sendVerificationEmail = void 0;
__exportStar(require("./supabaseAdmin"), exports);
var emailService_1 = require("./emailService");
Object.defineProperty(exports, "sendVerificationEmail", { enumerable: true, get: function () { return emailService_1.sendVerificationEmail; } });
Object.defineProperty(exports, "sendPasswordResetEmail", { enumerable: true, get: function () { return emailService_1.sendPasswordResetEmail; } });
Object.defineProperty(exports, "generateVerificationToken", { enumerable: true, get: function () { return emailService_1.generateVerificationToken; } });
__exportStar(require("./confirmationAnalyzer"), exports);
// OAuth services - complete token management system
__exportStar(require("./errors/oauthErrors"), exports);
var oauthConfigService_1 = require("./oauthConfigService");
Object.defineProperty(exports, "oauthConfigService", { enumerable: true, get: function () { return oauthConfigService_1.oauthConfigService; } });
var oauthTokenManager_1 = require("./oauthTokenManager");
Object.defineProperty(exports, "oauthTokenManager", { enumerable: true, get: function () { return oauthTokenManager_1.oauthTokenManager; } });
// Add any additional service exports here as needed
//# sourceMappingURL=index.js.map