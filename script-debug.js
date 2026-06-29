
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  鍏ㄥ眬鐘舵€?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
let G = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  positions: [],
  staff: [],
  schedule: {},   // day -> pos_id -> {status, person}
  editingStaffId: null,
  editingPosId: null,
  // 杞鐩稿叧
  polling: null,        // setInterval 鍙ユ焺
  userBusy: false,      // 鐢ㄦ埛姝ｅ湪鎿嶄綔锛堝脊绐?鍙抽敭鑿滃崟鎵撳紑鏃舵殏鍋滆疆璇㈠埛鏂帮級
  lastPollHash: '',     // 涓婃鏁版嵁鎸囩汗锛岄伩鍏嶆棤鍙樺寲鏃堕噸娓叉煋
};

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  宸ュ叿
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
function $(id){ return document.getElementById(id); }
function toast(msg, dur=2000){
  const el=$('toast'); el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), dur);
}
function loading(show){ $('loading').style.display = show ? 'flex' : 'none'; }
async function api(url, method='GET', body=null){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 宸ヤ綔鏃ュ垽鏂?(0=鍛ㄤ竴..6=鍛ㄦ棩)
function getWeekday(year, month, day){
  return new Date(year, month-1, day).getDay(); // 0=鍛ㄦ棩,1=鍛ㄤ竴,...6=鍛ㄥ叚
}
function isWeekStart(year, month, day){
  // 鍛ㄤ簲 = 5
  return getWeekday(year,month,day) === 5;
}
function daysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  鍒濆鍖?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function init(){
  // 骞翠唤閫夋嫨
  const ySel=$('sel-year');
  for(let y=2024;y<=2030;y++){
    const o=document.createElement('option');
    o.value=y; o.textContent=y+'骞?;
    if(y===G.year) o.selected=true;
    ySel.appendChild(o);
  }
  ySel.onchange=()=>{G.year=+ySel.value; loadAll()};

  // 鏈堜唤閫夋嫨
  const mSel=$('sel-month');
  for(let m=1;m<=12;m++){
    const o=document.createElement('option');
    o.value=m; o.textContent=m+'鏈?;
    if(m===G.month) o.selected=true;
    mSel.appendChild(o);
  }
  mSel.onchange=()=>{G.month=+mSel.value; loadAll()};

  // 鏃ユ湡閫夋嫨(鍗曟棩缁熻)
  buildDaySel();

  await loadAll();

  // 鍏抽棴鍙抽敭鑿滃崟
  document.addEventListener('click', ()=>{
    if($('ctx-menu').style.display==='block'){
      $('ctx-menu').style.display='none';
      G.userBusy = false;  // 鑿滃崟鍏抽棴鎭㈠杞
    }
  });
  document.addEventListener('contextmenu', e=>{
    if(!e.target.closest('.cell')) $('ctx-menu').style.display='none';
  });

  // 鏄剧ずIP
  try{
    const r=await fetch('/api/staff');
    $('ip-hint').textContent='鈼?灞€鍩熺綉鍙闂?'+location.host;
  }catch(e){}

  // 鏈堜唤/骞翠唤鍒囨崲鏃堕噸缃寚绾癸紙鏂版湀浠芥暟鎹笉鍚岋紝涓嶈兘鐢ㄦ棫鎸囩汗瀵规瘮锛?
  const origYChange = ySel.onchange;
  ySel.onchange = ()=>{ G.lastPollHash=''; G.year=+ySel.value; loadAll(); };
  const origMChange = mSel.onchange;
  mSel.onchange = ()=>{ G.lastPollHash=''; G.month=+mSel.value; loadAll(); };

  // 鍚姩10绉掕疆璇?
  startPolling();
}

function buildDaySel(){
  const sel=$('day-sel-day');
  sel.innerHTML='';
  const days=daysInMonth(G.year,G.month);
  for(let d=1;d<=days;d++){
    const o=document.createElement('option');
    const wd=getWeekday(G.year,G.month,d);
    const wdNames=['鏃?,'涓€','浜?,'涓?,'鍥?,'浜?,'鍏?];
    o.value=d; o.textContent=`${G.month}/${d}（周${wdNames[wd]}）`;
    if(d===new Date().getDate() && G.year===new Date().getFullYear() && G.month===new Date().getMonth()+1)
      o.selected=true;
    sel.appendChild(o);
  }
  buildWeekSel();
}

function buildWeekSel(){
  const sel=$('week-sel');
  sel.innerHTML='';
  const days=daysInMonth(G.year,G.month);
  // 鎵炬湰鏈堟墍鏈夊懆浜?
  let weeks=[];
  for(let d=1;d<=days;d++){
    if(getWeekday(G.year,G.month,d)===5){
      // 鎵惧埌缁撴潫锛堜笅鍛ㄥ洓锛?
      let endD=d+6;
      weeks.push({start:d, startM:G.month, startY:G.year, end:endD});
    }
  }
  // 濡傛灉鏈湀1鍙蜂笉鏄懆浜旓紝涔熻琛ョ涓€鍛紙浠?鍙峰埌绗竴涓懆鍥涳級
  if(weeks.length===0 || weeks[0].start > 1){
    // 鎵炬湰鏈堢涓€涓懆鍥涙垨鏈堟湯
    let firstThur = -1;
    for(let d=1;d<=days;d++){
      if(getWeekday(G.year,G.month,d)===4){firstThur=d;break;}
    }
    if(firstThur>0){
      weeks.unshift({start:1, end:firstThur, _prefix:true});
    }
  }
  if(weeks.length===0){
    const o=document.createElement('option');
    o.value='1-'+days; o.textContent=`${G.month}/1 - ${G.month}/${days}`;
    sel.appendChild(o);
    return;
  }
  weeks.forEach((w,i)=>{
    const o=document.createElement('option');
    const endDay=Math.min(w.end, days);
    o.value=`${w.start}-${endDay}`;
    o.textContent=`${G.month}/${w.start} - ${G.month}/${endDay}`;
    sel.appendChild(o);
  });
}

async function loadAll(){
  // 鑾峰彇鏈嶅姟鍣ㄥ眬鍩熺綉IP锛屾樉绀鸿闂湴鍧€妯箙
  try {
    const info = await api('/api/server-info');
    const banner = document.getElementById('access-banner');
    const link = document.getElementById('server-url');
    // 濡傛灉褰撳墠涓嶆槸閫氳繃灞€鍩熺綉IP璁块棶锛屽氨鏄剧ず妯箙
    if (location.hostname !== info.ip && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
      link.href = info.url;
      link.textContent = info.url;
      banner.style.display = 'block';
    }
  } catch(e) {}

  loading(true);
  try{
    [G.positions, G.staff, G.groups] = await Promise.all([
      api('/api/positions'),
      api('/api/staff'),
      api('/api/groups'),
    ]);
    G.schedule = await api(`/api/schedule/${G.year}/${G.month}`);
    // 鍔犺浇璇ユ湀宸蹭繚瀛樼殑闅愯棌鍒楄缃紙浠庢湇鍔″櫒鍚屾锛?
    await loadHiddenDays();
    // 璁板綍鍒濆鏁版嵁鎸囩汗锛岃疆璇㈡椂鐢ㄦ潵鍒ゆ柇鏄惁鏈夊彉鍖?
    G.lastPollHash = JSON.stringify({positions:G.positions, staff:G.staff, schedule:G.schedule});
    buildDaySel();
    renderTable();
    renderDayStat();
    renderWeekStat();
    renderMonthStat();
  }catch(e){
    toast('鍔犺浇澶辫触: '+e.message, 3000);
  }finally{
    loading(false);
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  鎺掔彮琛ㄦ覆鏌?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
function renderTable(){
  const days = daysInMonth(G.year, G.month);
  const today = new Date();
  const todayY=today.getFullYear(), todayM=today.getMonth()+1, todayD=today.getDate();
  const hidden = G.hiddenDays || new Set();

  // 鈹€鈹€ 琛ㄥご 鈹€鈹€
  const wdShort=['鏃?,'涓€','浜?,'涓?,'鍥?,'浜?,'鍏?];
  let hRow1 = `<tr>
    <th class="col-pos" rowspan="2">宀椾綅</th>
    <th class="col-def" rowspan="2">榛樿浜?/th>
    <th class="col-wl" rowspan="2">宸ヤ綔閲?/th>`;
  let hRow2 = `<tr>`;
  for(let d=1;d<=days;d++){
    if(hidden.has(d)) continue;
    const wd=getWeekday(G.year,G.month,d);
    const isSat=wd===6, isSun=wd===0, isFri=wd===5;
    const isToday=(G.year===todayY&&G.month===todayM&&d===todayD);
    let cls='col-day';
    if(isSat) cls+=' week-sat';
    if(isSun) cls+=' week-sun';
    if(isFri) cls+=' week-fri';
    if(isWeekStart(G.year,G.month,d)) cls+=' week-start-col';
    const style=isToday?'style="background:#bbdefb !important;font-weight:bold"':'';
    hRow1 += `<th class="${cls}" ${style}>${d}</th>`;
    hRow2 += `<th class="${cls}" ${style}>鍛?{wdShort[wd]}</th>`;
  }
  hRow1 += '</tr>'; hRow2 += '</tr>';
  $('tbl-head').innerHTML = hRow1 + hRow2;

  // 鈹€鈹€ 琛ㄤ綋 鈹€鈹€
  let html='';
  for(const pos of G.positions){
    const dp = pos.default_person || '';
    let catBadge='';
    if(pos.category==='娆″搧') catBadge='<span class="tag tag-cpin">娆?/span>';
    if(pos.category==='浜笢') catBadge='<span class="tag tag-jd">浜?/span>';
    html+=`<tr data-pid="${pos.id}" draggable="true">
      <td class="col-pos"><span class="drag-handle" title="鎷栧姩鎺掑簭">鈰嫯</span><b>${pos.name}</b>${catBadge}</td>
      <td class="col-def" style="font-size:11px">${dp||'<span style="color:#999">--</span>'}</td>
      <td class="col-wl">${pos.workload}</td>`;
    for(let d=1;d<=days;d++){
      if(hidden.has(d)) continue;
      const wd=getWeekday(G.year,G.month,d);
      const isPast=(G.year<todayY)||(G.year===todayY&&G.month<todayM)||(G.year===todayY&&G.month===todayM&&d<todayD);
      const isSat=wd===6, isSun=wd===0;
      let colCls='';
      if(isWeekStart(G.year,G.month,d)) colCls='week-start-col';

      const cell = G.schedule[d]?.[pos.id] || null;
      html+=`<td class="${colCls}">`;
      html+=renderCell(pos, d, cell, isPast, isSat, isSun);
      html+='</td>';
    }
    html+='</tr>';
  }
  $('tbl-body').innerHTML=html;

  // 缁戝畾浜嬩欢
  $('tbl-body').querySelectorAll('.cell').forEach(el=>{
    el.addEventListener('click', onCellClick);
    el.addEventListener('contextmenu', onCellRightClick);
  });

  // 鍒濆鍖栬鎷栨嫿鎺掑簭
  initRowDragSort();
}

// 鈹€鈹€ 琛屾嫋鎷芥帓搴?鈹€鈹€
function initRowDragSort(){
  const tbody = $('tbl-body');
  let draggedPid = null;

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('dragstart', e => {
      draggedPid = tr.dataset.pid;
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      // 璁剧疆鎷栨嫿鍥惧儚锛堝彲閫夛級
      e.dataTransfer.setData('text/plain', draggedPid);
    });

    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach(r => {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      draggedPid = null;
    });

    tr.addEventListener('dragover', e => {
      e.preventDefault();
      if(!draggedPid || draggedPid === tr.dataset.pid) return;

      const rect = tr.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const isAbove = e.clientY < midY;

      tbody.querySelectorAll('tr').forEach(r => {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      if(isAbove){
        tr.classList.add('drag-over-top');
      } else {
        tr.classList.add('drag-over-bottom');
      }
    });

    tr.addEventListener('dragleave', () => {
      tr.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    tr.addEventListener('drop', async e => {
      e.preventDefault();
      if(!draggedPid || draggedPid === tr.dataset.pid) return;

      const rect = tr.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const isAbove = e.clientY < midY;

      // 閲嶆柊鎺掑簭 G.positions
      const oldIndex = G.positions.findIndex(p => p.id === draggedPid);
      const targetIndex = G.positions.findIndex(p => p.id === tr.dataset.pid);
      if(oldIndex === -1 || targetIndex === -1) return;

      const [moved] = G.positions.splice(oldIndex, 1);
      let newIndex = isAbove ? targetIndex : targetIndex + 1;
      if(oldIndex < targetIndex) newIndex--;
      G.positions.splice(newIndex, 0, moved);

      // 淇濆瓨鍒板悗绔?
      try{
        await api('/api/positions/reorder', 'POST', G.positions.map(p => p.id));
        renderTable();
        toast('宀椾綅椤哄簭宸蹭繚瀛?);
      }catch(err){
        toast('淇濆瓨椤哄簭澶辫触: ' + err.message);
        await fetchAll(); // 鍥炴粴
      }
    });
  });
}

// 鈹€鈹€ 鍒楁樉绀鸿缃?鈹€鈹€
async function loadHiddenDays(){
  // 浼樺厛浠庢湇鍔″櫒鍔犺浇锛堝悓姝ョ粰鎵€鏈夌敤鎴凤級
  try{
    const arr = await api(`/api/hidden-days/${G.year}/${G.month}`);
    if(Array.isArray(arr)){
      G.hiddenDays = new Set(arr);
      // 鍚屾椂鏇存柊鏈湴缂撳瓨
      const key = `hiddenDays_${G.year}_${G.month}`;
      localStorage.setItem(key, JSON.stringify(arr));
      return;
    }
  }catch(e){}
  // 鏈嶅姟鍣ㄥけ璐?鈫?fallback 鍒?localStorage
  const key = `hiddenDays_${G.year}_${G.month}`;
  try{
    const raw = localStorage.getItem(key);
    if(raw){
      const arr = JSON.parse(raw);
      G.hiddenDays = new Set(arr);
    } else {
      G.hiddenDays = new Set();
    }
  }catch(e){
    G.hiddenDays = new Set();
  }
}
async function saveHiddenDays(){
  const arr = [...G.hiddenDays];
  const key = `hiddenDays_${G.year}_${G.month}`;
  // 浼樺厛淇濆瓨鍒版湇鍔″櫒
  try{
    await api(`/api/hidden-days/${G.year}/${G.month}`, 'POST', arr);
  }catch(e){
    // 鏈嶅姟鍣ㄥけ璐?鈫?淇濆瓨鍒版湰鍦?
  }
  // 濮嬬粓淇濆瓨鍒?localStorage 浣滀负鏈湴缂撳瓨
  localStorage.setItem(key, JSON.stringify(arr));
}
function openColSettings(){
  try{
    // 闃插尽鎬ф鏌ワ細纭繚骞存湀鏈夋晥
    const year = Number(G.year);
    const month = Number(G.month);
    if(!year || !month || month < 1 || month > 12){
      toast('鏃ユ湡鏁版嵁寮傚父锛岃鍒锋柊椤甸潰鍚庨噸璇?, 3000);
      return;
    }
    const days = daysInMonth(year, month);
    if(!days || days < 1 || days > 31){
      toast('鏃ユ湡璁＄畻寮傚父锛岃鍒锋柊椤甸潰鍚庨噸璇?, 3000);
      return;
    }
    const hidden = G.hiddenDays || new Set();
    const wdNames = ['鏃?,'涓€','浜?,'涓?,'鍥?,'浜?,'鍏?];
    let html = '';
    for(let d=1; d<=days; d++){
      const wd = getWeekday(year, month, d);
      const wdName = wdNames[wd] || '?';
      const isHidden = hidden.has(d);
      const cls = isHidden ? 'col-settings-item hidden-col' : 'col-settings-item';
      html += `<label class="${cls}">
        <input type="checkbox" ${!isHidden ? 'checked' : ''} data-day="${d}">
        <span class="col-settings-label">
          <span class="day-num">${d}鏃?/span>
          <span class="day-wd">鍛?{wdName}</span>
        </span>
      </label>`;
    }
    $('col-settings-grid').innerHTML = html;
    $('col-settings-modal').style.display = 'flex';
  }catch(e){
    console.error('[openColSettings] 閿欒:', e);
    toast('鎵撳紑鍒楄缃け璐ワ紝璇峰埛鏂伴〉闈㈠悗閲嶈瘯', 3000);
  }
}
function closeColSettings(){
  $('col-settings-modal').style.display = 'none';
}
function selectAllCols(show){
  $('col-settings-grid').querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = show;
  });
}
function selectWeekdaysOnly(){
  const wdNames = ['鏃?,'涓€','浜?,'涓?,'鍥?,'浜?,'鍏?];
  $('col-settings-grid').querySelectorAll('input[type=checkbox]').forEach(cb => {
    const d = +cb.dataset.day;
    const wd = getWeekday(G.year, G.month, d);
    cb.checked = (wd >= 1 && wd <= 5); // 鍛ㄤ竴鍒板懆浜?
  });
}
async function applyColSettings(){
  const hidden = new Set();
  $('col-settings-grid').querySelectorAll('input[type=checkbox]').forEach(cb => {
    if(!cb.checked) hidden.add(+cb.dataset.day);
  });
  G.hiddenDays = hidden;
  await saveHiddenDays();
  renderTable();
  renderDayStat();
  renderWeekStat();
  renderMonthStat();
  closeColSettings();
  const hiddenCount = hidden.size;
  if(hiddenCount > 0){
    toast(`宸查殣钘?${hiddenCount} 鍒楋紝鍒锋柊缁熻`);
  } else {
    toast('鏄剧ず鍏ㄩ儴鍒?);
  }
}

function renderCell(pos, day, cell, isPast, isSat, isSun){
  const status = cell ? cell.status : (pos.default_person ? 'on' : 'pending');
  const person = cell ? cell.person : (pos.default_person || '');
  const pid=pos.id;
  const pastCls = isPast ? ' cell-past' : '';

  // 鍒ゆ柇榛樿浜烘槸鍚︽槸灏忕粍锛堣€岄潪涓汉锛?
  const isGroupDefault = !!G.groups.find(g => g.name === person);

  if(status==='on'){
    if(isGroupDefault){
      // 灏忕粍榛樿浜?鈫?鏄剧ず灏忕粍鍚嶏紙娴呰摑锛屽畬鏁存樉绀猴級
      return `<div class="cell cell-group-on${pastCls}" data-pid="${pid}" data-day="${day}" data-status="on" data-person="${person}" title="${person} 鍦ㄧ彮">${person}</div>`;
    }
    return `<div class="cell cell-on${pastCls}" data-pid="${pid}" data-day="${day}" data-status="on" data-person="${person}" title="${person} 鍦ㄧ彮">
      <span class="check-icon">鉁?/span></div>`;
  }
  if(status==='off'){
    return `<div class="cell cell-off${pastCls}" data-pid="${pid}" data-day="${day}" data-status="off" data-person="${person}" title="${person} 浼戝亣">
      <span class="cross-icon">鉁?/span></div>`;
  }
  if(status==='substitute'){
    return `<div class="cell cell-sub${pastCls}" data-pid="${pid}" data-day="${day}" data-status="substitute" data-person="${person}" title="鏇跨彮: ${person}" style="font-size:10px;max-width:36px;overflow:hidden;text-overflow:ellipsis">
      ${person||'鏇?}</div>`;
  }
  // pending
  return `<div class="cell cell-pending${pastCls}" data-pid="${pid}" data-day="${day}" data-status="pending" data-person="" title="寰呭畾锛堥渶璁剧疆鏇跨彮锛?>?</div>`;
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
//  灏忕粍鍏ㄤ紤鑷姩鏇跨彮瑙﹀彂
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲

/**
 * 鑾峰彇鏌愪汉鎵€灞炵殑灏忕粍锛堥€氳繃 staff[n].group_id 鍏宠仈锛?
 */
function getPersonGroup(name) {
  const person = G.staff.find(s => s.name === name);
  if (!person || !person.group_id) return null;
  return G.groups.find(g => g.id === person.group_id) || null;
}

/**
 * 鑾峰彇灏忕粍鐨勬墍鏈夋垚鍛樺悕瀛?
 */
function getGroupMemberNames(group) {
  if (!group) return [];
  return G.staff.filter(s => s.group_id === group.id).map(s => s.name);
}

/**
 * 妫€鏌ユ煇澶╁皬缁勬槸鍚﹀叏浼?
 * 閫昏緫锛氭墍鏈夋垚鍛樺綋澶╅兘 off
 */
function checkGroupFullyOff(group, day) {
  const members = getGroupMemberNames(group);
  if (members.length === 0) return false;
  for (const name of members) {
    const status = getPersonStatusOnDay(name, day);
    if (status !== 'off') return false;
  }
  return true;
}

/**
 * 鑾峰彇鏌愪汉鏌愬ぉ鐨勭姸鎬侊紙浠?G.schedule 涓鍙栵級
 * 杩斿洖: 'on'|'off'|'substitute'|'pending'
 */
function getPersonStatusOnDay(name, day) {
  const dayStr = String(day);
  const monthData = G.schedule || {};
  // 閬嶅巻鎵€鏈夊矖浣嶏紝鎵惧埌姝や汉鐨勭姸鎬?
  for (const pid of Object.keys(monthData[dayStr] || {})) {
    const cell = monthData[dayStr][pid];
    if (cell && cell.person === name) {
      return cell.status || 'on';
    }
  }
  // 濡傛灉娌℃壘鍒帮紝妫€鏌ユ槸鍚︽槸鏌愬矖浣嶇殑榛樿浜轰笖娌¤鏇夸唬
  const pos = G.positions.find(p => (p.default_person || '').trim() === name);
  if (pos) {
    const cell = monthData[dayStr] ? monthData[dayStr][pos.id] : null;
    if (!cell || cell.status === 'on') return 'on';  // 榛樿浜哄湪鐝?
  }
  return 'off';  // 鎵句笉鍒帮紝榛樿璁や负鏄紤鎭?
}

/**
 * 鎵惧埌鎵€鏈変互璇ュ皬缁勪负榛樿浜虹殑宀椾綅
 */
function findPositionsByGroup(group) {
  if (!group) return [];
  return G.positions.filter(p => (p.default_person || '').trim() === group.name);
}

/**
 * 褰撳皬缁勫叏浼戞椂锛岃嚜鍔ㄤ负鐩稿叧宀椾綅瀹夋帓鏇跨彮
 */
async function triggerAutoSubstituteForGroup(group, day) {
  const positions = findPositionsByGroup(group);
  if (positions.length === 0) return;

  toast(`銆?{group.name}銆戝叏浼戯紝姝ｅ湪鑷姩瀹夋帓鏇跨彮...`, 2000);

  for (const pos of positions) {
    try {
      const res = await api('/api/auto-substitute', 'POST', {
        year: G.year,
        month: G.month,
        day: day,
        pos_id: pos.id
      });

      if (res.success && res.person) {
        await saveCellState(pos.id, day, 'substitute', res.person);
        toast(`銆?{pos.name}銆戝凡瀹夋帓鏇跨彮: ${res.person}`);
      }
    } catch(e) {
      console.error('鑷姩鏇跨彮澶辫触:', pos.name, e);
    }
  }
}

/**
 * 褰撳皬缁勬仮澶嶏紙涓嶅啀鍏ㄤ紤锛夋椂锛屽彇娑堟浛鐝€佹仮澶嶅皬缁勪笂鐝?
 */
async function triggerGroupRestore(group, day) {
  try{
    // 鍏堟鏌ュ皬缁勬槸鍚︾湡鐨勪笉鍐嶅叏浼?
    if (checkGroupFullyOff(group, day)) return;  // 杩樻槸鍏ㄤ紤锛屼笉澶勭悊

    const positions = findPositionsByGroup(group);
    if (positions.length === 0) return;

    let restoredCount = 0;
    for (const pos of positions) {
      // 妫€鏌ヨ宀椾綅褰撳墠鏄惁鏄?substitute 鐘舵€侊紙琚浛鐝腑锛?
      const dayData = G.schedule[day] || {};
      const cell = dayData[pos.id];
      if (cell && cell.status === 'substitute') {
        // 鍙栨秷鏇跨彮锛屾仮澶嶄负灏忕粍鍚?on 鐘舵€?
        await saveCellState(pos.id, day, 'on', group.name);
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      toast(`銆?{group.name}銆戝凡鎭㈠涓婄彮锛?{restoredCount}涓矖浣嶏級`);
    }
  }catch(e){
    console.error('灏忕粍鎭㈠澶辫触:', e);
  }
}

/**
 * 涓哄崟涓矖浣嶈嚜鍔ㄥ畨鎺掓浛鐝紙鐢ㄤ簬涓汉榛樿浜轰紤鎭椂锛?
 */
async function triggerAutoSubstituteForPos(pos_id, day) {
  const pos = G.positions.find(p => p.id === pos_id);
  if (!pos?.default_person) {
    console.log('[triggerAutoSubstituteForPos] 鏃犻粯璁や汉锛岃烦杩?', pos_id);
    return;
  }

  try {
    console.log('[triggerAutoSubstituteForPos] 寮€濮嬫浛鐝?', pos.name, 'day=', day);
    const res = await api('/api/auto-substitute', 'POST', {
      year: G.year,
      month: G.month,
      day: day,
      pos_id: pos_id
    });
    console.log('[triggerAutoSubstituteForPos] API杩斿洖:', pos.name, res);

    if (res.success && res.person) {
      await saveCellState(pos_id, day, 'substitute', res.person);
      console.log('[triggerAutoSubstituteForPos] 宸茶涓簊ubstitute:', pos.name, res.person);
    } else {
      console.warn('[triggerAutoSubstituteForPos] 鏃犲彲鐢ㄦ浛鐝汉:', pos.name, res);
    }
  } catch(e) {
    console.error('[triggerAutoSubstituteForPos] 寮傚父:', pos.name, e);
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  鏍煎瓙鐐瑰嚮浜嬩欢
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function onCellClick(e){
  e.preventDefault();
  const el = e.currentTarget;
  if(el.classList.contains('cell-past')) return;
  const pid = el.dataset.pid;
  const day = +el.dataset.day;
  const status = el.dataset.status;
  const person = el.dataset.person;

  // 鎵惧矖浣?
  const pos = G.positions.find(p=>p.id===pid);
  if(!pos) return;

  // 鐘舵€佸垏鎹㈤€昏緫
  // on(榛樿浜? 鈫?off 鈫?鑷姩鏇跨彮
  // on(鏇跨彮浜? 鈫?off 鈫?pending(濡傛湁榛樿浜哄垯鍥瀘n)
  // off 鈫?on(濡傛湁榛樿浜?
  // pending 鈫?鑷姩鏇跨彮
  // substitute 鈫?off 鈫?on(榛樿)

  const today=new Date(); const todayD=today.getDate(),todayM=today.getMonth()+1,todayY=today.getFullYear();
  const isPast=(G.year<todayY)||(G.year===todayY&&G.month<todayM)||(G.year===todayY&&G.month===todayM&&day<todayD);
  if(isPast){ toast('鍘嗗彶鏃ユ湡涓嶅彲淇敼'); return; }

  if(status==='on'){
    // 鍦ㄧ彮 鈫?鑷姩鏇跨彮
    await autoSubstitute(pid, day);
  } else if(status==='off'){
    // 浼戝亣 鈫?鎭㈠榛樿浜猴紙鍚屾椂鎭㈠璇ヤ汉鎵€鏈夊矖浣嶏級
    if(pos.default_person){
      const dp = (pos.default_person || '').trim();
      // 鎵惧埌鎵€鏈変互璇ヤ汉涓洪粯璁や汉鐨勫矖浣?
      const allPosWithSameDp = G.positions.filter(p => (p.default_person || '').trim() === dp);
      
      let restoredCount = 0;
      for(const p of allPosWithSameDp){
        await saveCellState(p.id, day, 'on', dp);
        restoredCount++;
      }
      
      if(restoredCount > 1){
        toast(`${dp} 宸叉仮澶嶅湪鐝紙鍏?{restoredCount}涓矖浣嶏級`);
      } else {
        toast(`${dp} 宸茶涓哄湪鐝璥);
      }
    } else {
      await saveCellState(pid, day, 'pending', '');
      toast(`鏃犻粯璁や汉锛岃鍙抽敭璁剧疆鏇跨彮`);
    }
  } else if(status==='substitute'){
    // 鏇跨彮 鈫?鎭㈠榛樿浜轰笂鐝紙鍚屾椂鎭㈠璇ヤ汉鎵€鏈夊矖浣嶏級
    if(pos.default_person){
      const dp = (pos.default_person || '').trim();
      // 鎵惧埌鎵€鏈変互璇ヤ汉涓洪粯璁や汉鐨勫矖浣?
      const allPosWithSameDp = G.positions.filter(p => (p.default_person || '').trim() === dp);
      
      let restoredCount = 0;
      for(const p of allPosWithSameDp){
        await saveCellState(p.id, day, 'on', dp);
        restoredCount++;
      }
      
      if(restoredCount > 1){
        toast(`${dp} 宸叉仮澶嶅湪鐝紙鍏?{restoredCount}涓矖浣嶏級`);
      } else {
        toast(`${dp} 宸叉仮澶嶅湪鐝璥);
      }
    } else {
      await saveCellState(pid, day, 'pending', '');
      toast('鏃犻粯璁や汉锛岃鍙抽敭璁剧疆鏇跨彮');
    }
  } else if(status==='pending'){
    // pending 鈫?鑷姩鏇跨彮
    await autoSubstitute(pid, day);
  }
}

async function autoSubstitute(pid, day){
  try{
    const pos = G.positions.find(p=>p.id===pid);
    
    // 鑾峰彇褰撳墠鏍煎瓙鐨勭姸鎬?
    const cellEl = document.querySelector(`[data-pid="${pid}"][data-day="${day}"]`);
    const currentStatus = cellEl ? cellEl.dataset.status : '';
    
    const dp = (pos.default_person || '').trim();
    
    // 濡傛灉褰撳墠鏄?on 鐘舵€佷笖鏄粯璁や汉鍦ㄧ彮锛岃缃负浼戞伅骞舵壘鏇跨彮浜?
    if(currentStatus === 'on'){
      // 鎵惧埌鎵€鏈変互璇ヤ汉涓洪粯璁や汉鐨勫矖浣?
      const allPosWithSameDp = G.positions.filter(p => (p.default_person || '').trim() === dp);
      
      if(allPosWithSameDp.length > 1){
        // 璇ヤ汉鏄涓矖浣嶇殑榛樿浜?鈫?鍚屾椂澶勭悊鎵€鏈夊矖浣?
        let subCount = 0;
        let offCount = 0;
        
        for(const p of allPosWithSameDp){
          await saveCellState(p.id, day, 'off', dp);  // 鍏堟爣璁颁紤鎭紙涓存椂锛?
          
          // 妫€鏌ユ槸鍚﹀凡琚嚜鍔ㄦ浛鐝紙saveCellState鍐呴儴triggerAutoSubstituteForPos宸插鐞嗭級
          const autoSubCell = G.schedule[day]?.[p.id];
          if(autoSubCell?.status === 'substitute'){
            subCount++;
            continue;  // 宸茶鑷姩鏇跨彮锛岃烦杩?
          }
          
          // 涓鸿宀椾綅鎵炬浛鐝汉锛堣烦杩囧綋鍓嶆鍦ㄥ鐞嗙殑宀椾綅锛屾渶鍚庡崟鐙鐞嗭級
          if(p.id === pid) continue;
          
          const res = await api('/api/auto-substitute', 'POST', {
            year:G.year, month:G.month, day, pos_id:p.id
          });
          
          const pDp = (p.default_person || '').trim();
          if(res.success && (res.person || '').trim() !== pDp){
            await saveCellState(p.id, day, 'substitute', res.person);
            subCount++;
          } else {
            // 鏃犲彲鐢ㄦ浛鐝汉 鈫?pending锛?锛夛紝涓嶈兘淇濈暀 off锛堣繚鍙嶇孩绾匡級
            await saveCellState(p.id, day, 'pending', '');
            offCount++;
          }
        }
        
        // 鏈€鍚庡鐞嗙敤鎴风偣鍑荤殑褰撳墠宀椾綅
        // 鍏堟鏌ユ槸鍚﹀凡琚嚜鍔ㄦ浛鐝?
        const mainAutoSub = G.schedule[day]?.[pid];
        if(mainAutoSub?.status === 'substitute'){
          toast(`宸茶嚜鍔ㄥ畨鎺掓浛鐝? ${mainAutoSub.person}`);
        } else {
          const mainRes = await api('/api/auto-substitute', 'POST', {
            year:G.year, month:G.month, day, pos_id:pid
          });
        
          if(mainRes.success && (mainRes.person || '').trim() !== dp){
            await saveCellState(pid, day, 'substitute', mainRes.person);
            subCount++;
          } else {
            // 鏃犲彲鐢ㄦ浛鐝汉 鈫?pending锛屼笉鐣?off
            await saveCellState(pid, day, 'pending', '');
            offCount++;
          }
        }
        
        // 姝ラ1锛氬厛澶勭悊 dp 鍘熸潵鎵挎媴鐨勬浛鐝换鍔★紙dp 鑷繁鍘绘浛鍒汉鐨勫矖浣嶏級
        const cascRes1 = await api('/api/cascade-off', 'POST', {
          year:G.year, month:G.month, day, person: dp, person_is_off: true
        });
        if(cascRes1.success && cascRes1.updated && cascRes1.updated.length > 0){
          for(const u of cascRes1.updated){
            await saveCellState(u.pos_id, day, u.status, u.person || '');
          }
          subCount += cascRes1.updated.filter(u=>u.status==='substitute').length;
          offCount += cascRes1.updated.filter(u=>u.status==='pending').length;
        }

        toast(`${dp} 宸茶涓轰紤鎭紝宸插畨鎺?${subCount} 涓浛鐝紝${offCount} 涓矖浣嶅緟鍒嗛厤`, 3000);

        // 姝ラ2锛氱骇鑱旀洿鏂帮細妫€鏌ユ柊鏇跨彮浜烘槸鍚︿篃闇€瑕佺骇鑱斿鐞?
        await cascadeUpdateIfNeeded(day);
      } else {
        // 鍙槸涓€涓矖浣嶇殑榛樿浜?鈫?鍗曠嫭澶勭悊
        await saveCellState(pid, day, 'off', dp);  // 鍏堟爣璁颁紤鎭?

        // 妫€鏌ユ槸鍚﹀凡琚嚜鍔ㄦ浛鐝紙saveCellState鍐呴儴triggerAutoSubstituteForPos宸插鐞嗭級
        const autoSubCell = G.schedule[day]?.[pid];
        if(autoSubCell?.status === 'substitute'){
          toast(`宸茶嚜鍔ㄥ畨鎺掓浛鐝? ${autoSubCell.person}`);
        } else {
          // 姝ラ1锛氬厛澶勭悊 dp 鍘熸潵鎵挎媴鐨勬浛鐝换鍔★紙dp 鑷繁鍘绘浛鍒汉鐨勫矖浣嶏級
          const cascResS = await api('/api/cascade-off', 'POST', {
            year:G.year, month:G.month, day, person: dp, person_is_off: true
          });
          if(cascResS.success && cascResS.updated && cascResS.updated.length > 0){
            for(const u of cascResS.updated){
              await saveCellState(u.pos_id, day, u.status, u.person || '');
            }
          }

          // 姝ラ2锛氳皟鐢?API 涓?dp 鐨勯粯璁ゅ矖鎵炬浛鐝汉
          const res = await api('/api/auto-substitute', 'POST', {
            year:G.year, month:G.month, day, pos_id:pid
          });
          console.log('[autoSubstitute] API杩斿洖:', res);
          
          if(res.success && (res.person || '').trim() !== dp){
            // 鎵惧埌闈為粯璁や汉鐨勬浛鐝汉
            await saveCellState(pid, day, 'substitute', res.person);
            toast(`宸插畨鎺掓浛鐝? ${res.person}`);
            // 姝ラ3锛氱骇鑱旀洿鏂帮細妫€鏌ユ浛鐝汉鏄惁涔熼渶瑕佺骇鑱斿鐞?
            await cascadeUpdateIfNeeded(day);
          } else {
            // 鏃犲彲鐢ㄦ浛鐝汉 鈫?涓嶈兘淇濈暀 off锛堣繚鍙嶇孩绾匡細宀椾綅蹇呴』鏈変汉锛?
            // 鏀逛负 pending锛堝緟鍒嗛厤锛夛紝閬垮厤鏄剧ず绾㈠弶
            await saveCellState(pid, day, 'pending', '');
            toast(`${dp} 宸茶涓轰紤鎭紝鏆傛棤鏇跨彮浜猴紙寰呮墜鍔ㄥ畨鎺掞級`, 3000);
          }
        }
      }
      return;
    }
    
    // 鍏朵粬鎯呭喌锛歱ending 鎴?substitute锛岃皟鐢?API 澶勭悊
    const res = await api('/api/auto-substitute', 'POST', {
      year:G.year, month:G.month, day, pos_id:pid
    });
    if(res.success){
      const isDefault = (res.person || '').trim() === dp;
      const newStatus = isDefault ? 'on' : 'substitute';
      await saveCellState(pid, day, newStatus, res.person);
      if(isDefault){
        toast(`${res.person} 宸插湪鐝璥);
      } else {
        toast(`宸插畨鎺掓浛鐝? ${res.person}`);
      }
    } else {
      toast('鏃犲彲鐢ㄦ浛鐝汉: '+res.msg, 3000);
      await saveCellState(pid, day, 'pending', '');
    }
  }catch(e){
    console.error('[autoSubstitute] 寮傚父:', e);
    toast('鎿嶄綔澶辫触: '+e.message, 3000);
    // 閬垮厤鐣欎笅 off锛堣繚鍙嶇孩绾匡細宀椾綅蹇呴』鏈変汉锛夛紝鏀逛负 pending
    try{
      await saveCellState(pid, day, 'pending', '');
    }catch(e2){ console.error('[autoSubstitute] 鍥炴粴pending涔熷け璐?', e2); }
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  绾ц仈鏇存柊锛氬綋鏇跨彮浜鸿嚜宸变篃闇€瑕佷紤鎭椂锛岃嚜鍔ㄦ浛鎹㈠叾鏇跨彮宀椾綅
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function cascadeUpdateIfNeeded(day){
  // 鑾峰彇褰撳ぉ鎵€鏈夋暟鎹?
  const dayData = G.schedule[day] || {};
  if(!dayData) return;

  // 鏀堕泦鎵€鏈?substitute 鐘舵€佺殑宀椾綅鍙婂叾鏇跨彮浜?
  const subMap = {};  // person -> [pos_ids]
  for(const [pid, cell] of Object.entries(dayData)){
    if(cell.status === 'substitute' && cell.person){
      const name = cell.person.trim();
      if(!subMap[name]) subMap[name] = [];
      subMap[name].push(pid);
    }
  }

  // 妫€鏌ユ瘡涓浛鐝汉鏄惁鐪熺殑鍦ㄤ紤鎭紙鍏堕粯璁ゅ矖浣嶆湁 off/鏈汉 璁板綍锛?
  let cascadeCount = 0;
  for(const [personName, posIds] of Object.entries(subMap)){
    // 鍒ゆ柇鏍囧噯锛氶粯璁ゅ矖浣嶇姸鎬佷负 off 涓旇褰曚汉鏄湰浜?鈫?鎵嶇畻鐪熸浼戞伅
    // 娉ㄦ剰锛氶粯璁ゅ矖琚埆浜哄崰浜?on/substitute)涓嶄竴瀹氭槸浼戞伅锛屾湁鍙兘鏄吋宀楁儏鍐?
    let isResting = false;
    for(const pos of G.positions){
      const dp = (pos.default_person || '').trim();
      if(dp === personName){
        const posCell = dayData[pos.id];
        if(posCell && posCell.status === 'off' && posCell.person === personName){
          isResting = true;
          break;
        }
      }
    }

    if(isResting){
      // 杩欎釜浜轰篃鍦?浼戞伅"锛岄渶瑕佺骇鑱旀浛鎹粬鎵€鏈夌殑鏇跨彮宀椾綅
      try{
        const res = await api('/api/cascade-off', 'POST', {
          year:G.year, month:G.month, day, person: personName,
          person_is_off: true  // 宸茬‘璁ゆ浜哄湪浼戞伅锛屼繚鎶ff璁板綍
        });
        if(res.success && res.updated && res.updated.length > 0){
          cascadeCount += res.updated.length;
          for(const u of res.updated){
            await saveCellState(u.pos_id, day, u.status, u.person || '');
          }
        }
      } catch(e){
        console.error('绾ц仈鏇存柊澶辫触:', e);
      }
    }
  }

  if(cascadeCount > 0){
    toast(`绾ц仈鏇存柊锛氬凡鑷姩鏇挎崲${cascadeCount}涓彈褰卞搷宀椾綅`, 2500);
  }
}

// 鍙抽敭鑿滃崟
function onCellRightClick(e){
  e.preventDefault();
  const el = e.currentTarget;
  if(el.classList.contains('cell-past')) return;
  const pid = el.dataset.pid;
  const day = +el.dataset.day;
  const status = el.dataset.status;
  const pos = G.positions.find(p=>p.id===pid);

  const menu = $('ctx-menu');

  // 鍒ゆ柇褰撳ぉ鏄熸湡
  const wd = getWeekday(G.year, G.month, day); // 0=鍛ㄦ棩,6=鍛ㄥ叚
  const isSat = wd===6;

  // 鑾峰彇鍙敤鏇跨彮浜?
  const busyToday = new Set();
  const dayData = G.schedule[day] || {};
  for(const [p, c] of Object.entries(dayData)){
    if(c.status==='on'||c.status==='substitute') if(c.person) busyToday.add(c.person);
  }

  const posMap = {};
  for(const p of G.positions) posMap[p.id]=p;

  function canSub(member){
    if(member.saturday_only && !isSat) return false;
    if(member.no_substitute) return false;  // 涓嶆浛鐝汉鍛樹笉鑳芥浛鍒汉
    if(pos.category==='娆″搧' && !member.can_cpin) return false;
    if(pos.category==='浜笢' && !member.can_jd) return false;
    return true;
  }

  // 鎵鹃粯璁や汉鐨勬浛鐝€欓€変汉锛堝熀浜庡綋鏃ュ凡鏈夊矖浣嶈绠楀伐浣滈噺锛?
  const candidates = G.staff.filter(m=>canSub(m));

  // 鍙抽敭鑿滃崟锛氱洿鎺ラ€夋嫨鏇跨彮浜?
  let html=`<div style="padding:4px 12px;font-size:11px;color:#999">閫夋嫨鏇跨彮浜猴細</div>`;
  for(const m of candidates){
    const busy = busyToday.has(m.name);
    html+=`<div class="ctx-staff-item ${busy?'style="opacity:.4"':''}" onclick="ctxSetSub('${pid}',${day},'${m.name}')">
      ${m.name}${busy?' (宸叉帓鐝?':''}
    </div>`;
  }
  if(candidates.length===0){
    html+=`<div style="padding:6px 16px;font-size:11px;color:#999">鏃犲彲鐢ㄦ浛鐝汉</div>`;
  }
  if(pos.default_person){
    html+=`<div class="ctx-sep"></div>
      <div class="ctx-item" onclick="ctxRestoreDefault('${pid}',${day})">
        <span>鈫?/span><span>鎭㈠榛樿浜?(${pos.default_person})</span></div>`;
  }
  menu.innerHTML=html;
  menu.style.display='block';
  menu.style.left=Math.min(e.clientX, window.innerWidth-160)+'px';
  menu.style.top=Math.min(e.clientY, window.innerHeight-300)+'px';
  G.userBusy = true;  // 鍙抽敭鑿滃崟鎵撳紑鏃舵殏鍋滆疆璇?
}

async function ctxRestoreDefault(pid, day){
  $('ctx-menu').style.display='none';
  const pos = G.positions.find(p=>p.id===pid);
  if(pos?.default_person){
    await saveCellState(pid, day, 'on', pos.default_person);
    toast(`${pos.default_person} 宸茶涓哄湪鐝璥);
  } else {
    await saveCellState(pid, day, 'pending', '');
    toast(`鏃犻粯璁や汉`);
  }
}
async function ctxSetSub(pid, day, person){
  $('ctx-menu').style.display='none';
  await saveCellState(pid, day, 'substitute', person);
  toast(`宸插畨鎺掓浛鐝? ${person}`);
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  淇濆瓨鏍煎瓙鐘舵€?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function saveCellState(pos_id, day, status, person){
  // 鏈湴鏇存柊
  if(!G.schedule[day]) G.schedule[day]={};
  G.schedule[day][pos_id]={status, person};
  // 閲嶇粯璇ユ牸瀛?
  const cell = document.querySelector(`.cell[data-pid="${pos_id}"][data-day="${day}"]`);
  if(cell){
    const pos=G.positions.find(p=>p.id===pos_id);
    const wd=getWeekday(G.year,G.month,day);
    const today=new Date();
    const isPast=(G.year<today.getFullYear())||(G.year===today.getFullYear()&&G.month<today.getMonth()+1)||(G.year===today.getFullYear()&&G.month===today.getMonth()+1&&day<today.getDate());
    const newHtml=renderCell(pos, day, {status,person}, isPast, wd===6, wd===0);
    const wrapper=cell.parentElement;
    wrapper.innerHTML=newHtml;
    wrapper.querySelector('.cell').addEventListener('click', onCellClick);
    wrapper.querySelector('.cell').addEventListener('contextmenu', onCellRightClick);
  }
  // 鍚庣鎸佷箙鍖?
  let clearedPositions = [];
  try{
    const saveRes = await api(`/api/schedule/${G.year}/${G.month}/day`, 'POST', {
      day, pos_id, status, person
    });
    clearedPositions = saveRes.cleared_positions || [];
  }catch(e){
    toast('淇濆瓨澶辫触: '+e.message, 3000);
  }

  // 鈹€鈹€ 鑷姩鏇跨彮/鎭㈠澶勭悊 鈹€鈹€
  if(person){
    try{
      // 鏃犺鏄惁灞炰簬灏忕粍锛屼釜浜哄矖浣嶄紤鎭兘瑕佸厛鏇跨彮
      if(status === 'off'){
        console.log('[saveCellState] 涓汉浼戞伅 鈫?鑷姩鏇跨彮:', person, 'pos=', pos_id);
        await triggerAutoSubstituteForPos(pos_id, day);

        // 绾ц仈鏇跨彮锛氬悗绔繑鍥炶娓呴櫎鐨勫矖浣嶏紙姝や汉浼戞伅鍚庝笉鑳藉啀鏇胯繖浜涘矖浣嶏級
        if(clearedPositions.length > 0){
          console.log('[saveCellState] 绾ц仈鏇跨彮锛堝悗绔€氱煡锛夛細', person, '琚竻闄ょ殑宀椾綅:', clearedPositions);
          for(const pid of clearedPositions){
            await triggerAutoSubstituteForPos(pid, day);
          }
        }

        // 鍏滃簳锛氬墠绔啀妫€鏌ヤ竴娆″唴瀛樼姸鎬侊紙闃叉鍚庣鍜屽墠绔姸鎬佷笉涓€鑷达級
        const dayData = G.schedule[day] || {};
        const coveredPosIds = [];
        for(const [pid, cell] of Object.entries(dayData)){
          if(pid !== pos_id && cell && cell.status === 'substitute' && cell.person === person){
            coveredPosIds.push(pid);
          }
        }
        if(coveredPosIds.length > 0){
          console.log('[saveCellState] 绾ц仈鏇跨彮锛堝墠绔厹搴曪級锛?, person, '杩樺湪浠ヤ笅宀椾綅鏇跨彮:', coveredPosIds);
          for(const pid of coveredPosIds){
            await triggerAutoSubstituteForPos(pid, day);
          }
        }
      }
      
      const group = getPersonGroup(person);
      console.log('[saveCellState] 鑷姩鏇跨彮妫€鏌?', person, 'status=', status, 'group=', group?.name || '鏃?);
      if(group){
        if(status === 'off' && checkGroupFullyOff(group, day)){
          console.log('[saveCellState] 灏忕粍鍏ㄤ紤 鈫?鑷姩鏇跨彮:', group.name);
          await triggerAutoSubstituteForGroup(group, day);
        } else if(status === 'on'){
          console.log('[saveCellState] 鎭㈠涓婄彮 鈫?妫€鏌ュ皬缁勬仮澶?', group.name);
          await triggerGroupRestore(group, day);
        }
      }
    }catch(e){
      console.error('[saveCellState] 鑷姩鏇跨彮/鎭㈠澶勭悊澶辫触:', e);
    }
  }
  // 鏇存柊缁熻
  const activeTab = document.querySelector('.side-tab.active')?.textContent;
  if(activeTab==='鍗曟棩') renderDayStat();
  else if(activeTab==='鍛ㄦ眹鎬?) renderWeekStat();
  else if(activeTab==='鏈堟眹鎬?) renderMonthStat();
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  閲嶇疆鎺掔彮
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function resetSchedule(){
  if(!confirm(`纭畾瑕侀噸缃?${G.year}骞?{G.month}鏈?鐨勬墍鏈夋帓鐝悧锛焅n鎵€鏈変汉灏嗚涓哄湪鐝紝鏃犻粯璁や汉鐨勫矖浣嶆樉绀哄緟瀹氥€俙)) return;
  
  // 瀵嗙爜楠岃瘉
  const pwd = prompt('璇疯緭鍏ラ噸缃瘑鐮侊細');
  if(pwd !== '11050'){
    toast('瀵嗙爜閿欒锛屾棤娉曢噸缃?, 3000);
    return;
  }
  
  loading(true);
  try{
    const res = await api(`/api/schedule/${G.year}/${G.month}/reset`, 'POST', {password: pwd});
    G.schedule = res.schedule;
    renderTable();
    renderDayStat();
    renderWeekStat();
    renderMonthStat();
    toast('鎺掔彮宸查噸缃?);
  }catch(e){
    toast('閲嶇疆澶辫触: '+e.message, 3000);
  }finally{
    loading(false);
  }
}

// 鈹€鈹€鈹€ 澶囦唤鎺掔彮 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function backupSchedule(){
  if(!confirm(`纭畾瑕佸浠?${G.year}骞?{G.month}鏈?鐨勬帓鐝暟鎹悧锛焅n澶囦唤鍚庡彲鐢ㄤ簬鎭㈠銆俙)) return;
  
  loading(true);
  try{
    const res = await api(`/api/schedule/${G.year}/${G.month}/backup`, 'POST');
    toast(`鎺掔彮宸插浠斤紙${res.backup_time}锛塦);
  }catch(e){
    toast('澶囦唤澶辫触: '+e.message, 3000);
  }finally{
    loading(false);
  }
}

// 鈹€鈹€鈹€ 鎭㈠澶囦唤 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function restoreBackup(){
  if(!confirm(`纭畾瑕佹仮澶?${G.year}骞?{G.month}鏈?鐨勫浠芥暟鎹悧锛焅n褰撳墠鎺掔彮灏嗚瑕嗙洊銆俙)) return;
  
  // 瀵嗙爜楠岃瘉
  const pwd = prompt('璇疯緭鍏ユ仮澶嶅瘑鐮侊細');
  if(pwd !== '11050'){
    toast('瀵嗙爜閿欒锛屾棤娉曟仮澶?, 3000);
    return;
  }
  
  loading(true);
  try{
    const res = await api(`/api/schedule/${G.year}/${G.month}/restore`, 'POST', {password: pwd});
    G.schedule = res.schedule;
    renderTable();
    renderDayStat();
    renderWeekStat();
    renderMonthStat();
    toast(`鎺掔彮宸叉仮澶嶏紙澶囦唤鏃堕棿锛?{res.backup_time}锛塦);
  }catch(e){
    toast('鎭㈠澶辫触: '+e.message, 3000);
  }finally{
    loading(false);
  }
}

// 鈹€鈹€鈹€ 鑷姩鎺掔彮寮圭獥 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  缁熻闈㈡澘
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?/**
 * 鑾峰彇灏忕粍褰撴棩鍦ㄤ笂鐝殑鎴愬憳鍒楄〃
 */
function getGroupActiveMembers(group, dayData){
  const members = group.member_names || G.staff.filter(s => s.group_id === group.id).map(s => s.name);
  return members.filter(name => {
    for(const p of G.positions){
      const c = dayData[p.id];
      const st = c ? c.status : (p.default_person ? 'on' : 'pending');
      const pr = c ? c.person : (p.default_person || '');
      if(pr === name && (st === 'on' || st === 'substitute')){
        return true;
      }
    }
    return false;
  });
}
function calcDayWorkload(day){
  // 杩斿洖 {name: workload}
  const result={};
  const dayData = G.schedule[day] || {};
  for(const pos of G.positions){
    const cell = dayData[pos.id];
    const status = cell ? cell.status : (pos.default_person?'on':'pending');
    const person = cell ? cell.person : pos.default_person||'';
    if((status==='on'||status==='substitute') && person){
      const group = G.groups.find(g => g.name === person);
      if(group && status === 'on'){
        // 灏忕粍榛樿浜轰笖鍦ㄥ矖锛氬伐浣滈噺鍧囨憡缁欏綋鏃ヤ笂鐝殑鎴愬憳
        const activeMembers = getGroupActiveMembers(group, dayData);
        if(activeMembers.length > 0){
          const share = pos.workload / activeMembers.length;
          for(const m of activeMembers){
            result[m] = (result[m] || 0) + share;
          }
        }
      } else {
        // 涓汉榛樿浜烘垨鏇跨彮浜猴細鐩存帴鍔犵粰涓汉
        result[person] = (result[person] || 0) + pos.workload;
      }
    }
  }
  return result;
}

function renderDayStat(){
  const day = +($('day-sel-day')?.value||new Date().getDate());
  const wl = calcDayWorkload(day);
  const entries = Object.entries(wl).sort((a,b)=>b[1]-a[1]);
  const maxWl = Math.max(...entries.map(e=>e[1]),1);
  // 涔熸樉绀哄伐浣滈噺涓?鐨勪汉
  for(const m of G.staff){
    if(!(m.name in wl)) entries.push([m.name,0]);
  }
  entries.sort((a,b)=>b[1]-a[1]);
  const colors=['#e53935','#f57c00','#fbc02d','#43a047','#1976d2','#7b1fa2'];
  $('day-stat-list').innerHTML = entries.map(([name,val],i)=>`
    <li class="stat-item">
      <span class="stat-name">${name}</span>
      <div class="stat-bar-wrap">
        <div class="stat-bar" style="width:${(val/maxWl*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div>
      </div>
      <span class="stat-val">${val}</span>
    </li>`).join('');
}

function renderWeekStat(){
  const sel=$('week-sel');
  if(!sel||!sel.value) return;
  const [s,e]=sel.value.split('-').map(Number);
  // totalWorkload: 鍛ㄦ€诲伐浣滈噺, workDays: 宸ヤ綔澶╂暟
  const totalWorkload={};
  const workDays={};
  for(let d=s;d<=e;d++){
    const wl=calcDayWorkload(d);
    for(const [k,v] of Object.entries(wl)){
      totalWorkload[k]=(totalWorkload[k]||0)+v;
      workDays[k]=(workDays[k]||0)+1;
    }
  }
  // 璁＄畻骞冲潎宸ヤ綔閲?= 鎬诲伐浣滈噺 / 宸ヤ綔澶╂暟
  const avgWorkload={};
  for(const name of new Set([...Object.keys(totalWorkload), ...G.staff.map(m=>m.name)])){
    const total=totalWorkload[name]||0;
    const days=workDays[name]||0;
    avgWorkload[name]=days>0?(total/days):0;
  }
  const entries=Object.entries(avgWorkload).sort((a,b)=>b[1]-a[1]);
  const maxWl=Math.max(...entries.map(e=>e[1]),1);
  const colors=['#e53935','#f57c00','#fbc02d','#43a047','#1976d2','#7b1fa2'];
  $('week-stat-list').innerHTML=entries.map(([name,val],i)=>`
    <li class="stat-item">
      <span class="stat-name">${name}</span>
      <div class="stat-bar-wrap">
        <div class="stat-bar" style="width:${(val/maxWl*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div>
      </div>
      <span class="stat-val">${val.toFixed(1)}</span>
    </li>`).join('');
}

function renderMonthStat(){
  const days=daysInMonth(G.year,G.month);
  // totalWorkload: 鏈堟€诲伐浣滈噺, workDays: 宸ヤ綔澶╂暟
  const totalWorkload={};
  const workDays={};
  for(let d=1;d<=days;d++){
    const wl=calcDayWorkload(d);
    for(const [k,v] of Object.entries(wl)){
      totalWorkload[k]=(totalWorkload[k]||0)+v;
      workDays[k]=(workDays[k]||0)+1;
    }
  }
  // 璁＄畻骞冲潎宸ヤ綔閲?= 鎬诲伐浣滈噺 / 宸ヤ綔澶╂暟
  const avgWorkload={};
  for(const name of new Set([...Object.keys(totalWorkload), ...G.staff.map(m=>m.name)])){
    const total=totalWorkload[name]||0;
    const dayCount=workDays[name]||0;
    avgWorkload[name]=dayCount>0?(total/dayCount):0;
  }
  const entries=Object.entries(avgWorkload).sort((a,b)=>b[1]-a[1]);
  const maxWl=Math.max(...entries.map(e=>e[1]),1);
  const colors=['#e53935','#f57c00','#fbc02d','#43a047','#1976d2','#7b1fa2'];
  $('month-stat-list').innerHTML=entries.map(([name,val],i)=>`
    <li class="stat-item">
      <span class="stat-name">${name}</span>
      <div class="stat-bar-wrap">
        <div class="stat-bar" style="width:${(val/maxWl*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div>
      </div>
      <span class="stat-val">${val.toFixed(1)}</span>
    </li>`).join('');
}

function switchSideTab(id, el){
  document.querySelectorAll('.side-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.side-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  $('tab-'+id).classList.add('active');
  if(id==='day') renderDayStat();
  else if(id==='week') renderWeekStat();
  else if(id==='month') renderMonthStat();
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  浜哄憳/宀椾綅绠＄悊
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function openMgr(){
  G.userBusy = true;   // 寮圭獥寮€鍚椂鏆傚仠杞鍒锋柊锛岄伩鍏嶅共鎵扮敤鎴锋搷浣?
  await loadAll();
  renderStaffTable();
  renderPosTable();
  $('mgr-modal').style.display='flex';
}
function closeMgr(){
  $('mgr-modal').style.display='none';
  G.userBusy = false;  // 寮圭獥鍏抽棴鍚庢仮澶嶈疆璇?
  // 鍏抽棴鍚庣珛鍒绘媺鍙栦竴娆★紝琛ヤ笂閿欒繃鐨勬洿鏂?
  setTimeout(pollData, 500);
}

function switchMgrTab(tab, el){
  document.querySelectorAll('.mgr-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  $('mgr-staff').style.display = tab==='staff'?'block':'none';
  $('mgr-pos').style.display   = tab==='pos'  ?'block':'none';
  $('mgr-group').style.display = tab==='group'?'block':'none';
  if(tab==='group') renderGroupTable();
}

function renderStaffTable(){
  $('staff-tbody').innerHTML = G.staff.map(m=>`
    <tr>
      <td>${m.name}</td>
      <td style="text-align:center">${m.can_cpin?'<span class="tag tag-cpin">鉁?娆″搧</span>':'鈥?}</td>
      <td style="text-align:center">${m.can_jd?'<span class="tag tag-jd">鉁?浜笢</span>':'鈥?}</td>
      <td style="text-align:center">${m.saturday_only?'<span class="tag tag-sat">浠呭懆鍏?/span>':'鈥?}</td>
      <td style="text-align:center">${m.no_substitute?'<span class="tag" style="background:#ef9a9a;color:#b71c1c;border:1px solid #e57373">涓嶆浛鐝?/span>':'鈥?}</td>
      <td>
        <button class="action-btn edit" onclick="editStaff('${m.id}')">缂栬緫</button>
        <button class="action-btn del" onclick="delStaff('${m.id}','${m.name}')">鍒犻櫎</button>
      </td>
    </tr>`).join('');
}

function renderPosTable(){
  $('pos-tbody').innerHTML = G.positions.map(p=>{
    let cat='鏅€?;
    if(p.category==='娆″搧') cat='<span class="tag tag-cpin">娆″搧</span>';
    if(p.category==='浜笢') cat='<span class="tag tag-jd">浜笢</span>';
    return `<tr>
      <td><b>${p.name}</b></td>
      <td style="text-align:center">${p.workload}</td>
      <td>${p.default_person||'<span style="color:#999">鏃?/span>'}</td>
      <td>${cat}</td>
      <td>
        <button class="action-btn edit" onclick="editPos('${p.id}')">缂栬緫</button>
        <button class="action-btn del" onclick="delPos('${p.id}','${p.name}')">鍒犻櫎</button>
      </td>
    </tr>`;
  }).join('');
}

// 鈹€鈹€ 浜哄憳寮圭獥 鈹€鈹€
function showAddStaff(){
  G.editingStaffId=null;
  $('staff-modal-title').textContent='鏂板浜哄憳';
  $('staff-name').value='';
  $('staff-cpin').checked=false;
  $('staff-jd').checked=false;
  $('staff-sat').checked=false;
  $('staff-no-sub').checked=false;
  $('staff-modal').style.display='flex';
}
function editStaff(id){
  const m=G.staff.find(s=>s.id===id); if(!m) return;
  G.editingStaffId=id;
  $('staff-modal-title').textContent='缂栬緫浜哄憳';
  $('staff-name').value=m.name;
  $('staff-cpin').checked=m.can_cpin||false;
  $('staff-jd').checked=m.can_jd||false;
  $('staff-sat').checked=m.saturday_only||false;
  $('staff-no-sub').checked=m.no_substitute||false;
  $('staff-modal').style.display='flex';
}
function closeStaffModal(){ $('staff-modal').style.display='none'; }
async function saveStaff(){
  const name=$('staff-name').value.trim();
  if(!name){ toast('璇疯緭鍏ュ鍚?); return; }
  const body={
    name,
    can_cpin:$('staff-cpin').checked,
    can_jd:$('staff-jd').checked,
    saturday_only:$('staff-sat').checked,
    no_substitute:$('staff-no-sub').checked
  };
  loading(true);
  try{
    if(G.editingStaffId){
      await api('/api/staff/'+G.editingStaffId,'PUT',body);
      toast('浜哄憳宸叉洿鏂?);
    } else {
      await api('/api/staff','POST',body);
      toast('浜哄憳宸叉柊澧?);
    }
    G.staff=await api('/api/staff');
    renderStaffTable();
    closeStaffModal();
    renderTable();
  }catch(e){ toast('淇濆瓨澶辫触: '+e.message,3000); }
  finally{ loading(false); }
}
async function delStaff(id,name){
  if(!confirm(`纭畾鍒犻櫎浜哄憳銆?{name}銆嶅悧锛焋)) return;
  loading(true);
  try{
    await api('/api/staff/'+id,'DELETE');
    G.staff=await api('/api/staff');
    renderStaffTable();
    toast('宸插垹闄?);
  }catch(e){ toast('鍒犻櫎澶辫触',3000); }
  finally{ loading(false); }
}

// 鈹€鈹€ 宀椾綅寮圭獥 鈹€鈹€
function showAddPos(){
  G.editingPosId=null;
  $('pos-modal-title').textContent='鏂板宀椾綅';
  $('pos-name').value='';
  $('pos-wl').value='';
  buildPosDefaultSel('');
  $('pos-cat').value='';
  $('pos-modal').style.display='flex';
}
function editPos(id){
  const p=G.positions.find(x=>x.id===id); if(!p) return;
  G.editingPosId=id;
  $('pos-modal-title').textContent='缂栬緫宀椾綅';
  $('pos-name').value=p.name;
  $('pos-wl').value=p.workload;
  buildPosDefaultSel(p.default_person||'');
  $('pos-cat').value=p.category||'';
  $('pos-modal').style.display='flex';
}
function buildPosDefaultSel(selected){
  const sel=$('pos-default');
  sel.innerHTML='<option value="">-- 鏃犻粯璁や汉 --</option>';

  // 鈹€鈹€ 浜哄憳鍒嗙粍 鈹€鈹€
  const personGroup=document.createElement('optgroup');
  personGroup.label='馃懁 浜哄憳';
  for(const m of G.staff){
    const o=document.createElement('option');
    o.value=m.name; o.textContent=m.name;
    if(m.name===selected) o.selected=true;
    personGroup.appendChild(o);
  }
  sel.appendChild(personGroup);

  // 鈹€鈹€ 灏忕粍鍒嗙粍 鈹€鈹€
  const groups=G.groups||[];
  if(groups.length>0){
    const groupOptGroup=document.createElement('optgroup');
    groupOptGroup.label='馃懃 灏忕粍';
    for(const g of groups){
      const o=document.createElement('option');
      o.value=g.name; o.textContent=g.name;
      if(g.name===selected) o.selected=true;
      groupOptGroup.appendChild(o);
    }
    sel.appendChild(groupOptGroup);
  }
}
function closePosModal(){ $('pos-modal').style.display='none'; }
async function savePos(){
  const name=$('pos-name').value.trim();
  if(!name){ toast('璇疯緭鍏ュ矖浣嶅悕绉?); return; }
  const body={
    name,
    workload:+($('pos-wl').value)||0,
    default_person:$('pos-default').value,
    category:$('pos-cat').value
  };
  loading(true);
  try{
    if(G.editingPosId){
      await api('/api/positions/'+G.editingPosId,'PUT',body);
      toast('宀椾綅宸叉洿鏂?);
    } else {
      await api('/api/positions','POST',body);
      toast('宀椾綅宸叉柊澧?);
    }
    G.positions=await api('/api/positions');
    renderPosTable();
    closePosModal();
    renderTable();
  }catch(e){ toast('淇濆瓨澶辫触: '+e.message,3000); }
  finally{ loading(false); }
}
async function delPos(id,name){
  if(!confirm(`纭畾鍒犻櫎宀椾綅銆?{name}銆嶅悧锛焋)) return;
  loading(true);
  try{
    await api('/api/positions/'+id,'DELETE');
    G.positions=await api('/api/positions');
    renderPosTable();
    renderTable();
    toast('宸插垹闄?);
  }catch(e){ toast('鍒犻櫎澶辫触',3000); }
  finally{ loading(false); }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
//  鍚姩
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

// 鈹€鈹€ 杞锛氭瘡10绉掗潤榛樻媺鍙栨湇鍔″櫒鏁版嵁锛屾湁鍙樺寲鎵嶅埛鏂?鈹€鈹€
async function pollData(){
  if(G.userBusy) return;          // 鐢ㄦ埛姝ｅ湪鎿嶄綔锛岃烦杩囨湰娆?
  try{
    const [positions, staff, schedule] = await Promise.all([
      api('/api/positions'),
      api('/api/staff'),
      api(`/api/schedule/${G.year}/${G.month}`),
    ]);
    // 璁＄畻鏁版嵁鎸囩汗锛屽唴瀹规病鍙樺氨涓嶉噸娓叉煋
    const hash = JSON.stringify({positions, staff, schedule});
    if(hash === G.lastPollHash) return;
    G.lastPollHash = hash;
    G.positions = positions;
    G.staff = staff;
    G.schedule = schedule;
    renderTable();
    renderDayStat();
    renderWeekStat();
    renderMonthStat();
    // 濡傛灉绠＄悊寮圭獥鏄紑鐫€鐨勶紝涔熷埛鏂颁竴涓嬭〃鏍煎唴瀹?
    if($('mgr-modal') && $('mgr-modal').style.display==='flex'){ renderStaffTable(); renderPosTable(); }
    showPollIndicator();
  }catch(e){
    // 闈欓粯澶辫触锛屼笉鎵撴壈鐢ㄦ埛
  }
}

// 鍙充笂瑙掑悓姝ユ寚绀哄櫒锛氱煭鏆傛樉绀哄悓姝ヤ腑锛屽畬鎴愬悗鍙樺洖宸插悓姝?
function showPollIndicator(){
  let el = $('poll-indicator');
  if(!el) return;
  el.textContent = '馃攧 鍚屾涓€?;
  el.classList.add('flash');
  setTimeout(()=>{
    el.classList.remove('flash');
    el.textContent = '鉁?宸插悓姝?;
  }, 600);
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
//  灏忕粍绠＄悊
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
async function renderGroupTable(){
  const groups = G.groups || [];
  const staff = G.staff || [];
  
  $('group-tbody').innerHTML = groups.map(g => {
    // 鏌ユ壘灏忕粍鎴愬憳
    const members = g.member_names || [];
    const membersStr = members.length > 0 ? members.join('銆?) : '<span style="color:#999">鏆傛棤鎴愬憳</span>';
    
    return `<tr>
      <td><b>${g.name}</b></td>
      <td>${membersStr}</td>
      <td>
        <button class="action-btn edit" onclick="editGroup('${g.id}')">缂栬緫</button>
        <button class="action-btn del" onclick="delGroup('${g.id}','${g.name}')">鍒犻櫎</button>
      </td>
    </tr>`;
  }).join('');
}
function showAddGroup(){
  G.editingGroupId = null;
  $('group-modal-title').textContent = '鏂板灏忕粍';
  $('group-name').value = '';
  buildGroupMembersSel();
  $('group-modal').style.display = 'flex';
}

async function editGroup(id){
  const g = G.groups.find(x => x.id === id);
  if(!g) return;
  
  G.editingGroupId = id;
  $('group-modal-title').textContent = '缂栬緫灏忕粍';
  $('group-name').value = g.name;
  buildGroupMembersSel(id);
  $('group-modal').style.display = 'flex';
}

function buildGroupMembersSel(groupId){
  const wrap = $('group-members-wrap');
  const staff = G.staff || [];
  
  // 鎵惧嚭褰撳墠灏忕粍鎴愬憳锛堢紪杈戞ā寮忥級鎴栨墍鏈夋湭鍒嗙粍浜哄憳锛堟柊澧炴ā寮忥級
  let selectedMembers = [];
  if(groupId){
    selectedMembers = staff.filter(s => s.group_id === groupId).map(s => s.id);
  }
  
  wrap.innerHTML = staff.map(m => {
    const isSelected = selectedMembers.includes(m.id);
    const isInOtherGroup = m.group_id && m.group_id !== groupId;
    
    return `<div style="padding:4px 0;display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="member-${m.id}" value="${m.id}" 
        ${isSelected ? 'checked' : ''} 
        ${isInOtherGroup ? 'disabled' : ''}
        style="cursor:pointer">
      <label for="member-${m.id}" style="font-size:12px;cursor:pointer">
        ${m.name}
        ${isInOtherGroup ? '<span style="color:#999;font-size:11px">锛堝凡鍦ㄥ叾浠栧皬缁勶級</span>' : ''}
      </label>
    </div>`;
  }).join('');
}

function closeGroupModal(){
  $('group-modal').style.display = 'none';
}

async function saveGroup(){
  const name = $('group-name').value.trim();
  if(!name){ toast('璇疯緭鍏ュ皬缁勫悕绉?); return; }
  
  // 鏀堕泦閫変腑鐨勬垚鍛?
  const selectedMemberIds = [];
  $('group-members-wrap').querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    selectedMemberIds.push(cb.value);
  });
  
  loading(true);
  try{
    if(G.editingGroupId){
      // 缂栬緫妯″紡锛氭洿鏂板皬缁勪俊鎭?
      await api('/api/groups/' + G.editingGroupId, 'PUT', { name });
      
      // 鏇存柊鎴愬憳鍏宠仈
      await updateGroupMembers(G.editingGroupId, selectedMemberIds);
      
      toast('灏忕粍宸叉洿鏂?);
    } else {
      // 鏂板妯″紡锛氬垱寤哄皬缁?
      const res = await api('/api/groups', 'POST', { name });
      
      // 鏇存柊鎴愬憳鍏宠仈
      if(res.success && res.group_id){
        await updateGroupMembers(res.group_id, selectedMemberIds);
      }
      
      toast('灏忕粍宸叉柊澧?);
    }
    
    // 閲嶆柊鍔犺浇鏁版嵁
    G.groups = await api('/api/groups');
    G.staff = await api('/api/staff');
    renderGroupTable();
    closeGroupModal();
  }catch(e){
    toast('淇濆瓨澶辫触: ' + e.message, 3000);
  }finally{
    loading(false);
  }
}

async function updateGroupMembers(groupId, memberIds){
  // 鍏堟竻闄よ灏忕粍鎵€鏈夋垚鍛樼殑group_id
  const allStaff = G.staff || [];
  for(const m of allStaff){
    if(m.group_id === groupId){
      await api('/api/staff/' + m.id, 'PUT', { ...m, group_id: null });
    }
  }
  
  // 璁剧疆鏂伴€変腑鐨勬垚鍛?
  for(const memberId of memberIds){
    const m = allStaff.find(s => s.id === memberId);
    if(m){
      await api('/api/staff/' + memberId, 'PUT', { ...m, group_id: groupId });
    }
  }
}

async function delGroup(id, name){
  if(!confirm(`纭畾鍒犻櫎灏忕粍銆?{name}銆嶅悧锛焅n鍒犻櫎鍚庢垚鍛樺皢鍙樹负鏈垎缁勭姸鎬併€俙)) return;
  
  loading(true);
  try{
    await api('/api/groups/' + id, 'DELETE');
    G.groups = await api('/api/groups');
    G.staff = await api('/api/staff');
    renderGroupTable();
    toast('宸插垹闄?);
  }catch(e){
    toast('鍒犻櫎澶辫触', 3000);
  }finally{
    loading(false);
  }
}

function startPolling(){
  if(G.polling) clearInterval(G.polling);
  G.polling = setInterval(pollData, 10000);  // 10绉掕疆璇?
}

init();
