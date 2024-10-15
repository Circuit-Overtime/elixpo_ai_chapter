"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var csv_stringifier_factory_1 = require("./lib/csv-stringifier-factory");
var csv_writer_factory_1 = require("./lib/csv-writer-factory");
var csvStringifierFactory = new csv_stringifier_factory_1.CsvStringifierFactory();
var csvWriterFactory = new csv_writer_factory_1.CsvWriterFactory(csvStringifierFactory);
exports.createArrayCsvStringifier = function (params) {
    return csvStringifierFactory.createArrayCsvStringifier(params);
};
exports.createObjectCsvStringifier = function (params) {
    return csvStringifierFactory.createObjectCsvStringifier(params);
};
exports.createArrayCsvWriter = function (params) {
    return csvWriterFactory.createArrayCsvWriter(params);
};
exports.createObjectCsvWriter = function (params) {
    return csvWriterFactory.createObjectCsvWriter(params);
};
//# sourceMappingURL=index.js.map