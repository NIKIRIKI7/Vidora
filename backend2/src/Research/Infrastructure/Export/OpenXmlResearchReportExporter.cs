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
        var data = new AdHocExportData(
            Query: run.TopicQuery,
            Niche: run.Niche,
            Videos: run.Candidates.Select(c => new AdHocVideoExportDto(
                c.VideoId, c.Title, c.ChannelTitle, c.ViewCount, c.ChannelSubscriberCount,
                c.ChannelSubscriberCount > 0 ? Math.Round((double)c.ViewCount / c.ChannelSubscriberCount, 2) : 1.5,
                c.Momentum.ViewsPerHour, $"https://www.youtube.com/watch?v={c.VideoId}",
                c.PublishedAt.ToString("yyyy-MM-dd"), (int)c.DurationSeconds, c.DurationSeconds <= 60,
                c.Momentum.IsRocket, c.Momentum.VelocityStage)).ToList(),
            Signals: run.Signals.Select(s => new AdHocSignalExportDto(
                s.Topic, s.GrowthVelocityPercent, s.AggregateVph, s.SupportingVideoCount,
                s.SourcePlatform, s.GrowthPct, s.SourceUrl)).ToList(),
            Opportunities: run.Opportunities.Select(o => new AdHocOpportunityExportDto(
                o.AngleTitle, o.Score.Value, "BLUE_OCEAN", o.WhyItWorks, o.TargetAudience)).ToList(),
            Goldmine: []
        );

        return ExportAdHocToExcelAsync(data, ct);
    }

    public Task<byte[]> ExportAdHocToExcelAsync(AdHocExportData data, CancellationToken ct = default)
    {
        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteZipEntry(archive, "[Content_Types].xml", ContentTypesXml());
            WriteZipEntry(archive, "_rels/.rels", GlobalRelsXml());
            WriteZipEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelsXml());
            WriteZipEntry(archive, "xl/workbook.xml", WorkbookXml());
            WriteZipEntry(archive, "xl/styles.xml", StylesXml());
            WriteZipEntry(archive, "xl/worksheets/sheet1.xml", BuildVideosSheet(data.Videos));
            WriteZipEntry(archive, "xl/worksheets/sheet2.xml", BuildOpportunitiesSheet(data.Opportunities));
            WriteZipEntry(archive, "xl/worksheets/sheet3.xml", BuildSignalsSheet(data.Signals));
            WriteZipEntry(archive, "xl/worksheets/sheet4.xml", BuildGoldmineSheet(data.Goldmine));
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

    private static string BuildVideosSheet(IReadOnlyList<AdHocVideoExportDto> videos)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Video ID</t></is></c><c r="B1" t="inlineStr"><is><t>Название видео</t></is></c><c r="C1" t="inlineStr"><is><t>Канал</t></is></c><c r="D1" t="inlineStr"><is><t>Просмотры</t></is></c><c r="E1" t="inlineStr"><is><t>Подписчики</t></is></c><c r="F1" t="inlineStr"><is><t>Ratio (V/S)</t></is></c><c r="G1" t="inlineStr"><is><t>VPH (Скорость)</t></is></c><c r="H1" t="inlineStr"><is><t>Ракета (Rocket)</t></is></c><c r="I1" t="inlineStr"><is><t>Формат</t></is></c><c r="J1" t="inlineStr"><is><t>Дата</t></is></c><c r="K1" t="inlineStr"><is><t>Ссылка</t></is></c></row>""");

        int row = 2;
        foreach (var v in videos)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(v.VideoId)}</t></is></c><c r="B{row}" t="inlineStr"><is><t>{Escape(v.Title)}</t></is></c><c r="C{row}" t="inlineStr"><is><t>{Escape(v.Channel)}</t></is></c><c r="D{row}"><v>{v.Views}</v></c><c r="E{row}"><v>{v.Subs}</v></c><c r="F{row}"><v>{v.Ratio:F2}</v></c><c r="G{row}"><v>{v.Vph:F0}</v></c><c r="H{row}" t="inlineStr"><is><t>{(v.IsRocket ? "ДА 🚀" : "НЕТ")}</t></is></c><c r="I{row}" t="inlineStr"><is><t>{(v.IsShort ? "Shorts" : "Long")}</t></is></c><c r="J{row}" t="inlineStr"><is><t>{Escape(v.PublishedAt)}</t></is></c><c r="K{row}" t="inlineStr"><is><t>{Escape(v.Url)}</t></is></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string BuildOpportunitiesSheet(IReadOnlyList<AdHocOpportunityExportDto> opps)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Сценарный угол / Тема</t></is></c><c r="B1" t="inlineStr"><is><t>Оценка (Score)</t></is></c><c r="C1" t="inlineStr"><is><t>Статус ниши</t></is></c><c r="D1" t="inlineStr"><is><t>План действий / Почему сработает</t></is></c><c r="E1" t="inlineStr"><is><t>Источник спроса</t></is></c></row>""");

        int row = 2;
        foreach (var o in opps)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(o.Topic)}</t></is></c><c r="B{row}"><v>{o.OpportunityScore:F1}</v></c><c r="C{row}" t="inlineStr"><is><t>{Escape(o.Status)}</t></is></c><c r="D{row}" t="inlineStr"><is><t>{Escape(o.ActionableAngle)}</t></is></c><c r="E{row}" t="inlineStr"><is><t>{Escape(o.DemandSource)}</t></is></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string BuildSignalsSheet(IReadOnlyList<AdHocSignalExportDto> signals)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Тренд / Тема</t></is></c><c r="B1" t="inlineStr"><is><t>Платформа</t></is></c><c r="C1" t="inlineStr"><is><t>VPS Score</t></is></c><c r="D1" t="inlineStr"><is><t>Скорость спроса (VPH)</t></is></c><c r="E1" t="inlineStr"><is><t>Подтверждений</t></is></c><c r="F1" t="inlineStr"><is><t>Рост</t></is></c><c r="G1" t="inlineStr"><is><t>Ссылка</t></is></c></row>""");

        int row = 2;
        foreach (var s in signals)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(s.Topic)}</t></is></c><c r="B{row}" t="inlineStr"><is><t>{Escape(s.SourcePlatform)}</t></is></c><c r="C{row}"><v>{s.VpsScore:F1}</v></c><c r="D{row}"><v>{s.AggregateVph:F1}</v></c><c r="E{row}"><v>{s.SupportingVideos}</v></c><c r="F{row}" t="inlineStr"><is><t>{Escape(s.GrowthPct)}</t></is></c><c r="G{row}" t="inlineStr"><is><t>{Escape(s.SourceUrl)}</t></is></c></row>""");
            row++;
        }

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string BuildGoldmineSheet(IReadOnlyList<AdHocGoldmineExportDto> goldmine)
    {
        var sb = new StringBuilder();
        sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        sb.Append("""<row r="1"><c r="A1" t="inlineStr"><is><t>Исходный ролик</t></is></c><c r="B1" t="inlineStr"><is><t>Категория боли</t></is></c><c r="C1" t="inlineStr"><is><t>Цитата зрителя</t></is></c><c r="D1" t="inlineStr"><is><t>Инсайт для сценария</t></is></c><c r="E1" t="inlineStr"><is><t>Решение в сценарии</t></is></c></row>""");

        int row = 2;
        foreach (var g in goldmine)
        {
            sb.Append($"""<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{Escape(g.VideoTitle)}</t></is></c><c r="B{row}" t="inlineStr"><is><t>{Escape(g.Category)}</t></is></c><c r="C{row}" t="inlineStr"><is><t>{Escape(g.ViewerQuote)}</t></is></c><c r="D{row}" t="inlineStr"><is><t>{Escape(g.Insight)}</t></is></c><c r="E{row}" t="inlineStr"><is><t>{Escape(g.ScriptSolution)}</t></is></c></row>""");
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
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
""";

    private static string WorkbookXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Вирусные видео" sheetId="1" r:id="rId1"/>
    <sheet name="Голубые океаны" sheetId="2" r:id="rId2"/>
    <sheet name="Ранние сигналы" sheetId="3" r:id="rId3"/>
    <sheet name="Боли аудитории" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>
""";

    private static string StylesXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Segoe UI"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellXfs>
</styleSheet>
""";
}
