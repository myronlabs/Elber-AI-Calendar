"use strict";
// backend/types/domain.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertPriority = exports.AlertStatus = exports.AlertType = void 0;
var AlertType;
(function (AlertType) {
    AlertType["UPCOMING_BIRTHDAY"] = "upcoming_birthday";
    AlertType["MEETING_REMINDER"] = "meeting_reminder";
    AlertType["TASK_DUE"] = "task_due";
    AlertType["FOLLOW_UP"] = "follow_up";
    AlertType["CUSTOM"] = "custom";
})(AlertType || (exports.AlertType = AlertType = {}));
var AlertStatus;
(function (AlertStatus) {
    AlertStatus["PENDING"] = "pending";
    AlertStatus["TRIGGERED"] = "triggered";
    AlertStatus["DISMISSED"] = "dismissed";
    AlertStatus["SNOOZED"] = "snoozed";
})(AlertStatus || (exports.AlertStatus = AlertStatus = {}));
var AlertPriority;
(function (AlertPriority) {
    AlertPriority[AlertPriority["LOW"] = 1] = "LOW";
    AlertPriority[AlertPriority["MEDIUM"] = 2] = "MEDIUM";
    AlertPriority[AlertPriority["HIGH"] = 3] = "HIGH";
})(AlertPriority || (exports.AlertPriority = AlertPriority = {}));
//# sourceMappingURL=domain.js.map