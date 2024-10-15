"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var csv_writer_1 = require("./csv-writer");
var CsvWriterFactory = /** @class */ (function () {
    function CsvWriterFactory(csvStringifierFactory) {
        this.csvStringifierFactory = csvStringifierFactory;
    }
    CsvWriterFactory.prototype.createArrayCsvWriter = function (params) {
        var csvStringifier = this.csvStringifierFactory.createArrayCsvStringifier({
            header: params.header,
            fieldDelimiter: params.fieldDelimiter,
            recordDelimiter: params.recordDelimiter,
            alwaysQuote: params.alwaysQuote
        });
        return new csv_writer_1.CsvWriter(csvStringifier, params.path, params.encoding, params.append);
    };
    CsvWriterFactory.prototype.createObjectCsvWriter = function (params) {
        var csvStringifier = this.csvStringifierFactory.createObjectCsvStringifier({
            header: params.header,
            fieldDelimiter: params.fieldDelimiter,
            recordDelimiter: params.recordDelimiter,
            headerIdDelimiter: params.headerIdDelimiter,
            alwaysQuote: params.alwaysQuote
        });
        return new csv_writer_1.CsvWriter(csvStringifier, params.path, params.encoding, params.append);
    };
    return CsvWriterFactory;
}());
exports.CsvWriterFactory = CsvWriterFactory;
//# sourceMappingURL=csv-writer-factory.js.map