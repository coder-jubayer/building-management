import PDFDocument from 'pdfkit';
import { Writable } from 'stream';

const PAGE_MARGIN = 42;
const TEXT = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const LINE_SOFT = '#F1F5F9';
const ACCENT = '#4F46E5';
const ACCENT_SOFT = '#EEF2FF';
const SUCCESS = '#059669';
const DANGER = '#E11D48';
const SURFACE = '#F8FAFC';
const FOOTER_HEIGHT = 24;

export type BuildingReportRole = 'building_admin' | 'committee' | 'guard' | 'resident';

export const BUILDING_REPORT_ROLE_LABELS: Record<BuildingReportRole, string> = {
  building_admin: 'Building Admin',
  committee: 'Committee',
  guard: 'Security Guard',
  resident: 'Resident',
};

export interface BuildingReportPerson {
  name: string;
  email?: string;
  phone?: string;
  unitNumber?: string;
  role: BuildingReportRole | string;
  isActive: boolean;
}

export interface BuildingReportBuilding {
  name: string;
  code: string;
  isActive: boolean;
  people: BuildingReportPerson[];
}

export interface BuildingReportData {
  generatedBy: string;
  roles: BuildingReportRole[];
  buildings: BuildingReportBuilding[];
}

type Doc = PDFKit.PDFDocument;

interface Column {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function contentWidth(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

/** Keep clear of the footer band so PDFKit never auto-spawns a blank page. */
function bottomLimit(doc: Doc): number {
  return doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
}

function fitToWidth(doc: Doc, value: string, width: number): string {
  const text = (value || '—').trim() || '—';
  if (doc.widthOfString(text) <= width) return text;
  let clipped = text;
  while (clipped.length > 1 && doc.widthOfString(`${clipped}…`) > width) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
}

function startNewPage(doc: Doc): void {
  doc.addPage();
  drawAccentBar(doc);
  doc.x = PAGE_MARGIN;
  doc.y = PAGE_MARGIN + 10;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > bottomLimit(doc)) {
    startNewPage(doc);
  }
}

function drawAccentBar(doc: Doc): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
  doc.restore();
}

function summaryTile(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  doc.save();
  doc.roundedRect(x, y, width, 58, 10).fill(SURFACE);
  doc.roundedRect(x, y, 4, 58, 2).fill(ACCENT);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 14, y + 12, {
    width: width - 24,
    lineBreak: false,
  });
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(16).text(value, x + 14, y + 28, {
    width: width - 24,
    lineBreak: false,
  });
  doc.restore();
}

function countByRole(data: BuildingReportData): Record<BuildingReportRole, number> {
  const counts = {
    building_admin: 0,
    committee: 0,
    guard: 0,
    resident: 0,
  } as Record<BuildingReportRole, number>;

  for (const building of data.buildings) {
    for (const person of building.people) {
      if (person.role in counts) {
        counts[person.role as BuildingReportRole] += 1;
      }
    }
  }
  return counts;
}

function drawTableHeader(doc: Doc, columns: Column[]): void {
  const y = doc.y;
  const width = contentWidth(doc);
  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, width, 24, 6).fill(ACCENT_SOFT);

  let x = PAGE_MARGIN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(ACCENT);
  columns.forEach((column) => {
    doc.text(column.label.toUpperCase(), x + 8, y + 8, {
      width: column.width - 12,
      align: column.align ?? 'left',
      lineBreak: false,
    });
    x += column.width;
  });
  doc.restore();
  doc.y = y + 28;
}

function drawPeopleTable(doc: Doc, people: BuildingReportPerson[]): void {
  const columns: Column[] = [
    { label: '#', width: 28, align: 'center' },
    { label: 'Name', width: 128 },
    { label: 'Email', width: 148 },
    { label: 'Phone', width: 98 },
    { label: 'Unit', width: 52, align: 'center' },
    { label: 'Status', width: 61, align: 'center' },
  ];
  const rowHeight = 22;

  const paintHeader = () => drawTableHeader(doc, columns);
  paintHeader();

  people.forEach((person, index) => {
    if (doc.y + rowHeight > bottomLimit(doc)) {
      startNewPage(doc);
      paintHeader();
    }

    const y = doc.y;
    doc.save();
    if (index % 2 === 1) {
      doc.rect(PAGE_MARGIN, y, contentWidth(doc), rowHeight).fill(LINE_SOFT);
    }

    const values = [
      String(index + 1),
      person.name || '—',
      person.email || '—',
      person.phone || '—',
      person.unitNumber || '—',
      person.isActive ? 'Active' : 'Inactive',
    ];

    let x = PAGE_MARGIN;
    columns.forEach((column, colIndex) => {
      const isStatus = colIndex === columns.length - 1;
      if (isStatus) {
        doc.fillColor(person.isActive ? SUCCESS : DANGER).font('Helvetica-Bold').fontSize(9);
      } else {
        doc
          .fillColor(TEXT)
          .font(colIndex === 1 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9);
      }
      doc.text(fitToWidth(doc, values[colIndex], column.width - 12), x + 8, y + 6, {
        width: column.width - 12,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    });

    doc
      .moveTo(PAGE_MARGIN, y + rowHeight)
      .lineTo(PAGE_MARGIN + contentWidth(doc), y + rowHeight)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
    doc.restore();

    doc.y = y + rowHeight;
  });
}

function drawBuildingHeader(doc: Doc, building: BuildingReportBuilding, index: number): void {
  ensureSpace(doc, 110);
  const y = doc.y;
  const width = contentWidth(doc);

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, width, 46, 10).fill(TEXT);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(`${index}.  ${building.name}`, PAGE_MARGIN + 14, y + 10, {
      width: width - 140,
      lineBreak: false,
    });
  doc
    .fillColor('#CBD5E1')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `Code ${building.code}   ·   ${building.people.length} selected users`,
      PAGE_MARGIN + 14,
      y + 27,
      { width: width - 140, lineBreak: false },
    );

  const status = building.isActive ? 'ACTIVE' : 'INACTIVE';
  const statusWidth = 72;
  const statusX = PAGE_MARGIN + width - statusWidth - 12;
  doc.roundedRect(statusX, y + 13, statusWidth, 20, 10).fill(building.isActive ? SUCCESS : DANGER);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(status, statusX, y + 18, { width: statusWidth, align: 'center', lineBreak: false });
  doc.restore();

  doc.y = y + 58;
}

function drawRoleHeader(doc: Doc, role: BuildingReportRole, count: number): void {
  ensureSpace(doc, 80);
  const y = doc.y;
  doc.save();
  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .text(BUILDING_REPORT_ROLE_LABELS[role], PAGE_MARGIN, y, {
      continued: true,
      lineBreak: false,
    });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9.5)
    .text(`   ${count} ${count === 1 ? 'person' : 'people'}`, { lineBreak: false });
  doc
    .moveTo(PAGE_MARGIN, y + 16)
    .lineTo(PAGE_MARGIN + contentWidth(doc), y + 16)
    .strokeColor(ACCENT)
    .lineWidth(1)
    .stroke();
  doc.restore();
  doc.y = y + 24;
}

/** Page numbers must not use normal flow text — that creates trailing blank pages. */
function stampPageNumbers(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);

    // Disable margin page-break checks while stamping the footer.
    const margins = doc.page.margins;
    const previousBottom = margins.bottom;
    margins.bottom = 0;

    doc.save();
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Barighorr Admin  ·  Page ${i + 1} of ${range.count}`,
        PAGE_MARGIN,
        doc.page.height - 22,
        {
          width: contentWidth(doc),
          align: 'center',
          lineBreak: false,
        },
      );
    doc.restore();

    margins.bottom = previousBottom;
  }
}

export function buildingReportFilename(scope: string): string {
  const safe = scope.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10);
  return `buildings-report-${safe || 'all'}-${stamp}.pdf`;
}

export function writeBuildingReport(target: Writable, data: BuildingReportData): void {
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_MARGIN + FOOTER_HEIGHT,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    bufferPages: true,
    autoFirstPage: true,
  });
  doc.pipe(target);

  const generatedOn = new Date().toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const roleCounts = countByRole(data);
  const totalPeople = data.buildings.reduce((sum, building) => sum + building.people.length, 0);

  drawAccentBar(doc);

  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('Barighorr', PAGE_MARGIN, PAGE_MARGIN + 10, { lineBreak: false });
  doc.y = PAGE_MARGIN + 36;
  doc
    .fillColor(TEXT)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text('Buildings Directory Report', PAGE_MARGIN, doc.y, { lineBreak: false });
  doc.y += 20;
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9.5)
    .text(`Prepared by ${data.generatedBy}  ·  ${generatedOn}`, PAGE_MARGIN, doc.y, {
      lineBreak: false,
    });
  doc.y += 16;

  const included = data.roles.map((role) => BUILDING_REPORT_ROLE_LABELS[role]).join('  ·  ');
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(`Included roles: ${included || 'None'}`, PAGE_MARGIN, doc.y, { lineBreak: false });
  doc.y += 22;

  const tiles: Array<[string, string]> = [
    ['Buildings', String(data.buildings.length)],
    ['People listed', String(totalPeople)],
  ];
  if (data.roles.includes('building_admin')) {
    tiles.push(['Building admins', String(roleCounts.building_admin)]);
  }
  if (data.roles.includes('resident')) {
    tiles.push(['Residents', String(roleCounts.resident)]);
  }

  const gap = 10;
  const tileWidth = (contentWidth(doc) - gap * (tiles.length - 1)) / tiles.length;
  const tileY = doc.y;
  tiles.forEach(([label, value], index) => {
    summaryTile(doc, PAGE_MARGIN + index * (tileWidth + gap), tileY, tileWidth, label, value);
  });
  doc.y = tileY + 72;

  if (!data.buildings.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('No buildings matched this report.');
  } else {
    const buildingsToRender = data.buildings.filter(
      (building) => building.people.length > 0 || data.buildings.length === 1,
    );

    buildingsToRender.forEach((building, buildingIndex) => {
      // Keep buildings flowing on the same page when there is room.
      // Only break when the next building header would not fit cleanly.
      if (buildingIndex > 0) {
        ensureSpace(doc, 120);
        doc.y += 8;
      }

      drawBuildingHeader(doc, building, buildingIndex + 1);

      if (!building.people.length) {
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(10)
          .text('No users for the selected roles in this building.', PAGE_MARGIN, doc.y, {
            lineBreak: false,
          });
        doc.y += 18;
        return;
      }

      for (const role of data.roles) {
        const people = building.people
          .filter((person) => person.role === role)
          .sort((a, b) => {
            const unitCompare = (a.unitNumber || '').localeCompare(b.unitNumber || '', undefined, {
              numeric: true,
            });
            if (unitCompare !== 0) return unitCompare;
            return a.name.localeCompare(b.name);
          });
        if (!people.length) continue;

        drawRoleHeader(doc, role, people.length);
        drawPeopleTable(doc, people);
        doc.y += 10;
      }
    });

    const skipped = data.buildings.length - buildingsToRender.length;
    if (skipped > 0) {
      ensureSpace(doc, 40);
      doc.y += 6;
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text(
          `${skipped} building${skipped === 1 ? '' : 's'} omitted (no users for the selected roles).`,
          PAGE_MARGIN,
          doc.y,
          { lineBreak: false },
        );
    }
  }

  stampPageNumbers(doc);
  doc.end();
}
