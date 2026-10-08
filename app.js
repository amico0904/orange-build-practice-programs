(() => {
  'use strict';
  const data = window.ProgramData;
  if (!data) return;

  const $ = (selector) => document.querySelector(selector);
  const byId = (id) => document.getElementById(id);
  const fmt = (value) => Number(value || 0).toLocaleString('ko-KR');
  const pct = (value) => value == null || !Number.isFinite(Number(value)) ? '계산 불가' : `${Math.round(Number(value))}%`;
  const svgNS = 'http://www.w3.org/2000/svg';
  const fieldPalette = { '교육':'#168b8b', '일자리':'#df8b35', '지역사회':'#5277a6' };
  const basePalette = ['#7e91aa','#bc7959','#8a78a5','#7c9b69','#c09a51','#5e9da5','#9a7c72','#73869b'];
  const fixedCategories = ['교육','일자리','지역사회'];
  const seriesColors = { participants:'#163e58', completers:'#de8d3a', trend:'#168b8b' };
  let rows = [];
  let excluded = [];
  let dataLabel = '기본 정상 샘플';

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function svg(tag, attrs = {}, text) {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key,value]) => el.setAttribute(key, String(value)));
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function hashColor(value) {
    let hash = 2166136261;
    for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return basePalette[(hash >>> 0) % basePalette.length];
  }
  function fieldColor(name) { return fieldPalette[name] || hashColor(name); }
  function showNotice(message) {
    const notice = byId('notice');
    notice.textContent = message || '';
    notice.hidden = !message;
  }
  function safeName(value, fallback = '이름 없음') { return value == null || String(value).trim() === '' ? fallback : String(value); }

  function setDataset(nextRows, nextExcluded, label, notice = '') {
    rows = nextRows || [];
    excluded = nextExcluded || [];
    dataLabel = label;
    byId('dataset-status').textContent = label;
    showNotice(notice);
    updateYearOptions();
    render();
  }
  function updateYearOptions() {
    const select = byId('year-filter');
    const previous = select.value;
    while (select.options.length > 1) select.remove(1);
    [...new Set(rows.map(row => String(row['연도'] ?? '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko',{numeric:true})).forEach(year => {
      const option = document.createElement('option'); option.value = year; option.textContent = `${year}년`; select.append(option);
    });
    select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  }
  function currentRows() {
    const year = byId('year-filter').value;
    return data.filterRows(rows, year ? [year] : []);
  }
  function getThreshold() {
    const input = byId('threshold');
    let value = Number(input.value);
    if (!Number.isFinite(value)) value = 70;
    value = Math.min(100, Math.max(0, value));
    input.value = String(value);
    return value;
  }
  function render() {
    const filteredRows = currentRows();
    const threshold = getThreshold();
    const result = data.aggregate(filteredRows, threshold);
    renderKpis(result, filteredRows, threshold);
    renderPie(result.fields || []);
    renderBars(result.programs || []);
    renderTrend(result.trend || []);
    renderTable(filteredRows);
    renderExcluded();
  }
  function renderKpis(result, filteredRows, threshold) {
    const summary = result.summary || {};
    const countCaution = filteredRows.filter(row => row.status === '주의').length;
    const yearCount = new Set(filteredRows.map(row => String(row['연도'] ?? ''))).size;
    byId('kpi-participants').textContent = fmt(summary.participants);
    byId('kpi-completers').textContent = fmt(summary.completers);
    byId('kpi-rate').textContent = pct(summary.rate);
    byId('kpi-programs').textContent = fmt((result.programs || []).length);
    byId('kpi-years').textContent = fmt(yearCount);
    byId('kpi-attention').textContent = fmt(countCaution);
    const year = byId('year-filter').value;
    byId('table-caption').textContent = `${year ? `${year}년 · ` : '전체 연도 · '}${fmt(filteredRows.length)}개 유효 행 · 주의 기준 ${threshold}% 미만`;
  }
  function renderPie(fields) {
    const host = byId('pie-chart'); host.replaceChildren();
    const total = fields.reduce((sum,item) => sum + Number(item.participants || 0), 0);
    if (!fields.length) { host.append(node('p','empty-state','분야별 참여 자료가 없습니다.')); return; }
    if (total === 0) {
      host.append(node('p','empty-state','참여자 합계 0명 · 분야별 비중 계산 불가'));
      const legend=node('div','pie-legend');
      fields.forEach(field=>{const item=node('div','pie-legend-item');const swatch=node('i','swatch');swatch.style.backgroundColor=fieldColor(field.name);item.append(swatch,node('strong','',safeName(field.name)),node('span','','계산 불가'),node('small','','0명'));legend.append(item);});
      host.append(legend);return;
    }
    const chart = svg('svg',{viewBox:'0 0 320 280',class:'pie-svg','aria-hidden':'true'});
    const cx = 145, cy = 140, radius = 103;
    let angle = -Math.PI / 2;
    fields.forEach((field,index) => {
      const count = Number(field.participants || 0);
      const portion = Math.max(0,count / total);
      const end = angle + portion * Math.PI * 2;
      let path;
      if (portion >= .999999) {
        path = svg('circle',{cx,cy,r:radius,fill:'none',stroke:fieldColor(field.name), 'stroke-width':42});
      } else {
        const x1=cx+radius*Math.cos(angle), y1=cy+radius*Math.sin(angle), x2=cx+radius*Math.cos(end), y2=cy+radius*Math.sin(end);
        const large=portion>.5?1:0;
        path=svg('path',{d:`M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`,fill:'none',stroke:fieldColor(field.name),'stroke-width':42,'stroke-linecap':'butt'});
      }
      path.setAttribute('data-index',String(index)); chart.append(path); angle=end;
    });
    chart.append(svg('text',{x:cx,y:cy-3,'text-anchor':'middle',class:'svg-value'},fmt(total)));
    chart.append(svg('text',{x:cx,y:cy+15,'text-anchor':'middle',class:'svg-tick'},'참여자 합계'));
    host.append(chart);
    const legend=node('div','pie-legend');
    fields.forEach(field=>{
      const item=node('div','pie-legend-item');
      const swatch=node('i','swatch');swatch.style.backgroundColor=fieldColor(field.name);
      const name=node('strong','',safeName(field.name));
      const share=node('span','',`${Math.round(Number(field.share || 0))}%`);
      const count=node('small','',`${fmt(field.participants)}명`);
      item.append(swatch,name,share,count);legend.append(item);
    });
    host.append(legend);
  }
  function renderBars(programs) {
    const host=byId('bar-chart');host.replaceChildren();
    if(!programs.length){host.append(node('p','empty-state','선택한 자료에 사업이 없습니다.'));return;}
    const width=Math.max(760,programs.length*132+82), height=300, left=58,right=22,top=34,bottom=62,plotW=width-left-right,plotH=height-top-bottom;
    const max=Math.max(1,...programs.flatMap(p=>[Number(p.participants||0),Number(p.completers||0)]));
    const tickStep=Math.max(1,Math.ceil(max/4/10)*10), axisMax=Math.max(tickStep,Math.ceil(max/tickStep)*tickStep);
    const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,class:'bar-svg','aria-hidden':'true'});
    for(let value=0;value<=axisMax;value+=tickStep){const y=top+plotH-(value/axisMax)*plotH;chart.append(svg('line',{x1:left,y1:y,x2:width-right,y2:y,class:'svg-axis'}));chart.append(svg('text',{x:left-10,y:y+3,'text-anchor':'end',class:'svg-tick'},fmt(value)));}
    const groupW=plotW/programs.length, barW=Math.min(24,groupW*.25);
    programs.forEach((program,i)=>{
      const center=left+groupW*(i+.5);
      [[Number(program.participants||0),seriesColors.participants,-barW-2],[Number(program.completers||0),seriesColors.completers,2]].forEach(([value,color,offset])=>{
        const h=value/axisMax*plotH, x=center+offset, y=top+plotH-h;
        chart.append(svg('rect',{x,y,width:barW,height:h,rx:4,fill:color}));
        chart.append(svg('text',{x:x+barW/2,y:y-5,'text-anchor':'middle',class:'svg-value'},fmt(value)));
      });
      const label=safeName(program.name,program.id);const lines=splitLabel(label,12);
      lines.forEach((line,j)=>chart.append(svg('text',{x:center,y:top+plotH+18+j*13,'text-anchor':'middle',class:'svg-label',title:safeName(program.name,program.id)},line)));
    });
    const legendY=15;chart.append(svg('rect',{x:left,y:legendY-7,width:9,height:9,rx:2,fill:seriesColors.participants}));chart.append(svg('text',{x:left+14,y:legendY,class:'svg-label'},'참여자수'));
    chart.append(svg('rect',{x:left+92,y:legendY-7,width:9,height:9,rx:2,fill:seriesColors.completers}));chart.append(svg('text',{x:left+106,y:legendY,class:'svg-label'},'수료자수'));
    host.append(chart);
  }
  function splitLabel(text,maxChars){const chars=[...String(text)];if(chars.length<=maxChars)return [String(text)];return [chars.slice(0,maxChars).join(''),chars.slice(maxChars,maxChars*2).join('')].filter(Boolean);}
  function renderTrend(trend) {
    const host=byId('trend-chart');host.replaceChildren();
    if(!trend.length){host.append(node('p','empty-state','연도별 자료가 없습니다.'));return;}
    const width=Math.max(640,trend.length*150+100),height=260,left=56,right=36,top=25,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
    const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,class:'trend-svg','aria-hidden':'true'});
    [0,25,50,75,100].forEach(value=>{const y=top+plotH-(value/100)*plotH;chart.append(svg('line',{x1:left,y1:y,x2:width-right,y2:y,class:'svg-axis'}));chart.append(svg('text',{x:left-10,y:y+3,'text-anchor':'end',class:'svg-tick'},`${value}%`));});
    const points=trend.map((item,i)=>({x:trend.length===1?left+plotW/2:left+i*plotW/(trend.length-1),y:item.rate==null?null:top+plotH-(Number(item.rate)/100)*plotH,item}));
    let segment=[];
    function drawSegment(){if(segment.length>1)chart.append(svg('polyline',{points:segment.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:seriesColors.trend,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));segment=[];}
    points.forEach(point=>{if(point.y===null){drawSegment();}else{segment.push(point);}});drawSegment();
    points.forEach(point=>{
      const year=String(point.item.year??'');
      chart.append(svg('text',{x:point.x,y:height-15,'text-anchor':'middle',class:'svg-year'},year?`${year}년`:'연도 미상'));
      if(point.y===null){chart.append(svg('text',{x:point.x,y:top+plotH/2,'text-anchor':'middle',class:'svg-tick'},'계산 불가'));}
      else{chart.append(svg('circle',{cx:point.x,cy:point.y,r:5,fill:'#fff',stroke:seriesColors.trend,'stroke-width':3}));chart.append(svg('text',{x:point.x,y:point.y-12,'text-anchor':'middle',class:'svg-value'},pct(point.item.rate)));}
    });
    host.append(chart);
  }
  function renderTable(filteredRows) {
    const tbody=byId('detail-rows');tbody.replaceChildren();
    const sorted=filteredRows;
    sorted.forEach(row=>{
      const tr=document.createElement('tr');
      ['연도','사업ID','사업명','분야','지역'].forEach(key=>{const td=document.createElement('td');td.textContent=safeName(row[key],key==='사업명'?'이름 없음':'—');tr.append(td);});
      [row['참여자수'],row['수료자수']].forEach(value=>{const td=document.createElement('td');td.className='numeric';td.textContent=fmt(value);tr.append(td);});
      const rate=document.createElement('td');rate.className='numeric';rate.textContent=pct(row.rate);tr.append(rate);
      const statusCell=document.createElement('td');const badge=node('span',`status-pill ${row.status==='주의'?'status-attention':row.status==='정상'?'status-normal':'status-na'}`,row.status||'계산 불가');statusCell.append(badge);tr.append(statusCell);
      const source=document.createElement('td');source.className='source-cell';source.textContent=safeName(row.source,'—');tr.append(source);
      tbody.append(tr);
    });
    byId('empty-state').hidden=sorted.length>0;
    byId('download-csv').disabled=sorted.length===0;
  }
  function renderExcluded() {
    const section=byId('excluded-section'),list=byId('excluded-list');list.replaceChildren();
    if(!excluded.length){section.hidden=true;return;}
    section.hidden=false;byId('excluded-count').textContent=`${fmt(excluded.length)}건`;
    byId('excluded-caption').textContent=`제외 행 ${fmt(excluded.length)}건 · 제외 자료는 요약, 차트, 상세 실적, CSV에서 제외됩니다.`;
    excluded.forEach(item=>{
      const card=node('article','excluded-item');
      const origin=node('div','excluded-origin',`${safeName(item.source,'출처 미상')} · ${item.line ? `행 ${item.line}` : '파일 오류'}`);
      const reason=node('div','excluded-reason',safeName(item.reason,'사유 미상'));
      card.append(origin,reason);
      const values=['연도','사업ID','사업명','분야','지역','참여자수','수료자수'].filter(key=>item[key]!==undefined&&item[key]!==null&&String(item[key])!=='').map(key=>`${key}: ${item[key]}`);
      if(values.length)card.append(node('div','excluded-values',values.join(' · ')));
      list.append(card);
    });
  }
  function downloadCSV() {
    const filteredRows=currentRows();
    if(!filteredRows.length){showNotice('다운로드할 유효 자료가 없습니다.');return;}
    const csv='\ufeff'+data.exportCSV(filteredRows);
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`사업실적_${byId('year-filter').value||'전체'}_${new Date().toISOString().slice(0,10)}.csv`;document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
  }
  async function readSelectedFiles(fileList) {
    const files=[...fileList];
    if(!files.length)return;
    const names=files.map(file=>file.name);
    const hasErrorExample=names.some(name=>/^errors\.csv$/i.test(name));
    if(hasErrorExample&&files.length>1){showNotice('오류 예제 파일과 다른 CSV를 함께 선택해 혼합을 막았습니다. 파일을 나누어 불러와 주세요. 현재 자료는 그대로 유지됩니다.');byId('csv-files').value='';return;}
    try{
      const payload=await Promise.all(files.map(async file=>({name:file.name,text:await file.text()})));
      const parsed=data.parseFiles(payload);
      setDataset(parsed.rows,parsed.excluded,files.length===1?files[0].name:`업로드 ${files.length}개 파일`,parsed.excluded.length?`자료를 불러왔습니다. 제외된 행 ${parsed.excluded.length}건은 아래 목록에서 확인할 수 있습니다.`:'CSV 자료를 불러왔습니다.');
    }catch(error){showNotice(`파일을 읽지 못했습니다: ${error instanceof Error?error.message:'알 수 없는 오류'}`);}
    finally{byId('csv-files').value='';}
  }
  function sample(files,label){const parsed=data.parseFiles(files);setDataset(parsed.rows,parsed.excluded,label,parsed.excluded.length?`샘플을 불러왔습니다. 제외 행 ${parsed.excluded.length}건을 확인해 주세요.`:'');}

  byId('year-filter').addEventListener('change',render);
  byId('threshold').addEventListener('change',render);
  byId('load-normal').addEventListener('click',()=>sample(data.SAMPLE_FILES,'기본 정상 샘플'));
  byId('load-errors').addEventListener('click',()=>sample(data.ERROR_SAMPLE_FILES,'오류 예제'));
  byId('csv-files').addEventListener('change',event=>readSelectedFiles(event.target.files));
  byId('download-csv').addEventListener('click',downloadCSV);
  sample(data.SAMPLE_FILES,'기본 정상 샘플');
})();
