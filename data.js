(function (root) {
  "use strict";

  const HEADERS = ["연도", "사업ID", "사업명", "분야", "지역", "참여자수", "수료자수"];

  const SAMPLE_FILES = [
    {
      name: "2024.csv",
      text: `연도,사업ID,사업명,분야,지역,참여자수,수료자수
2024,P01,디지털 기초 교실,교육,서울,80,60
2024,P02,청소년 진로 탐색,교육,부산,60,48
2024,P03,경력 전환 지원,일자리,경기,50,34
2024,P04,사회적기업 인턴십,일자리,인천,100,90
2024,P05,마을 돌봄 연결,지역사회,대전,70,60
2024,P06,자원봉사 성장학교,지역사회,광주,40,28`
    },
    {
      name: "2025.csv",
      text: `연도,사업ID,사업명,분야,지역,참여자수,수료자수
2025,P01,디지털 기초 교실,교육,서울,90,70
2025,P02,청소년 진로 탐색,교육,부산,80,66
2025,P03,경력 전환 지원,일자리,경기,60,43
2025,P04,사회적기업 인턴십,일자리,인천,115,107
2025,P05,마을 돌봄 연결,지역사회,대전,75,66
2025,P06,자원봉사 성장학교,지역사회,광주,50,36`
    },
    {
      name: "2026.csv",
      text: `연도,사업ID,사업명,분야,지역,참여자수,수료자수
2026,P01,디지털 기초 교실,교육,서울,100,81
2026,P02,청소년 진로 탐색,교육,부산,100,86
2026,P03,경력 전환 지원,일자리,경기,70,52
2026,P04,사회적기업 인턴십,일자리,인천,130,125
2026,P05,마을 돌봄 연결,지역사회,대전,80,73
2026,P06,자원봉사 성장학교,지역사회,광주,60,46`
    }
  ];

  const ERROR_SAMPLE_FILES = [{
    name: "errors.csv",
    text: `연도,사업ID,사업명,분야,지역,참여자수,수료자수
2024,X01,중복 사례,교육,서울,20,15
2024,X01,중복 사례,교육,서울,20,15
2024,X02,숫자 누락,교육,서울,,15
2024,X03,0명 사례,교육,서울,0,0
2024,X04,수료자 초과,교육,서울,10,12`
  }];

  // Split CSV records while preserving quoted commas, escaped quotes, and embedded newlines.
  function readCSV(text) {
    const input = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    const records = [];
    let record = [], cell = "", quoted = false, afterQuote = false, malformed = false, recordLine = 1, line = 1;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') { quoted = false; afterQuote = true; }
        else {
          cell += ch;
          if (ch === "\n") line += 1;
          else if (ch === "\r" && input[i + 1] !== "\n") line += 1;
        }
      } else if (afterQuote && ch !== "," && ch !== "\n" && ch !== "\r") {
        malformed = true;
        cell += ch;
        afterQuote = false;
      } else if (ch === '"' && cell.length === 0 && !afterQuote) {
        quoted = true;
      } else if (ch === ",") {
        record.push(cell); cell = "";
        afterQuote = false;
      } else if (ch === "\n" || ch === "\r") {
        record.push(cell); cell = "";
        records.push({ values: record, line: recordLine, malformed: malformed || quoted });
        record = [];
        malformed = false;
        afterQuote = false;
        if (ch === "\r" && input[i + 1] === "\n") i += 1;
        line += 1;
        recordLine = line;
      } else {
        if (ch === '"') malformed = true;
        cell += ch;
      }
    }
    if (cell.length || record.length || (input.length > 0 && !/[\r\n]$/.test(input))) {
      record.push(cell);
      records.push({ values: record, line: recordLine, malformed: malformed || quoted });
    }
    return records;
  }

  function isBlankRecord(record) {
    return record.values.length === 1 && record.values[0].trim() === "";
  }

  function addSourceFields(values, headers, source, line, extra) {
    const result = {};
    headers.forEach((header, index) => { result[header] = values[index] == null ? "" : values[index]; });
    result.source = source;
    result.line = line;
    if (extra) Object.keys(extra).forEach((key) => { result[key] = extra[key]; });
    return result;
  }

  function normalizedInteger(value, label, errors) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) { errors.push(label + " 누락"); return null; }
    if (!/^[+-]?\d+$/.test(raw)) { errors.push(label + " 정수 아님"); return null; }
    const number = Number(raw);
    if (!Number.isSafeInteger(number)) { errors.push(label + " 정수 아님"); return null; }
    if (number < 0) { errors.push(label + " 음수"); return null; }
    return number;
  }

  function calculateRow(row, threshold) {
    const participants = row["참여자수"];
    const completers = row["수료자수"];
    if (participants === 0 && completers === 0) {
      row.rate = null;
      row.status = "계산 불가";
    } else {
      row.rate = participants > 0 ? (completers / participants) * 100 : null;
      row.status = row.rate == null ? "계산 불가" : (row.rate < threshold ? "주의" : "정상");
    }
    return row;
  }

  function parseFiles(files) {
    const rows = [], excluded = [], seen = new Set();
    (Array.isArray(files) ? files : []).forEach((file) => {
      const source = file && file.name ? String(file.name) : "(이름 없는 파일)";
      const records = readCSV(file && file.text);
      if (!records.length) {
        excluded.push({ source, line: 1, reason: "필수 헤더 누락: " + HEADERS.join(", ") });
        return;
      }
      const headerRecord = records[0];
      const headers = headerRecord.values.map((header, index) =>
        (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()
      );
      const missingHeaders = HEADERS.filter((header) => !headers.includes(header));
      const dataRecords = records.slice(1).filter((record) => !isBlankRecord(record));
      if (headerRecord.malformed) {
        const reason = "CSV 구문 오류: 헤더 행";
        if (dataRecords.length) {
          dataRecords.forEach((record) => {
            excluded.push(addSourceFields(record.values, headers, source, record.line, { reason }));
          });
        } else {
          excluded.push({ source, line: headerRecord.line, reason });
        }
        return;
      }
      if (missingHeaders.length) {
        const reason = "필수 헤더 누락: " + missingHeaders.join(", ");
        if (dataRecords.length) {
          dataRecords.forEach((record) => {
            excluded.push(addSourceFields(record.values, headers, source, record.line, { reason }));
          });
        } else {
          excluded.push({ source, line: headerRecord.line, reason });
        }
        return;
      }

      dataRecords.forEach((record) => {
        const sourceValues = record.values;
        const values = {};
        headers.forEach((header, index) => { values[header] = sourceValues[index] == null ? "" : sourceValues[index]; });
        const original = addSourceFields(sourceValues, headers, source, record.line);
        const reasons = [];
        if (record.malformed) reasons.push("CSV 구문 오류");
        if (sourceValues.length !== headers.length) reasons.push("행 열 수 불일치");
        if (!String(values["연도"] || "").trim()) reasons.push("연도 누락");
        if (!String(values["사업ID"] || "").trim()) reasons.push("사업ID 누락");
        const participants = normalizedInteger(values["참여자수"], "참여자수", reasons);
        const completers = normalizedInteger(values["수료자수"], "수료자수", reasons);
        if (participants != null && completers != null && completers > participants) reasons.push("수료자 초과");
        const key = String(values["연도"] || "").trim() + "\u0000" + String(values["사업ID"] || "").trim();
        if (!reasons.length && seen.has(key)) reasons.push("중복");
        if (reasons.length) {
          original.reason = reasons.join(" / ");
          excluded.push(original);
          return;
        }
        seen.add(key);
        HEADERS.forEach((header) => {
          if (header === "참여자수") original[header] = participants;
          else if (header === "수료자수") original[header] = completers;
          else original[header] = String(values[header] == null ? "" : values[header]).trim();
        });
        calculateRow(original, 70);
        rows.push(original);
      });
    });
    return { rows, excluded };
  }

  function filterRows(rows, years) {
    if (!Array.isArray(years) || years.length === 0) return (rows || []).slice();
    const selected = new Set(years.map(String));
    return (rows || []).filter((row) => selected.has(String(row["연도"])));
  }

  function aggregate(rows, threshold) {
    const limit = threshold == null ? 70 : Number(threshold);
    const safeThreshold = Number.isFinite(limit) ? limit : 70;
    const data = Array.isArray(rows) ? rows : [];
    data.forEach((row) => calculateRow(row, safeThreshold));
    const participants = data.reduce((sum, row) => sum + row["참여자수"], 0);
    const completers = data.reduce((sum, row) => sum + row["수료자수"], 0);
    const summary = {
      count: data.length,
      participants,
      completers,
      rate: participants === 0 ? null : (completers / participants) * 100
    };

    const fieldTotals = new Map();
    data.forEach((row) => {
      const name = row["분야"];
      fieldTotals.set(name, (fieldTotals.get(name) || 0) + row["참여자수"]);
    });
    const fields = Array.from(fieldTotals, ([name, total]) => ({
      name,
      participants: total,
      share: participants === 0 ? 0 : total / participants * 100
    }));

    const programTotals = new Map();
    data.forEach((row) => {
      const id = row["사업ID"];
      if (!programTotals.has(id)) programTotals.set(id, { id, name: row["사업명"], participants: 0, completers: 0 });
      const program = programTotals.get(id);
      program.participants += row["참여자수"];
      program.completers += row["수료자수"];
    });
    const programs = Array.from(programTotals.values());

    const yearTotals = new Map();
    data.forEach((row) => {
      const year = row["연도"];
      if (!yearTotals.has(year)) yearTotals.set(year, { year, participants: 0, completers: 0 });
      const item = yearTotals.get(year);
      item.participants += row["참여자수"];
      item.completers += row["수료자수"];
    });
    const trend = Array.from(yearTotals.values()).sort((a, b) => Number(a.year) - Number(b.year)).map((item) => ({
      ...item,
      rate: item.participants === 0 ? null : item.completers / item.participants * 100
    }));
    return { summary, fields, programs, trend };
  }

  function escapeCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function exportCSV(rows) {
    const lines = [HEADERS.map(escapeCell).join(",")];
    (rows || []).forEach((row) => {
      lines.push(HEADERS.map((header) => escapeCell(row[header])).join(","));
    });
    return lines.join("\r\n");
  }

  const api = { SAMPLE_FILES, ERROR_SAMPLE_FILES, parseFiles, filterRows, aggregate, exportCSV };
  root.ProgramData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
