import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const projectTitle = formData.get('projectTitle') as string;
    const sponsor = formData.get('sponsor') as string;
    const coverImageFile = formData.get('coverImage') as File;
    const proofFiles = formData.getAll('proof_files') as File[];
    const titles = formData.getAll('titles') as string[];

    if (!coverImageFile || !proofFiles.length) {
      return NextResponse.json({ error: 'Faltam arquivos de capa ou de comprovação' }, { status: 400 });
    }

    const signatureImagePath = path.join(process.cwd(), 'public', 'assinatura.png');
    const signatureImageBytes = await fs.readFile(signatureImagePath);

    const pdfDoc = await PDFDocument.create();

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const coverPage = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
    const { width, height } = coverPage.getSize();
    const margin = 50;
    const midPointX = width / 2;

    const leftColumnX = margin;
    let currentY = height - margin;

    const secondaryHeader = "Comprovação de divulgação";
    coverPage.drawText(secondaryHeader, {
      x: leftColumnX,
      y: currentY,
      font: regularFont,
      size: 18,
      color: rgb(0.4, 0.4, 0.4),
    });
    currentY -= 40;

    coverPage.drawText(projectTitle, {
      x: leftColumnX,
      y: currentY,
      font: boldFont,
      size: 32,
      color: rgb(0, 0, 0),
      maxWidth: midPointX - margin * 1.5,
      lineHeight: 36,
    });
    currentY -= 100;

    coverPage.drawText(sponsor, {
      x: leftColumnX,
      y: currentY,
      font: regularFont,
      size: 20,
      color: rgb(0.2, 0.2, 0.2),
    });
    
    // CORREÇÃO 1: 'let' alterado para 'const'
    const signatureY = margin + 100;
    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
    const signatureDims = signatureImage.scaleToFit(280, 90); 

    coverPage.drawImage(signatureImage, {
      x: leftColumnX,
      y: signatureY,
      width: signatureDims.width,
      height: signatureDims.height,
    });
    
    coverPage.drawLine({
        start: { x: leftColumnX, y: signatureY - 10 },
        end: { x: leftColumnX + signatureDims.width, y: signatureY - 10 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
    });

    const fixedRole = "Agente Cultural responsavel";
    coverPage.drawText(fixedRole, {
      x: leftColumnX,
      y: signatureY - 30,
      font: regularFont,
      size: 14,
      color: rgb(0.3, 0.3, 0.3),
    });

    const rightColumnX = midPointX + 20;
    const coverImageBytes = await coverImageFile.arrayBuffer();
    const coverImage = coverImageFile.type === 'image/png' 
        ? await pdfDoc.embedPng(coverImageBytes) 
        : await pdfDoc.embedJpg(coverImageBytes);

    const imgMaxHeight = height - margin * 2;
    const imgMaxWidth = width - rightColumnX - margin;
    const scaled = coverImage.scaleToFit(imgMaxWidth, imgMaxHeight);

    coverPage.drawImage(coverImage, {
      x: rightColumnX + (imgMaxWidth - scaled.width) / 2,
      y: margin + (imgMaxHeight - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
    
    if (proofFiles.length > 0) {
      const imagesPerRow = 3;
      const imageGap = 20;
      const contentWidth = width - 2 * margin;
      const imageWidth = (contentWidth - (imagesPerRow - 1) * imageGap) / imagesPerRow;
      
      let proofPage: import('pdf-lib').PDFPage;

      for (let i = 0; i < proofFiles.length; i++) {
        const file = proofFiles[i];
        const title = titles[i];
        
        const colIndex = i % imagesPerRow;

        if (i % imagesPerRow === 0) {
          proofPage = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
        }
        
        const maxProofImageHeight = height - margin * 2 - 40;

        const proofImageBytes = await file.arrayBuffer();
        const proofImage = file.type === 'image/png' 
          ? await pdfDoc.embedPng(proofImageBytes) 
          : await pdfDoc.embedJpg(proofImageBytes);
        
        const scaledProofImg = proofImage.scaleToFit(imageWidth, maxProofImageHeight);
        
        const xPosition = margin + colIndex * (imageWidth + imageGap);
        const yPosition = height - margin - scaledProofImg.height;

        proofPage!.drawImage(proofImage, {
          x: xPosition + (imageWidth - scaledProofImg.width) / 2,
          y: yPosition,
          width: scaledProofImg.width,
          height: scaledProofImg.height,
        });

        const titleWidth = regularFont.widthOfTextAtSize(title, 12);
        proofPage!.drawText(title, {
          x: xPosition + (imageWidth - titleWidth) / 2,
          y: yPosition - 20,
          font: regularFont,
          size: 12,
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="comprovacao.pdf"` },
    });

  } catch (error: unknown) { // CORREÇÃO 2: 'any' alterado para 'unknown'
    let errorMessage = 'Erro interno do servidor.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    console.error('Erro na API:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}