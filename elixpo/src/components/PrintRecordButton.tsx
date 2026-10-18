"use client";

import { Printer } from "lucide-react";

export function PrintRecordButton() {
  return (
    <button className="print-record-button" type="button" onClick={() => window.print()}>
      Print or save as PDF <Printer size={15} />
    </button>
  );
}
