"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var helper_1 = require("./helper");
var fs_1 = require("fs");
var index_1 = require("../index");
describe('Write object records into CSV', function () {
    var makeFilePath = function (id) { return helper_1.testFilePath("object-" + id); };
    var records = [
        { name: 'Bob', lang: 'French', address: { country: 'France' } },
        { name: 'Mary', lang: 'English' }
    ];
    describe('When only path and header ids are given', function () {
        var filePath = makeFilePath('minimum');
        var writer;
        beforeEach(function () {
            writer = index_1.createObjectCsvWriter({
                path: filePath,
                header: ['name', 'lang']
            });
        });
        it('writes records to a new file', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'Bob,French\nMary,English\n');
                        return [2 /*return*/];
                }
            });
        }); });
        it('appends records when requested to write to the same file', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords([records[0]])];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, writer.writeRecords([records[1]])];
                    case 2:
                        _a.sent();
                        helper_1.assertFile(filePath, 'Bob,French\nMary,English\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When header ids are given with reverse order', function () {
        var filePath = makeFilePath('column-order');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: ['lang', 'name']
        });
        it('also writes columns with reverse order', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'French,Bob\nEnglish,Mary\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When field header is given with titles', function () {
        var filePath = makeFilePath('header');
        var writer;
        beforeEach(function () {
            writer = index_1.createObjectCsvWriter({
                path: filePath,
                header: [{ id: 'name', title: 'NAME' }, { id: 'lang', title: 'LANGUAGE' }]
            });
        });
        it('writes a header', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'NAME,LANGUAGE\nBob,French\nMary,English\n');
                        return [2 /*return*/];
                }
            });
        }); });
        it('appends records without headers', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords([records[0]])];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, writer.writeRecords([records[1]])];
                    case 2:
                        _a.sent();
                        helper_1.assertFile(filePath, 'NAME,LANGUAGE\nBob,French\nMary,English\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When `append` flag is specified', function () {
        var filePath = makeFilePath('append');
        fs_1.writeFileSync(filePath, 'Mike,German\n', 'utf8');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: ['name', 'lang'],
            append: true
        });
        it('do not overwrite the existing contents and appends records to them', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords([records[1]])];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'Mike,German\nMary,English\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When encoding is specified', function () {
        var filePath = makeFilePath('encoding');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: ['name', 'lang'],
            encoding: 'utf16le'
        });
        it('writes to a file with the specified encoding', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'Bob,French\nMary,English\n', 'utf16le');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When semicolon is specified as a field delimiter', function () {
        var filePath = makeFilePath('field-delimiter');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: [{ id: 'name', title: 'NAME' }, { id: 'lang', title: 'LANGUAGE' }],
            fieldDelimiter: ';'
        });
        it('uses semicolon instead of comma to separate fields', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'NAME;LANGUAGE\nBob;French\nMary;English\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When newline is specified', function () {
        var filePath = makeFilePath('newline');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: ['name', 'lang'],
            recordDelimiter: '\r\n'
        });
        it('writes to a file with the specified newline character', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'Bob,French\r\nMary,English\r\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When `alwaysQuote` flag is set', function () {
        var filePath = makeFilePath('always-quote');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: [{ id: 'name', title: 'NAME' }, { id: 'lang', title: 'LANGUAGE' }],
            alwaysQuote: true
        });
        it('quotes all fields', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, '"NAME","LANGUAGE"\n"Bob","French"\n"Mary","English"\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('When `headerIdDelimiter` flag is set', function () {
        var filePath = makeFilePath('nested');
        var writer = index_1.createObjectCsvWriter({
            path: filePath,
            header: [{ id: 'name', title: 'NAME' }, { id: 'address.country', title: 'COUNTRY' }],
            headerIdDelimiter: '.'
        });
        it('breaks keys into key paths', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, writer.writeRecords(records)];
                    case 1:
                        _a.sent();
                        helper_1.assertFile(filePath, 'NAME,COUNTRY\nBob,France\nMary,\n');
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
//# sourceMappingURL=write-object-records.test.js.map