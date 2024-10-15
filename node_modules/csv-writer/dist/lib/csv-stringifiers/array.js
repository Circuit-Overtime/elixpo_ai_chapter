"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var abstract_1 = require("./abstract");
var ArrayCsvStringifier = /** @class */ (function (_super) {
    __extends(ArrayCsvStringifier, _super);
    function ArrayCsvStringifier(fieldStringifier, recordDelimiter, header) {
        var _this = _super.call(this, fieldStringifier, recordDelimiter) || this;
        _this.header = header;
        return _this;
    }
    ArrayCsvStringifier.prototype.getHeaderRecord = function () {
        return this.header;
    };
    ArrayCsvStringifier.prototype.getRecordAsArray = function (record) {
        return record;
    };
    return ArrayCsvStringifier;
}(abstract_1.CsvStringifier));
exports.ArrayCsvStringifier = ArrayCsvStringifier;
//# sourceMappingURL=array.js.map