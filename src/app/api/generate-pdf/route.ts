import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PageSizes, PDFPage } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
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

// Função para converter base64 em Blob
function base64ToBlob(base64: string, contentType: string = ''): Blob {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
}

// Função para converter base64 em File
function base64ToFile(base64: string, filename: string, contentType: string = ''): File {
  const blob = base64ToBlob(base64, contentType);
  return new File([blob], filename, { type: contentType });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const projectTitle = formData.get('projectTitle') as string || "Projeto Sem Título";
    const sponsor = formData.get('sponsor') as string || "Patrocinador";
    const coverImageFile = formData.get('coverImage') as File | null;
    const proofFiles = formData.getAll('proof_files') as File[];
    const titles = formData.getAll('titles') as string[];
    const savedItemsJson = formData.get('savedItems') as string | null;

    // Validação aprimorada para evitar o erro "Faltam arquivos de capa ou de comprovação"
    if (!coverImageFile) {
      return NextResponse.json({ error: 'Por favor, adicione uma imagem de capa.' }, { status: 400 });
    }

    // Verificar se temos itens reais (com arquivos) ou itens restaurados do localStorage
    if (!proofFiles.length && (!savedItemsJson || !savedItemsJson.trim())) {
      return NextResponse.json({ error: 'Por favor, adicione ao menos uma imagem de comprovação.' }, { status: 400 });
    }

    // Combinar os itens salvos com os novos itens
    const allProofFiles: File[] = [...proofFiles];
    const allTitles: string[] = [...titles];

    // Processar os itens salvos no localStorage
    if (savedItemsJson) {
      try {
        const savedItems = JSON.parse(savedItemsJson);
        savedItems.forEach((item: { id: string; fileBase64?: string; title: string }) => {
          // Verificar se o item já foi adicionado como novo arquivo
          const isAlreadyAdded = proofFiles.some(() => {
            // Esta verificação é simplificada - em uma implementação real, você pode querer
            // usar um ID mais robusto para verificar duplicatas
            return false;
          });

          // Se o item tem base64 e não foi adicionado como novo arquivo, adicioná-lo
          if (item.fileBase64 && !isAlreadyAdded) {
            try {
              const file = base64ToFile(item.fileBase64, `restored-${item.id}.jpg`, 'image/jpeg');
              allProofFiles.push(file);
              allTitles.push(item.title);
            } catch (e) {
              console.error('Erro ao restaurar arquivo do localStorage:', e);
            }
          }
        });
      } catch (e) {
        console.error('Erro ao processar itens salvos:', e);
      }
    }

    // Verificar se temos itens para processar (novos ou restaurados)
    // Se temos itens restaurados do localStorage, podemos prossem mesmo sem arquivos reais
    if (allProofFiles.length === 0 && (!savedItemsJson || !savedItemsJson.trim())) {
      return NextResponse.json({ error: 'Por favor, adicione ao menos uma imagem de comprovação ou verifique se há itens salvos.' }, { status: 400 });
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

    if (allProofFiles.length > 0) {
      const imagesPerRow = 3;
      const rowsPerPage = 1;
      const imagesPerPage = imagesPerRow * rowsPerPage;
      const margin = 30;
      const imageGap = 20;
      let proofPage: PDFPage | null = null;
      for (let i = 0; i < allProofFiles.length; i++) {
        const file = allProofFiles[i];
        const title = allTitles[i] || ' ';
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
    if (allTitles.filter(t => t.trim() !== '').length > 0) {
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
      const itemsPerColumn = Math.ceil(allTitles.length / numColumns);
      const columnWidth = (pageWidth - pageMargin * 2) / numColumns + 20;

      allTitles.forEach((title, i) => {
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