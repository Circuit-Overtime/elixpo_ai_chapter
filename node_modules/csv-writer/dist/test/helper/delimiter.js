"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDelimiterChar = function (char) {
    if (char === ',' || char === ';')
        return char;
    if (typeof char === 'undefined')
        return ',';
    throw new Error('Invalid field delimiter');
};
//# sourceMappingURL=delimiter.js.map