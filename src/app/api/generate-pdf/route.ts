import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PageSizes, PDFPage } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function processAndEmbedImage(pdfDoc: PDFDocument, imageFile: File) {
  const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
  const correctedBuffer = await sharp(originalBuffer)
    .rotate()
    .jpeg({ quality: 90 })
    .toBuffer();
  return await pdfDoc.embedJpg(correctedBuffer);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const projectTitle = formData.get('projectTitle') as string || "Projeto Sem Título";
    const sponsor = formData.get('sponsor') as string || "Patrocinador";
    const coverImageFile = formData.get('coverImage') as File;
    const proofFiles = formData.getAll('proof_files') as File[];
    const titles = formData.getAll('titles') as string[];

    if (!coverImageFile || !proofFiles.length) {
      return NextResponse.json({ error: 'Faltam arquivos de capa ou de comprovação' }, { status: 400 });
    }

    const cleanTitle = slugify(projectTitle);
    const cleanSponsor = slugify(sponsor);
    const fileName = `Comprovacao_${cleanTitle}_${cleanSponsor}.pdf`;

    const pdfDoc = await PDFDocument.create();

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const coverPage = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
    const { width, height } = coverPage.getSize();
    const coverMargin = 50;
    let currentY = height - coverMargin;
    coverPage.drawText("Comprovação de divulgação", { x: coverMargin, y: currentY, font: regularFont, size: 18, color: rgb(0.4, 0.4, 0.4) });
    currentY -= 40;
    coverPage.drawText(projectTitle, { x: coverMargin, y: currentY, font: boldFont, size: 32, color: rgb(0, 0, 0), maxWidth: width / 2 - coverMargin * 1.5, lineHeight: 36 });
    currentY -= 100;
    coverPage.drawText(sponsor, { x: coverMargin, y: currentY, font: regularFont, size: 20, color: rgb(0.2, 0.2, 0.2) });
    const signatureImagePath = path.join(process.cwd(), 'public', 'assinatura.png');
    const signatureImageBytes = await fs.readFile(signatureImagePath);
    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
    const signatureDims = signatureImage.scaleToFit(280, 90);
    const signatureY = coverMargin + 100;
    coverPage.drawImage(signatureImage, { x: coverMargin, y: signatureY, width: signatureDims.width, height: signatureDims.height });
    coverPage.drawLine({ start: { x: coverMargin, y: signatureY - 10 }, end: { x: coverMargin + signatureDims.width, y: signatureY - 10 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    coverPage.drawText("Agente Cultural responsável", { x: coverMargin, y: signatureY - 30, font: regularFont, size: 14, color: rgb(0.3, 0.3, 0.3) });
    const rightColumnX = width / 2 + 20;
    const coverImage = await processAndEmbedImage(pdfDoc, coverImageFile);
    const imgMaxHeight = height - coverMargin * 2;
    const imgMaxWidth = width - rightColumnX - coverMargin;
    const scaled = coverImage.scaleToFit(imgMaxWidth, imgMaxHeight);
    coverPage.drawImage(coverImage, { x: rightColumnX + (imgMaxWidth - scaled.width) / 2, y: coverMargin + (imgMaxHeight - scaled.height) / 2, width: scaled.width, height: scaled.height });

    if (proofFiles.length > 0) {
      const imagesPerRow = 3;
      const rowsPerPage = 1;
      const imagesPerPage = imagesPerRow * rowsPerPage;
      const margin = 30;
      const imageGap = 20;
      let proofPage: PDFPage | null = null;
      for (let i = 0; i < proofFiles.length; i++) {
        const file = proofFiles[i];
        const title = titles[i] || ' ';
        if (i % imagesPerPage === 0) {
          proofPage = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
        }
        const pageImageIndex = i % imagesPerPage;
        const rowIndex = Math.floor(pageImageIndex / imagesPerRow);
        const colIndex = pageImageIndex % imagesPerRow;
        const contentWidth = proofPage!.getWidth() - 2 * margin;
        const contentHeight = proofPage!.getHeight() - 2 * margin;
        const cellWidth = (contentWidth - (imagesPerRow - 1) * imageGap) / imagesPerRow;
        const cellHeight = (contentHeight - (rowsPerPage - 1) * imageGap) / rowsPerPage;
        const titleAreaHeight = 30;
        const maxImageHeight = cellHeight - titleAreaHeight;
        const proofImage = await processAndEmbedImage(pdfDoc, file);
        const scaledProofImg = proofImage.scaleToFit(cellWidth, maxImageHeight);
        const cellX = margin + colIndex * (cellWidth + imageGap);
        const cellY = proofPage!.getHeight() - margin - (rowIndex * (cellHeight + imageGap));
        proofPage!.drawImage(proofImage, { x: cellX + (cellWidth - scaledProofImg.width) / 2, y: cellY - scaledProofImg.height, width: scaledProofImg.width, height: scaledProofImg.height });
        const titleWidth = boldFont.widthOfTextAtSize(title, 12);
        proofPage!.drawText(title, { x: cellX + (cellWidth - titleWidth) / 2, y: cellY - cellHeight + 10, font: boldFont, size: 12, color: rgb(0.1, 0.1, 0.1) });
      }
    }

    // --- PÁGINA FINAL COM A LISTA DE LOCAIS ---
    if (titles.filter(t => t.trim() !== '').length > 0) {
      // CORREÇÃO 1: Página em modo paisagem (horizontal)
      const listPage = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
      const { width: pageWidth, height: pageHeight } = listPage.getSize();

      const pageMargin = 60;
      const listFontSize = 18;
      const listLineHeight = 40;
      // CORREÇÃO 2: Aumentando para 3 colunas para aproveitar o espaço horizontal
      const numColumns = 3;

      listPage.drawText('Locais de Divulgação Comprovados', {
        x: pageMargin,
        y: pageHeight - pageMargin,
        font: boldFont,
        size: 20,
        color: rgb(0, 0, 0),
      });

      const startY = pageHeight - pageMargin - 40;
      const itemsPerColumn = Math.ceil(titles.length / numColumns);
      const columnWidth = (pageWidth - pageMargin * 2) / numColumns + 20;

      titles.forEach((title, i) => {
        if (title.trim() === '') return;

        const columnIndex = Math.floor(i / itemsPerColumn);
        const itemIndexInColumn = i % itemsPerColumn;

        const x = pageMargin + (columnIndex * columnWidth);
        const y = startY - (itemIndexInColumn * listLineHeight);

        listPage.drawText(`• ${title}`, {
          x: x,
          y: y,
          font: regularFont,
          size: listFontSize,
          color: rgb(0.2, 0.2, 0.2),
          maxWidth: columnWidth - 20,
        });
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Suggested-Filename': fileName,
        'Access-Control-Expose-Headers': 'X-Suggested-Filename',
      },
    });

  } catch (error: unknown) {
    console.error('Erro na API de geração de PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}