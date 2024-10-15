"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Enumerable = void 0;
function Enumerable(value) {
    return (target, key) => {
        Object.defineProperty(target, key, {
            get: function () {
                return undefined;
            },
            set: function (val) {
                Object.defineProperty(this, key, {
                    value: val,
                    writable: true,
                    enumerable: value,
                    configurable: true,
                });
            },
            enumerable: false,
        });
    };
}
exports.Enumerable = Enumerable;
//# sourceMappingURL=enumerable.decorator.js.map