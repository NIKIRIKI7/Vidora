using System.IO.Compression;
using System.Security;
using System.Text;
using Research.Domain.Entities;
using Research.Domain.Ports;

namespace Research.Infrastructure.Export;

public sealed class OpenXmlResearchReportExporter : IResearchReportExporter
{
    public Task<byte[]> ExportToExcelAsync(ResearchRun run, CancellationToken ct = default)
    {
        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteZipEntry(archive, "[Content_Types].xml", ContentTypesXml());
            WriteZipEntry(archive, "_rels/.rels", GlobalRelsXml());
            WriteZipEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelsXml());
            WriteZipEntry(archive, "xl/workbook.xml", WorkbookXml());
            WriteZipEntry(archive, "xl/styles.xml", StylesXml());
            WriteZipEntry(archive, "xl/worksheets/sheet1.xml", BuildOpportunitiesSheet(run));
            WriteZipEntry(archive, "xl/worksheets/sheet2.xml", BuildSignalsSheet(run));
            WriteZipEntry(archive, "xl/worksheets/sheet3.xml", BuildCandidatesSheet(run));
        }

        return Task.FromResult(memoryStream.ToArray());
    }

    private static void WriteZipEntry(ZipArchive archive, string entryName, string content)
    {
        var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
        using var stream = entry.Open();
        using var writer = new StreamWriter(stream, Encoding.UTF8);
        writer.Write(content);
    }

    private static string Escape(string? val) => SecurityElement.Escape(val ?? string.Empty);

    private static string BuildOpportunitiesSheet(ResearchRun run)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Angle Title</t></is></c><c r="B1" t="inlineStr"><is><t>Hook Hypothesis</t></is></c><c r="C1" t="inlineStr"><is><t>Score</t></is></c><c r="D1" t="inlineStr"><is><t>Format</t></is></c><c r="E1" t="inlineStr"><is><t>Friction Point</t></is></c><c r="F1" t="inlineStr"><is><t>Why It Works</t></is></c></row>""");

        int row = 2;
        foreach (var opp in run.Opportunities)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(opp.AngleTitle)}</t></is></c><c r="B{row}" t="inlineStr"><is><t>{Escape(opp.HookHypothesis)}</t></is></c><c r="C{row}"><v>{opp.Score.Value:F1}</v></c><c r="D{row}" t="inlineStr"><is><t>{Escape(opp.RecommendedFormat)}</t></is></c><c r="E{row}" t="inlineStr"><is><t>{Escape(opp.FrictionPoint)}</t></is></c><c r="F{row}" t="inlineStr"><is><t>{Escape(opp.WhyItWorks)}</t></is></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string BuildSignalsSheet(ResearchRun run)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Topic</t></is></c><c r="B1" t="inlineStr"><is><t>Growth Velocity (%)</t></is></c><c r="C1" t="inlineStr"><is><t>Aggregate VPH</t></is></c><c r="D1" t="inlineStr"><is><t>Videos Count</t></is></c><c r="E1" t="inlineStr"><is><t>Confidence</t></is></c></row>""");

        int row = 2;
        foreach (var sig in run.Signals)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(sig.Topic)}</t></is></c><c r="B{row}"><v>{sig.GrowthVelocityPercent:F1}</v></c><c r="C{row}"><v>{sig.AggregateVph:F1}</v></c><c r="D{row}"><v>{sig.SupportingVideoCount}</v></c><c r="E{row}"><v>{sig.Confidence:F2}</v></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string BuildCandidatesSheet(ResearchRun run)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Video ID</t></is></c><c r="B1" t="inlineStr"><is><t>Title</t></is></c><c r="C1" t="inlineStr"><is><t>Channel</t></is></c><c r="D1" t="inlineStr"><is><t>Views</t></is></c><c r="E1" t="inlineStr"><is><t>VPH</t></is></c><c r="F1" t="inlineStr"><is><t>Outlier Multiplier</t></is></c><c r="G1" t="inlineStr"><is><t>Momentum Score</t></is></c></row>""");

        int row = 2;
        foreach (var c in run.Candidates)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(c.VideoId)}</t></is></c><c r="B{row}" t="inlineStr"><is><t>{Escape(c.Title)}</t></is></c><c r="C{row}" t="inlineStr"><is><t>{Escape(c.ChannelTitle)}</t></is></c><c r="D{row}"><v>{c.ViewCount}</v></c><c r="E{row}"><v>{c.Momentum.ViewsPerHour:F1}</v></c><c r="F{row}"><v>{c.Momentum.OutlierMultiplier:F2}</v></c><c r="G{row}"><v>{c.Momentum.Score:F1}</v></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string ContentTypesXml() => """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
            <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
            <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
            <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
            <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        </Types>
        """;

    private static string GlobalRelsXml() => """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        </Relationships>
        """;

    private static string WorkbookRelsXml() => """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
            <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
            <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
            <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        </Relationships>
        """;

    private static string WorkbookXml() => """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <sheets>
                <sheet name="Opportunities" sheetId="1" r:id="rId1"/>
                <sheet name="Early Signals" sheetId="2" r:id="rId2"/>
                <sheet name="Candidates" sheetId="3" r:id="rId3"/>
            </sheets>
        </workbook>
        """;

    private static string StylesXml() => """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
            <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
            <borders count="1"><border/></borders>
            <cellXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellXfs>
        </styleSheet>
        """;
}
