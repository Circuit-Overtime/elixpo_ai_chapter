"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var delimiter_1 = require("./helper/delimiter");
var field_stringifier_1 = require("../lib/field-stringifier");
var assert_1 = require("assert");
describe('DefaultFieldStringifier', function () {
    describe('When field delimiter is comma', generateTestCases(','));
    describe('When field delimiter is semicolon', generateTestCases(';'));
    describe('When all fields needs to be quoted', function () {
        var stringifier = field_stringifier_1.createFieldStringifier(',', true);
        it('quotes a field', function () {
            assert_1.strictEqual(stringifier.stringify('VALUE'), '"VALUE"');
        });
        it('does not quote a field of value undefined', function () {
            assert_1.strictEqual(stringifier.stringify(), '');
        });
        it('does not quote a field of value null', function () {
            assert_1.strictEqual(stringifier.stringify(null), '');
        });
        it('does not quote a field of value empty string', function () {
            assert_1.strictEqual(stringifier.stringify(''), '');
        });
    });
    function generateTestCases(fieldDelimiter) {
        var delim = delimiter_1.resolveDelimiterChar(fieldDelimiter);
        return function () {
            var stringifier = field_stringifier_1.createFieldStringifier(fieldDelimiter);
            it('returns the same string', function () {
                assert_1.strictEqual(stringifier.stringify('VALUE'), 'VALUE');
            });
            it('preserves the whitespace characters', function () {
                assert_1.strictEqual(stringifier.stringify(' VALUE\tA  '), ' VALUE\tA  ');
            });
            it("wraps a field value with double quotes if the field contains \"" + delim + "\"", function () {
                assert_1.strictEqual(stringifier.stringify("VALUE" + delim + "A"), "\"VALUE" + delim + "A\"");
            });
            it('wraps a field value with double quotes if the field contains newline', function () {
                assert_1.strictEqual(stringifier.stringify('VALUE\nA'), '"VALUE\nA"');
            });
            it('wraps a field value with double quotes and escape the double quotes if they are used in the field', function () {
                assert_1.strictEqual(stringifier.stringify('VALUE"A'), '"VALUE""A"');
            });
            it('escapes double quotes even if double quotes are only on the both edges of the field', function () {
                assert_1.strictEqual(stringifier.stringify('"VALUE"'), '"""VALUE"""');
            });
            it('converts a number into a string', function () {
                assert_1.strictEqual(stringifier.stringify(1), '1');
            });
            it('converts undefined into an empty string', function () {
                assert_1.strictEqual(stringifier.stringify(), '');
            });
            it('converts null into an empty string', function () {
                assert_1.strictEqual(stringifier.stringify(null), '');
            });
            it('converts an object into toString-ed value', function () {
                var obj = {
                    name: 'OBJECT_NAME',
                    toString: function () { return "Name: " + this.name; }
                };
                assert_1.strictEqual(stringifier.stringify(obj), 'Name: OBJECT_NAME');
            });
            it("wraps a toString-ed field value with double quote if the value contains \"" + delim + "\"", function () {
                var obj = {
                    name: "OBJECT" + delim + "NAME",
                    toString: function () { return "Name: " + this.name; }
                };
                assert_1.strictEqual(stringifier.stringify(obj), "\"Name: OBJECT" + delim + "NAME\"");
            });
            it('escapes double quotes in a toString-ed field value if the value has double quotes', function () {
                var obj = {
                    name: 'OBJECT_NAME"',
                    toString: function () { return "Name: " + this.name; }
                };
                assert_1.strictEqual(stringifier.stringify(obj), '"Name: OBJECT_NAME"""');
            });
        };
    }
});
//# sourceMappingURL=field-stringifier.test.js.map