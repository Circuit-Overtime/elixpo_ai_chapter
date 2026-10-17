import jsPDF from "jspdf";
import type { DisplayMessage } from "./use-chat";

export async function exportChatAsText(messages: DisplayMessage[], fileName: string = "chat") {
  const text = messages
    .map((msg) => {
      const timestamp = new Date().toLocaleString();
      const role = msg.role === "user" ? "You" : "Assistant";
      return `[${timestamp}] ${role}:\n${msg.content}\n`;
    })
    .join("\n---\n\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadFile(blob, `${fileName}.txt`);
}

export async function exportChatAsPDF(messages: DisplayMessage[], fileName: string = "chat") {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  let yPosition = margin;

  doc.setFontSize(18);
  doc.text("Chat Export", margin, yPosition);
  yPosition += 15;

  doc.setFontSize(9);
  doc.setTextColor(128);
  doc.text(`Exported on ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 10;

  const lineHeight = 5;
  const headerHeight = 3;

  messages.forEach((msg, index) => {
    const isUser = msg.role === "user";
    const role = isUser ? "You" : "Assistant";
    const bgColor: [number, number, number] = isUser ? [230, 230, 230] : [240, 240, 240];

    // Check if we need a new page
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }

    // Message header
    doc.setFillColor(...bgColor);
    doc.rect(margin, yPosition, maxWidth, headerHeight, "F");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(`${role}: `, margin + 2, yPosition + 2.5);
    yPosition += headerHeight + 2;

    // Message content (wrapped text)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(msg.content, maxWidth - 4);
    
    lines.forEach((line: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin + 2, yPosition);
      yPosition += lineHeight;
    });

    yPosition += 3;
  });

  doc.save(`${fileName}.pdf`);
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
