const ExcelJS = require('exceljs');
const { writeOutput } = require('./output');
const { convertPdfToExcelFallback } = require('./pdfToExcel-fallback');
const { openPdf, renderPage, cropPage, extractLayout, positionedLines, joinItems, isTableLayout } = require('./pdf-layout');

// Grid coordinates are expressed in PDF points, then mapped to native Excel
// rows and columns. There are NO full-page screenshots on the editable sheet.
const COLUMN_POINTS = 18;
const ROW_POINTS = 14;
const excelWidth = points => Math.max(1, (points * 96 / 72 - 5) / 7);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const argb = hex => ({ argb: 'FF' + (hex || '000000').replace('#', '').toUpperCase() });

function setValue(cell, text) {
  // Keep identifiers with leading zeroes as strings; retain numeric precision.
  if (/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?%?$/.test(text) &&
      text.replace(/\D/g, '').length <= 15) {
    const percentage = text.endsWith('%');
    cell.value = Number(text.replace(/[, %]/g, '')) / (percentage ? 100 : 1);
    const decimals = text.match(/\.(\d+)/)?.[1].length || 0;
    cell.numFmt = (text.includes(',') ? '#,##0' : '0') +
      (decimals ? '.' + '0'.repeat(decimals) : '') +
      (percentage ? '%' : '');
  } else cell.value = text;
}

function styleText(cell, items) {
  const first = items[0];
  if (!first) return;
  cell.font = {
    name: first.font || 'Arial',
    size: Math.max(6, Math.min(72, first.size || 10)),
    bold: !!first.bold, italic: !!first.italic,
    color: argb(first.color),
  };
  cell.alignment = {
    vertical: 'middle', horizontal: 'left',
    wrapText: false, shrinkToFit: true, indent: 0,
  };
}

function createGrid(sheet, layout) {
  const columns = clamp(Math.ceil(layout.width / COLUMN_POINTS), 1, 128);
  const rows = clamp(Math.ceil(layout.height / ROW_POINTS), 1, 1000);
  for (let col = 1; col <= columns; col++)
    sheet.getColumn(col).width = excelWidth(COLUMN_POINTS);
  for (let row = 1; row <= rows; row++)
    sheet.getRow(row).height = ROW_POINTS;
  return { columns, rows };
}

function location(grid, x, y) {
  return {
    col: clamp(Math.floor(Math.max(0, x) / COLUMN_POINTS) + 1, 1, grid.columns),
    row: clamp(Math.floor(Math.max(0, y) / ROW_POINTS) + 1, 1, grid.rows),
  };
}

function range(grid, rect) {
  // Round boundaries to a shared grid line. Using floor at both ends
  // makes adjoining PDF cells claim the same Excel row/column, and then
  // later data rows silently disappear as overlapping merges.
  const left = clamp(Math.round(Math.max(0, rect.x) / COLUMN_POINTS) + 1,
    1, grid.columns);
  const top = clamp(Math.round(Math.max(0, rect.y) / ROW_POINTS) + 1,
    1, grid.rows);
  const right = clamp(Math.round(Math.max(0, rect.x + rect.width) / COLUMN_POINTS),
    left, grid.columns);
  const bottom = clamp(Math.round(Math.max(0, rect.y + rect.height) / ROW_POINTS),
    top, grid.rows);
  return { top, left, bottom, right };
}

function fillRectangles(sheet, layout, grid) {
  for (const rect of (layout.graphics?.rectangles || []).slice(0, 300)) {
    const area = range(grid, rect);
    const style = rect.stroke ? {
      style: rect.lineWidth > 1.2 ? 'medium' : 'thin',
      color: argb(rect.stroke),
    } : null;
    for (let row = area.top; row <= area.bottom; row++) {
      for (let col = area.left; col <= area.right; col++) {
        const cell = sheet.getCell(row, col);
        if (rect.fill) cell.fill = {
          type: 'pattern', pattern: 'solid', fgColor: argb(rect.fill),
        };
        if (style) {
          cell.border = {
            ...cell.border,
            ...(row === area.top ? { top: style } : {}),
            ...(row === area.bottom ? { bottom: style } : {}),
            ...(col === area.left ? { left: style } : {}),
            ...(col === area.right ? { right: style } : {}),
          };
        }
      }
    }
  }
  // PDF rules and dividers (common in designed resumes) remain Excel borders.
  for (const line of (layout.graphics?.lines || []).slice(0, 240)) {
    const horizontal = Math.abs(line.y1 - line.y2) <= 1;
    const vertical = Math.abs(line.x1 - line.x2) <= 1;
    if (!horizontal && !vertical) continue;
    const start = location(grid, Math.min(line.x1,line.x2), Math.min(line.y1,line.y2));
    const end = location(grid, Math.max(line.x1,line.x2), Math.max(line.y1,line.y2));
    const border = {
      style: line.lineWidth > 1.2 ? 'medium' : 'thin', color: argb(line.color),
    };
    if (horizontal) for (let col=start.col; col<=end.col; col++) {
      const cell = sheet.getCell(start.row, col);
      cell.border = { ...cell.border, bottom: border };
    }
    else for (let row=start.row; row<=end.row; row++) {
      const cell = sheet.getCell(row, start.col);
      cell.border = { ...cell.border, right: border };
    }
  }
}

function putEditableText(sheet, layout, grid) {
  const occupied = new Set();
  const claim = (top,left,bottom,right) => {
    for(let r=top;r<=bottom;r++)for(let c=left;c<=right;c++)
      if(occupied.has(r+':'+c))return false;
    for(let r=top;r<=bottom;r++)for(let c=left;c<=right;c++)
      occupied.add(r+':'+c);
    return true;
  };
  const makeCell = (items, rect, contents) => {
    let {top,left,bottom,right} = range(grid, rect);
    if(!claim(top,left,bottom,right))return false;
    if(bottom>top || right>left) sheet.mergeCells(top,left,bottom,right);
    const cell = sheet.getCell(top,left);
    setValue(cell, contents);
    styleText(cell, items);
    return true;
  };

  const used = new Set();
  if (isTableLayout(layout)) {
    // Real tables stay native, editable, styled Excel cells.
    for (const rect of layout.cells) {
      const items = layout.items.filter(item => item.x >= rect.x - 1 &&
        item.x < rect.x + rect.width - 1 &&
        item.y + item.size / 2 >= rect.y &&
        item.y + item.size / 2 < rect.y + rect.height);
      if (!makeCell(items,rect,joinItems(items))) continue;
      for(const item of items) used.add(item);
    }
  }

  for (const line of positionedLines(layout.items.filter(item=>!used.has(item)))) {
    for (let i=0; i<line.segments.length; i++) {
      const segment=line.segments[i], next=line.segments[i+1];
      const first = location(grid, segment.x, line.y);
      const estimated = Math.max(segment.width || 0,
        segment.text.length * (segment.size || 10) * 0.55);
      const nextX = next ? next.x : layout.width;
      const safeRight = Math.max(segment.x + COLUMN_POINTS,Math.min(
        layout.width, nextX - 1, segment.x + estimated * 1.35 + COLUMN_POINTS));
      const rowExtent = Math.max(ROW_POINTS, (segment.size || 10) * 1.2);
      const dest = {
        x: segment.x, y: line.y,
        width: safeRight - segment.x,
        height: rowExtent,
      };
      if (makeCell([segment],dest,segment.text)) continue;
      // Do not drop overlapping text; store it in the nearest unoccupied row.
      // Full original text also remains in the dedicated Text worksheet.
      let placed=false;
      for(let dr=1;dr<=4 && !placed;dr++) {
        const y=(first.row-1+dr)*ROW_POINTS;
        if(y < layout.height) placed=makeCell([segment], {...dest,y},segment.text);
      }
    }
  }
}

function addGraphics(workbook,sheet,document,rendered,layout) {
  const pageArea=layout.width*layout.height;
  for(const region of (layout.graphics?.images || []).slice(0,50)) {
    if(region.width < 5 || region.height < 5)continue;
    if(layout.items.length && region.width*region.height > pageArea*0.7)continue;
    const imageId=workbook.addImage({
      buffer:cropPage(document,rendered,region.x,region.y,region.width,region.height),
      extension:'png',
    });
    sheet.addImage(imageId,{
      tl:{ col:region.x/COLUMN_POINTS,row:region.y/ROW_POINTS },
      ext:{ width:region.width*96/72,height:region.height*96/72 },
      editAs:'oneCell',
    });
  }
}

function addTextSheet(workbook,layout,number) {
  const sheet=workbook.addWorksheet('Text '+number,{views:[{showGridLines:false}]});
  sheet.columns=[
    {header:'PDF X (pt)',key:'x',width:16},
    {header:'PDF Y (pt)',key:'y',width:16},
    {header:'Complete editable text',key:'text',width:100},
  ];
  sheet.getRow(1).font={bold:true,color:argb('FFFFFF')};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:argb('134E64')};
  const items=[...layout.items].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const item of items) {
    const row=sheet.addRow({
      x:Math.round(item.x),y:Math.round(item.y),text:item.text,
    });
    const cell=row.getCell(3);
    styleText(cell,[item]);
    cell.alignment={wrapText:true,vertical:'top',horizontal:'left'};
    row.height=Math.min(180,Math.max(19,Math.ceil(item.text.length/90)*(item.size||10)*1.5));
  }
  if(!items.length)sheet.addRow({text:'No selectable text: OCR is needed for a scanned PDF.'});
  sheet.views=[{state:'frozen',ySplit:1,showGridLines:false}];
}

function addOriginal(workbook,rendered,layout,number) {
  const sheet=workbook.addWorksheet('Original '+number,{views:[{showGridLines:false}]});
  const imageId=workbook.addImage({buffer:rendered.canvas.toBuffer('image/png'),extension:'png'});
  // An explicit reference sheet, not the default or editable sheet.
  sheet.addImage(imageId,{tl:{col:0,row:0},
    ext:{width:layout.width*96/72,height:layout.height*96/72},
    editAs:'oneCell'});
}

async function convertPdfToExcelStyled(pdfPath) {
  const document=await openPdf(pdfPath);
  const workbook=new ExcelJS.Workbook();
  try {
    for(let number=1;number<=document.numPages;number++) {
      const page=await document.getPage(number);
      try {
        const layout=await extractLayout(page);
        const rendered=await renderPage(document,page);
        try {
          const sheet=workbook.addWorksheet('Page '+number,{
            views:[{showGridLines:false}],
            pageSetup:{orientation:layout.width>layout.height?'landscape':'portrait',
              fitToPage:true,fitToWidth:1,fitToHeight:1,
              margins:{left:0.2,right:0.2,top:0.2,bottom:0.2,header:0,footer:0}},
          });
          const grid=createGrid(sheet,layout);
          fillRectangles(sheet,layout,grid);
          putEditableText(sheet,layout,grid);
          addGraphics(workbook,sheet,document,rendered,layout);
          if(!layout.items.length) {
            // Only truly scanned pages need a full-page image (and OCR).
            const id=workbook.addImage({buffer:rendered.canvas.toBuffer('image/png'),extension:'png'});
            sheet.addImage(id,{tl:{col:0,row:0},
              ext:{width:layout.width*96/72,height:layout.height*96/72},editAs:'oneCell'});
          }
          sheet.pageSetup.printArea='A1:'+sheet.getColumn(grid.columns).letter+grid.rows;
          addTextSheet(workbook,layout,number);
          addOriginal(workbook,rendered,layout,number);
        } finally { document.canvasFactory.destroy(rendered); }
      } finally { page.cleanup(); }
    }
    return writeOutput('xlsx',filename=>workbook.xlsx.writeFile(filename));
  } finally { await document.destroy(); }
};


exports.convertPdfToExcel = async (pdfPath) => {
  try {
    return await convertPdfToExcelStyled(pdfPath);
  } catch (error) {
    // Do not retry invalid/encrypted documents or resource exhaustion:
    // opening them again will only waste resources or obscure the error.
    if (['InvalidPDFException', 'PasswordException', 'MissingPDFException',
         'UnexpectedResponseException'].includes(error?.name) ||
        error?.code === 'ENOMEM' || error?.code === 'ENOSPC') throw error;
    console.error('[pdf-to-excel-styled-failed]', {
      name: error?.name, message: error?.message, stack: error?.stack,
    });
    try {
      return await convertPdfToExcelFallback(pdfPath);
    } catch (fallbackError) {
      console.error('[pdf-to-excel-fallback-failed]', {
        name: fallbackError?.name,
        message: fallbackError?.message,
        stack: fallbackError?.stack,
      });
      // Preserve the original exception, which explains why the normal path failed.
      throw error;
    }
  }
};
