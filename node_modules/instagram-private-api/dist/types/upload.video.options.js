"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEGMENT_DIVIDERS = void 0;
exports.SEGMENT_DIVIDERS = {
    totalSections(numSections) {
        return ({ buffer }) => {
            const sections = [];
            const sectionSize = Math.floor(buffer.byteLength / numSections);
            for (let i = 0; i < numSections - 1; i++) {
                sections.push(buffer.slice(i * sectionSize, Math.min((i + 1) * sectionSize, buffer.byteLength)));
            }
            sections.push(buffer.slice(sectionSize * (numSections - 1)));
            return sections;
        };
    },
    sectionSize(sectionSize) {
        return ({ buffer }) => {
            const sections = [];
            for (let i = 0; i < buffer.byteLength;) {
                const section = buffer.slice(i, Math.min(i + sectionSize, buffer.byteLength));
                sections.push(section);
                i += section.byteLength;
            }
            return sections;
        };
    },
};
//# sourceMappingURL=upload.video.options.js.map