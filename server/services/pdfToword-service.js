const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { Document, Packer, Paragraph, TextRun } = require("docx");

exports.convertPdfToWord = async (pdfPath) => {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);

  const lines = data.text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const doc = new Document({
    sections: [
      {
        children: lines.map(
          line =>
            new Paragraph({
              children: [new TextRun(line)],
            })
        ),
      },
    ],
  });

  const outputFileName = `converted-${Date.now()}.docx`;
  const outputPath = path.join("outputs", outputFileName);

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
};
