"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var array_1 = require("./csv-stringifiers/array");
var field_stringifier_1 = require("./field-stringifier");
var object_1 = require("./csv-stringifiers/object");
var CsvStringifierFactory = /** @class */ (function () {
    function CsvStringifierFactory() {
    }
    CsvStringifierFactory.prototype.createArrayCsvStringifier = function (params) {
        var fieldStringifier = field_stringifier_1.createFieldStringifier(params.fieldDelimiter, params.alwaysQuote);
        return new array_1.ArrayCsvStringifier(fieldStringifier, params.recordDelimiter, params.header);
    };
    CsvStringifierFactory.prototype.createObjectCsvStringifier = function (params) {
        var fieldStringifier = field_stringifier_1.createFieldStringifier(params.fieldDelimiter, params.alwaysQuote);
        return new object_1.ObjectCsvStringifier(fieldStringifier, params.header, params.recordDelimiter, params.headerIdDelimiter);
    };
    return CsvStringifierFactory;
}());
exports.CsvStringifierFactory = CsvStringifierFactory;
//# sourceMappingURL=csv-stringifier-factory.js.map