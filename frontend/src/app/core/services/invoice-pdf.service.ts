import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

import { BRANDING } from '../config/branding';
import { AccountInvoice, AccountInvoicePaymentBlock } from '../models/account.models';

interface PaymentBlockMetrics {
  bankLines: string[];
  accountLines: string[];
  ibanLines: string[];
  branchLines: string[];
  height: number;
}

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  private logoDataUrlPromise: Promise<string | null> | null = null;
  private readonly companyInfo = {
    brand: BRANDING.companyName,
    tagline: BRANDING.companyTagline,
    website: 'www.trendwavesolutions.com',
    email: 'info@trendwavesolutions.com',
    phone: '+92 315 5156702',
    location: 'Pakistan',
  };

  async downloadInvoice(invoice: AccountInvoice): Promise<void> {
    const blob = await this.buildInvoiceBlob(invoice);
    this.downloadBlob(blob, this.buildFilename(invoice));
  }

  async downloadInvoiceArchive(invoices: AccountInvoice[], archiveName = 'account-invoices'): Promise<void> {
    if (!invoices.length) {
      return;
    }

    const zip = new JSZip();

    for (const invoice of invoices) {
      const blob = await this.buildInvoiceBlob(invoice);
      zip.file(this.buildFilename(invoice), blob);
    }

    const archive = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(archive, `${archiveName.replace(/\.zip$/i, '')}.zip`);
  }

  async buildInvoiceBlob(invoice: AccountInvoice): Promise<Blob> {
    const doc = await this.buildInvoiceDocument(invoice);
    return doc.output('blob');
  }

  private async buildInvoiceDocument(invoice: AccountInvoice): Promise<jsPDF> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = 210;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;

    await this.drawHeader(doc, pageWidth);
    this.drawTopMeta(doc, invoice, margin, contentWidth);

    let cursorY = 88;
    cursorY = this.drawInvoiceTable(doc, invoice, margin, cursorY, contentWidth);
    cursorY = this.drawPaymentSection(doc, invoice, margin, cursorY + 10, contentWidth);

    if (invoice.notes) {
      cursorY = this.drawNotes(doc, invoice.notes, margin, cursorY + 8, contentWidth);
    }

    const footerY = Math.min(289, Math.max(cursorY + 10, 282));
    this.drawFooter(doc, margin, footerY, contentWidth);
    return doc;
  }

  private async drawHeader(doc: jsPDF, pageWidth: number): Promise<void> {
    doc.setFillColor(18, 59, 122);
    doc.rect(0, 0, pageWidth, 48, 'F');

    doc.setFillColor(29, 98, 189);
    doc.ellipse(177, 30, 68, 18, 'F');
    doc.setFillColor(81, 146, 229);
    doc.ellipse(170, 36, 82, 12, 'F');
    doc.setFillColor(255, 255, 255);
    doc.ellipse(104, 52, 122, 18, 'F');

    const logoDataUrl = await this.loadLogoDataUrl();
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 13, 8.5, 34, 18);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(13, 8.5, 18, 18, 4, 4, 'F');
      doc.setTextColor(20, 84, 179);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.text('TW', 22, 19.5, { align: 'center' });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text(this.companyInfo.brand, 52, 16.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(10);
    doc.text(this.companyInfo.tagline, 52, 22.6);
  }

  private drawTopMeta(
    doc: jsPDF,
    invoice: AccountInvoice,
    margin: number,
    contentWidth: number,
  ): void {
    const billWidth = 82;
    const detailWidth = contentWidth - billWidth - 8;
    const topY = 52;

    this.drawInfoBox(doc, margin, topY, billWidth, 28);
    this.drawInfoBox(doc, margin + billWidth + 8, topY, detailWidth, 28);

    doc.setTextColor(20, 84, 179);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('BILL TO', margin + 6, topY + 7.4);
    doc.text('INVOICE DETAILS', margin + billWidth + 14, topY + 7.4);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.8);
    this.drawWrapped(doc, invoice.billToName, margin + 6, topY + 17.8, billWidth - 12, 5.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.9);
    doc.text(`Month: ${invoice.invoiceMonthLabel}`, margin + billWidth + 14, topY + 16.8);
    doc.text(`Date: ${this.formatDate(invoice.invoiceDate)}`, margin + billWidth + 14, topY + 24.1);
  }

  private drawInvoiceTable(
    doc: jsPDF,
    invoice: AccountInvoice,
    margin: number,
    startY: number,
    contentWidth: number,
  ): number {
    const rows = invoice.lineItems.map((item) => {
      const title = item.title || 'Line item';
      const description = item.description || '';
      const titleLines = doc.splitTextToSize(title, 108) as string[];
      const descLines = description ? (doc.splitTextToSize(description, 108) as string[]) : [];
      const textBlockHeight = titleLines.length * 5 + descLines.length * 4.1 + 6;
      return {
        item,
        titleLines,
        descLines,
        height: Math.max(20, textBlockHeight),
      };
    });

    const headerHeight = 12;
    const totalHeight = 18;
    const bodyHeight = rows.reduce((sum, row) => sum + row.height, 0);
    const boxHeight = headerHeight + bodyHeight + totalHeight;

    doc.setDrawColor(191, 219, 254);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, startY, contentWidth, boxHeight, 4, 4, 'FD');
    doc.setFillColor(20, 84, 179);
    doc.rect(margin, startY, contentWidth, headerHeight, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DESCRIPTION', margin + 6, startY + 7.8);
    doc.text(`AMOUNT (${invoice.currency || 'USD'})`, margin + contentWidth - 6, startY + 7.8, {
      align: 'right',
    });

    let cursorY = startY + headerHeight;

    rows.forEach((row, index) => {
      if (index > 0) {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin + 6, cursorY, margin + contentWidth - 6, cursorY);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.8);
      this.drawLines(doc, row.titleLines, margin + 6, cursorY + 9, 5);

      let lineCursor = cursorY + 15;
      if (row.descLines.length) {
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        this.drawLines(doc, row.descLines, margin + 6, lineCursor, 4.2);
        lineCursor += row.descLines.length * 4.2 + 1;
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.8);
      doc.text(
        this.formatCurrency(invoice.currency, row.item.amount),
        margin + contentWidth - 6,
        cursorY + 11,
        {
          align: 'right',
        },
      );

      cursorY += row.height;
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(margin + 6, cursorY, margin + contentWidth - 6, cursorY);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, cursorY, contentWidth, totalHeight, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.8);
    doc.text('Total Net Payable', margin + 6, cursorY + 11);
    doc.setTextColor(15, 42, 95);
    doc.setFontSize(16.5);
    doc.text(
      this.formatCurrency(invoice.currency, invoice.totalNetPayable),
      margin + contentWidth - 6,
      cursorY + 11,
      {
        align: 'right',
      },
    );

    return startY + boxHeight;
  }

  private drawPaymentSection(
    doc: jsPDF,
    invoice: AccountInvoice,
    margin: number,
    startY: number,
    contentWidth: number,
  ): number {
    doc.setTextColor(20, 84, 179);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.2);
    doc.text('PAYMENT INSTRUCTIONS', margin + 16, startY);
    doc.setFillColor(81, 146, 229);
    doc.circle(margin + 7, startY - 0.8, 5.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12.6);
    doc.text('$', margin + 7, startY , { align: 'center', baseline: 'middle' });

    const cardWidth = (contentWidth - 10) / 2;
    const primary = this.measurePaymentBlock(doc, invoice.primaryPayment, cardWidth);
    const alternate = this.measurePaymentBlock(doc, invoice.alternatePayment, cardWidth);
    const cardHeight = Math.max(primary.height, alternate.height);
    const cardsY = startY + 8;

    this.drawPaymentCard(
      doc,
      invoice.primaryPayment,
      primary,
      margin,
      cardsY,
      cardWidth,
      cardHeight,
      false,
    );
    this.drawPaymentCard(
      doc,
      invoice.alternatePayment,
      alternate,
      margin + cardWidth + 10,
      cardsY,
      cardWidth,
      cardHeight,
      true,
    );

    return cardsY + cardHeight;
  }

  private drawPaymentCard(
    doc: jsPDF,
    block: AccountInvoicePaymentBlock | null,
    metrics: PaymentBlockMetrics,
    x: number,
    y: number,
    width: number,
    height: number,
    accent: boolean,
  ): void {
    if (accent) {
      doc.setDrawColor(20, 184, 166);
    } else {
      doc.setDrawColor(81, 146, 229);
    }
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, width, height, 4, 4, 'FD');

    doc.setTextColor(accent ? 13 : 20, accent ? 148 : 84, accent ? 136 : 179);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(block?.title || (accent ? 'Alternate Account' : 'Primary Account'), x + 6, y + 9);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.9);
    let cursorY = y + 17;
    this.drawLines(doc, metrics.bankLines, x + 6, cursorY, 4.5);

    cursorY += Math.max(7, metrics.bankLines.length * 4.5 + 2.5);
    cursorY = this.drawLabelValueLines(doc, 'Account No:', metrics.accountLines, x + 6, cursorY, 34, 4);
    cursorY += 3.8;
    cursorY = this.drawLabelValueLines(doc, 'IBAN:', metrics.ibanLines, x + 6, cursorY, 34, 4);
    cursorY += 3.8;
    this.drawLabelValueLines(doc, 'Branch:', metrics.branchLines, x + 6, cursorY, 34, 4);
  }

  private drawNotes(doc: jsPDF, notes: string, x: number, y: number, width: number): number {
    const lines = doc.splitTextToSize(notes, width - 12) as string[];
    const height = Math.min(26, 10 + lines.length * 4.4);

    doc.setDrawColor(191, 219, 254);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, width, height, 4, 4, 'FD');

    doc.setTextColor(20, 84, 179);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Notes', x + 6, y + 8);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    this.drawLines(doc, lines, x + 6, y + 14, 4.2);

    return y + height;
  }

  private drawFooter(doc: jsPDF, x: number, y: number, width: number): void {
    doc.setDrawColor(226, 232, 240);
    doc.line(x, y - 6, x + width, y - 6);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.text(this.companyInfo.website, x, y);
    doc.text(this.companyInfo.email, x + 52, y);
    doc.text(this.companyInfo.phone, x + 112, y);
    doc.text(this.companyInfo.location, x + width, y, { align: 'right' });
  }

  private async loadLogoDataUrl(): Promise<string | null> {
    if (!BRANDING.invoiceLogoAssetPath) {
      return null;
    }

    if (!this.logoDataUrlPromise) {
      this.logoDataUrlPromise = fetch(BRANDING.invoiceLogoAssetPath)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Could not load invoice logo.');
          }
          return response.blob();
        })
        .then(async (blob) => {
          const objectUrl = URL.createObjectURL(blob);

          try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
              const nextImage = new Image();
              nextImage.onload = () => resolve(nextImage);
              nextImage.onerror = () => reject(new Error('Could not decode invoice logo.'));
              nextImage.src = objectUrl;
            });

            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || 256;
            canvas.height = image.naturalHeight || 256;
            const context = canvas.getContext('2d');

            if (!context) {
              return null;
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png');
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        })
        .catch(() => null);
    }

    return this.logoDataUrlPromise;
  }

  private drawInfoBox(doc: jsPDF, x: number, y: number, width: number, height: number): void {
    doc.setDrawColor(191, 219, 254);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, width, height, 4, 4, 'FD');
  }

  private measurePaymentBlock(
    doc: jsPDF,
    block: AccountInvoicePaymentBlock | null,
    width: number,
  ): PaymentBlockMetrics {
    const bankLines = doc.splitTextToSize(block?.bankName || '-', width - 12) as string[];
    const accountLines = doc.splitTextToSize(block?.accountNumber || '-', Math.max(20, width - 40)) as string[];
    const ibanLines = doc.splitTextToSize(block?.iban || '-', Math.max(20, width - 40)) as string[];
    const branchLines = doc.splitTextToSize(block?.branch || '-', Math.max(20, width - 40)) as string[];

    let height = 16;
    height += Math.max(7, bankLines.length * 4.5 + 2.5);
    height += Math.max(accountLines.length * 4, 4) + 3.8;
    height += Math.max(ibanLines.length * 4, 4) + 3.8;
    height += Math.max(branchLines.length * 4, 4) + 7;

    return {
      bankLines,
      accountLines,
      ibanLines,
      branchLines,
      height: Math.max(48, height),
    };
  }

  private drawLabelValueLines(
    doc: jsPDF,
    label: string,
    lines: string[],
    x: number,
    y: number,
    valueOffset: number,
    lineHeight: number,
  ): number {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    this.drawLines(doc, lines, x + valueOffset, y, lineHeight);
    return y + Math.max(lines.length * lineHeight, lineHeight);
  }

  private drawWrapped(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void {
    if (!text) {
      return;
    }

    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    this.drawLines(doc, lines, x, y, lineHeight);
  }

  private drawLines(doc: jsPDF, lines: string[], x: number, y: number, lineHeight: number): void {
    lines.forEach((line, index) => {
      doc.text(String(line), x, y + index * lineHeight);
    });
  }

  private formatCurrency(currency: string, amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }

  private formatDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private buildFilename(invoice: AccountInvoice): string {
    const base = `${invoice.invoiceCode || 'invoice'}-${invoice.billToName || 'account'}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return `${base || 'invoice'}.pdf`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
