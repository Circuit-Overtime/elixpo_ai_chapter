"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = require("assert");
var fs_1 = require("fs");
exports.testFilePath = function (id) { return "./test-tmp/" + id + ".csv"; };
exports.assertFile = function (path, expectedContents, encoding) {
    var actualContents = fs_1.readFileSync(path, encoding || 'utf8');
    assert_1.strictEqual(actualContents, expectedContents);
};
exports.assertRejected = function (p, message) {
    return p.then(function () { return new Error('Should not have been called'); }, function (e) { assert_1.strictEqual(e.message, message); });
};
//# sourceMappingURL=helper.js.map