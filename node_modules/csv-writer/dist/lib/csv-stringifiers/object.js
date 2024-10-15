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
var object_1 = require("../lang/object");
var ObjectCsvStringifier = /** @class */ (function (_super) {
    __extends(ObjectCsvStringifier, _super);
    function ObjectCsvStringifier(fieldStringifier, header, recordDelimiter, headerIdDelimiter) {
        var _this = _super.call(this, fieldStringifier, recordDelimiter) || this;
        _this.header = header;
        _this.headerIdDelimiter = headerIdDelimiter;
        return _this;
    }
    ObjectCsvStringifier.prototype.getHeaderRecord = function () {
        if (!this.isObjectHeader)
            return null;
        return this.header.map(function (field) { return field.title; });
    };
    ObjectCsvStringifier.prototype.getRecordAsArray = function (record) {
        var _this = this;
        return this.fieldIds.map(function (fieldId) { return _this.getNestedValue(record, fieldId); });
    };
    ObjectCsvStringifier.prototype.getNestedValue = function (obj, key) {
        if (!this.headerIdDelimiter)
            return obj[key];
        return key.split(this.headerIdDelimiter).reduce(function (subObj, keyPart) { return (subObj || {})[keyPart]; }, obj);
    };
    Object.defineProperty(ObjectCsvStringifier.prototype, "fieldIds", {
        get: function () {
            return this.isObjectHeader ? this.header.map(function (column) { return column.id; }) : this.header;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ObjectCsvStringifier.prototype, "isObjectHeader", {
        get: function () {
            return object_1.isObject(this.header && this.header[0]);
        },
        enumerable: true,
        configurable: true
    });
    return ObjectCsvStringifier;
}(abstract_1.CsvStringifier));
exports.ObjectCsvStringifier = ObjectCsvStringifier;
//# sourceMappingURL=object.js.map