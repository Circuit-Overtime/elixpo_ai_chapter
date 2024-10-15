"use strict";
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
var delimiter_1 = require("../helper/delimiter");
var index_1 = require("../../index");
var assert_1 = require("assert");
describe('ObjectCsvStringifier', function () {
    var records = [
        { FIELD_A: 'VALUE_A1', FIELD_B: 'VALUE_B1' },
        { FIELD_A: 'VALUE_A2', FIELD_B: 'VALUE_B2', OTHERS: { FIELD_C: 'VALUE_C2' } }
    ];
    describe('When field delimiter is comma', generateTestCases());
    describe('When field delimiter is semicolon', generateTestCases(';'));
    describe('When field delimiter is neither comma nor semicolon', function () {
        it('throws an exception', function () {
            assert_1.throws(function () {
                index_1.createObjectCsvStringifier({
                    header: ['FIELD_A', 'FIELD_B'],
                    fieldDelimiter: '/'
                });
            });
        });
    });
    describe('When record delimiter is neither LF nor CR+LF', function () {
        it('throws an exception', function () {
            assert_1.throws(function () {
                index_1.createObjectCsvStringifier({
                    header: ['FIELD_A', 'FIELD_B'],
                    recordDelimiter: '\r'
                });
            });
        });
    });
    describe('When records input is an iterable other than an array', function () {
        var stringifier = index_1.createObjectCsvStringifier({
            header: ['FIELD_A', 'FIELD_B']
        });
        function recordGenerator() {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, records[0]];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, records[1]];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }
        it('converts the records into CSV', function () {
            assert_1.strictEqual(stringifier.stringifyRecords(recordGenerator()), 'VALUE_A1,VALUE_B1\nVALUE_A2,VALUE_B2\n');
        });
    });
    describe('When `alwaysQuote` flag is set', function () {
        var stringifier = index_1.createObjectCsvStringifier({
            header: [
                { id: 'FIELD_A', title: 'TITLE_A' },
                { id: 'FIELD_B', title: 'TITLE_B' }
            ],
            alwaysQuote: true
        });
        it('quotes all header fields', function () {
            assert_1.strictEqual(stringifier.getHeaderString(), '"TITLE_A","TITLE_B"\n');
        });
        it('quotes all data fields', function () {
            assert_1.strictEqual(stringifier.stringifyRecords(records), '"VALUE_A1","VALUE_B1"\n"VALUE_A2","VALUE_B2"\n');
        });
    });
    describe('When `headerIdDelimiter` is set', function () {
        var stringifier = index_1.createObjectCsvStringifier({
            header: [
                { id: 'FIELD_A', title: 'TITLE_A' },
                { id: 'OTHERS/FIELD_C', title: 'TITLE_C' }
            ],
            headerIdDelimiter: '/'
        });
        it('uses the title as is', function () {
            assert_1.strictEqual(stringifier.getHeaderString(), 'TITLE_A,TITLE_C\n');
        });
        it('picks up a value in nested objects', function () {
            assert_1.strictEqual(stringifier.stringifyRecords(records), 'VALUE_A1,\nVALUE_A2,VALUE_C2\n');
        });
    });
    function generateTestCases(fieldDelimiter) {
        var delim = delimiter_1.resolveDelimiterChar(fieldDelimiter);
        return function () {
            describe('header is specified with title', function () {
                var stringifier = index_1.createObjectCsvStringifier({
                    header: [
                        { id: 'FIELD_A', title: 'TITLE_A' },
                        { id: 'FIELD_B', title: 'TITLE_B' }
                    ],
                    fieldDelimiter: fieldDelimiter
                });
                it("returns a header line with field separated by \"" + delim + "\"", function () {
                    assert_1.strictEqual(stringifier.getHeaderString(), "TITLE_A" + delim + "TITLE_B\n");
                });
                it("converts given data records into CSV lines with field separated by \"" + delim + "\"", function () {
                    assert_1.strictEqual(stringifier.stringifyRecords(records), "VALUE_A1" + delim + "VALUE_B1\nVALUE_A2" + delim + "VALUE_B2\n");
                });
            });
            describe('header is specified without title', function () {
                var stringifier = index_1.createObjectCsvStringifier({
                    header: ['FIELD_A', 'FIELD_B'],
                    fieldDelimiter: fieldDelimiter
                });
                it('returns null for header line', function () {
                    assert_1.strictEqual(stringifier.getHeaderString(), null);
                });
                it("converts given data records into CSV lines with field separated by \"" + delim + "\"", function () {
                    assert_1.strictEqual(stringifier.stringifyRecords(records), "VALUE_A1" + delim + "VALUE_B1\nVALUE_A2" + delim + "VALUE_B2\n");
                });
            });
            describe('header columns are given with reverse order', function () {
                var stringifier = index_1.createObjectCsvStringifier({
                    header: [
                        { id: 'FIELD_B', title: 'TITLE_B' },
                        { id: 'FIELD_A', title: 'TITLE_A' }
                    ],
                    fieldDelimiter: fieldDelimiter
                });
                it("layouts fields with the order of headers given with field separated by \"" + delim + "\"", function () {
                    assert_1.strictEqual(stringifier.stringifyRecords(records), "VALUE_B1" + delim + "VALUE_A1\nVALUE_B2" + delim + "VALUE_A2\n");
                });
            });
        };
    }
});
//# sourceMappingURL=object.test.js.map