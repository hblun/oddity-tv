import {analyseSchedule,collectionOf,clockSeconds,clockLabel,moveScheduledSlot,WEEKDAYS} from './schedule-layout.js';
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
let state,doc,dirty=false,tab='blocks',selected={blocks:null,programmes:null,collections:null},busy=false,selectedGap=null;
const kinds={programme:'Film / TV',archive:'Archive',advert:'Advert',trailer:'Trailer',ident:'Continuity','public-information':'Public information',interstitial:'Interstitial'};
const editions={cobalt:'Blue / cyan',coral:'Orange / cream',citrus:'Acid / pink',nocturne:'Pink / ink'};
const art={'moon-walking':'Moon-walking simulator','radio-hat':'Radio hat'};
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const duration=value=>{const n=Math.round(value||0);return n>=3600 ? `${Math.floor(n/3600)}h ${Math.floor(n%3600/60)}m` : n>=60 ? `${Math.floor(n/60)}m ${n%60 ? n%60+'s' : ''}`.trim() : `${n}s`;};
const offset=value=>`${String(Math.floor(value/3600)).padStart(2,'0')}:${String(Math.floor(value%3600/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function changed(){dirty=true;$('save-state').textContent='Unsaved changes';$('reload').textContent='Discard changes';refreshPlanning();}
function button(text,action,cls=''){const b=node('button',cls,text);b.type='button';b.addEventListener('click',action);return b;}
function field(label,value,write,{type='text',options=null,wide=false,persist=true}={}){
  const wrap=node('label',wide?'wide':'',label),input=node(options?'select':type==='textarea'?'textarea':'input');
  if(options){for(const [key,name] of Object.entries(options)){const option=node('option','',name);option.value=key;input.append(option);}}
  else if(type!=='textarea')input.type=type;
  input.value=value??'';
  input.addEventListener(options?'change':'input',()=>{write(type==='number'?Number(input.value):input.value);if(persist)changed();});
  wrap.append(input);return wrap;
}
function deleteRecord(scope,key){
  const used=scope==='programmes' ? Object.values(doc.blocks).some(b=>b.items.some(i=>i.programme_id===key || i.ads?.includes(key))) || doc.schedule.filler.includes(key) : scope==='blocks' ? doc.schedule.blocks.some(s=>s.profile===key) || Object.values(doc.collections).some(c=>c.blocks.includes(key)) : false;
  if(used){message(`Remove this ${scope==='blocks'?'block':'programme'} from its rundowns, schedule or collections first.`,true);return;}
  delete doc[scope][key];selected[scope]=null;changed();render();
}
function newRecord(scope){
  const key=`${scope==='programmes'?'programme':scope==='blocks'?'block':'collection'}-${Date.now().toString(36)}`;
  if(scope==='programmes')doc[scope][key]={title:'New programme',description:'',kind:'programme',duration:60,asset_id:key,tags:[]};
  if(scope==='blocks'){
    const programme=Object.keys(doc.programmes)[0];if(!programme){message('Add a programme first.',true);return;}
    doc[scope][key]={title:'New block',description:'',theme:'cobalt',artwork:'moon-walking',items:[{programme_id:programme}]};
  }
  if(scope==='collections'){
    const block=Object.keys(doc.blocks).find(b=>!Object.values(doc.collections).some(c=>c.blocks.includes(b)));
    if(!block){message('Add an uncollected block first.',true);return;}
    doc[scope][key]={title:'New collection',description:'',theme:'coral',blocks:[block]};
  }
  selected[scope]=key;changed();render();
}
function mediaFor(programme){return state.assets.find(a=>a.id===programme.asset_id);}
function programmeSeconds(key){return mediaFor(doc.programmes[key])?.duration || doc.programmes[key].duration;}
function itemSeconds(item){
  let seconds=item.duration??programmeSeconds(item.programme_id)-(item.in||0);
  if(item.break_every && item.ads?.length){const breaks=Math.max(0,Math.ceil(seconds/item.break_every)-1);seconds+=breaks*item.ads.reduce((sum,id)=>sum+programmeSeconds(id),0);}
  return seconds;
}
function blockSeconds(key){return doc.blocks[key].items.reduce((sum,item)=>sum+itemSeconds(item),0);}
function editorHeading(scope,key){
  const box=node('div','editor-heading'),heading=node('div');heading.append(node('p','record-id',key),node('h1','',doc[scope][key].title));box.append(heading,button('Delete',()=>deleteRecord(scope,key),'delete'));return box;
}
function records(scope){
  const desk=node('div','desk'),aside=node('aside','library'),top=node('div','library-top');
  top.append(node('h2','',scope[0].toUpperCase()+scope.slice(1)),button('+ New',()=>newRecord(scope)));aside.append(top);
  const search=node('input');search.type='search';search.placeholder=`Search ${scope}`;search.setAttribute('aria-label',search.placeholder);aside.append(search);
  const list=node('ul','record-list');aside.append(list);
  if(!doc[scope][selected[scope]])selected[scope]=Object.keys(doc[scope])[0];
  function listRecords(){
    list.replaceChildren();const query=search.value.toLowerCase();
    function addRecord(key,record,parent){
      if(!record.title.toLowerCase().includes(query) && !parent?.title.toLowerCase().includes(query))return;
      const li=node('li'),b=button('',()=>{selected[scope]=key;render();},`${selected[scope]===key?'selected ':''}${parent?'record-block':''}`);
      if(parent)b.append(node('span','tree-number',`Block ${parent.part}`));b.append(node('strong','',record.title));
      b.append(node('small','',scope==='programmes'?`${duration(programmeSeconds(key))} · ${mediaFor(record)?'Media ready':'Waiting for media'}`:scope==='blocks'?`${record.items.length} works · ${duration(blockSeconds(key))}`:`${record.blocks.length} blocks`));li.append(b);list.append(li);
    }
    if(scope==='blocks'){
      for(const [id,c]of Object.entries(doc.collections)){
        if(!c.title.toLowerCase().includes(query)&&!c.blocks.some(b=>doc.blocks[b].title.toLowerCase().includes(query)))continue;
        const header=node('li','record-group');header.dataset.theme=c.theme||'coral';header.append(button(c.title,()=>{tab='collections';selected.collections=id;render();}));list.append(header);
        for(const key of c.blocks)addRecord(key,doc.blocks[key],collectionOf(doc.collections,key));
      }
      const standalone=Object.entries(doc.blocks).filter(([key])=>!collectionOf(doc.collections,key));
      if(standalone.length){const label=node('li','standalone-label','Standalone blocks');list.append(label);for(const [key,b]of standalone)addRecord(key,b);}
    }else for(const [key,record]of Object.entries(doc[scope]))addRecord(key,record);
  }
  search.addEventListener('input',listRecords);listRecords();
  const editor=node('section','editor');editor.setAttribute('aria-label',`${scope} editor`);
  const key=selected[scope];if(key){editor.append(editorHeading(scope,key));if(scope==='programmes')programmeEditor(editor,key);if(scope==='blocks')blockEditor(editor,key);if(scope==='collections')collectionEditor(editor,key);}else editor.append(node('p','empty','Create a record to get started.'));
  desk.append(aside,editor);return desk;
}
function programmeEditor(editor,key){
  const parents=Object.entries(doc.blocks).filter(([,b])=>b.items.some(i=>i.programme_id===key));
  if(parents.length){const used=node('div','used-in');used.append(node('span','mono','Appears in'));for(const [id,b]of parents)used.append(button(b.title,()=>{tab='blocks';selected.blocks=id;render();}));editor.append(used);}
  const p=doc.programmes[key],fields=node('div','fields'),media=mediaFor(p);
  const status=node('span',`status-tag ${media?'':'waiting'}`,media?'Media ready':'Waiting for media');editor.append(status);
  fields.append(field('Title',p.title,v=>p.title=v,{wide:true}),field('Synopsis',p.description,v=>p.description=v,{type:'textarea',wide:true}),field('Type',p.kind||'programme',v=>p.kind=v,{options:kinds}),field('Year',p.year,v=>{if(v)p.year=v;else delete p.year;},{type:'number'}),field('Media ID',p.asset_id,v=>p.asset_id=v),field('Estimated duration · seconds',p.duration,v=>p.duration=v,{type:'number'}),field('Tags · comma separated',(p.tags||[]).join(', '),v=>p.tags=v.split(',').map(x=>x.trim()).filter(Boolean),{wide:true}));
  editor.append(fields);
  const match=node('div','fill-panel');match.append(node('h3','',media?`Prepared duration: ${duration(media.duration)}`:'Match prepared media'));
  const options={'':'Choose media…',...Object.fromEntries(state.assets.map(a=>[a.id,`${a.title} · ${duration(a.duration)}`]))};
  match.append(field('Prepared asset',media?.id||'',v=>{if(v){p.asset_id=v;p.duration=state.assets.find(a=>a.id===v).duration;render();}},{options}));
  match.append(node('p','mono','Imports pair with this record by media ID.'));editor.append(match);
}
function move(items,index,delta){const target=index+delta;if(target<0||target>=items.length)return;[items[index],items[target]]=[items[target],items[index]];changed();render();}
function dragRows(list,items){
  let from=null;
  for(const [index,row] of [...list.children].entries()){
    row.draggable=true;row.addEventListener('dragstart',event=>{from=index;event.dataTransfer.setData('text/plain',String(index));row.classList.add('dragging');});
    row.addEventListener('dragend',()=>row.classList.remove('dragging'));
    row.addEventListener('dragover',event=>{event.preventDefault();row.classList.add('drop-target');});row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
    row.addEventListener('drop',event=>{event.preventDefault();if(from===null)return;items.splice(index,0,items.splice(from,1)[0]);changed();render();});
  }
}
function blockEditor(editor,key){
  const b=doc.blocks[key],fields=node('div','fields'),parent=collectionOf(doc.collections,key);
  if(parent){const trail=node('div','collection-path');trail.dataset.theme=parent.theme;trail.append(button(parent.title,()=>{tab='collections';selected.collections=parent.id;render();}),node('span','',`Block ${parent.part} of ${parent.total}`));editor.prepend(trail);}
  editor.append(blockTimeline(key));
  fields.append(field('Block title',b.title,v=>b.title=v,{wide:true}),field('Premise',b.premise,v=>b.premise=v,{wide:true}),field('Introduction',b.description,v=>b.description=v,{type:'textarea',wide:true}),field('Colour edition',b.theme||'cobalt',v=>b.theme=v,{options:editions}),field('Artwork',b.artwork||'moon-walking',v=>b.artwork=v,{options:art}));editor.append(fields);
  const head=node('div','section-head');head.append(node('h2','',`Running order · ${duration(blockSeconds(key))}`));editor.append(head);
  const list=node('ol','rundown');let start=0;
  for(const [index,item] of b.items.entries()){
    const row=node('li'),line=node('div','row'),choice=node('select');choice.setAttribute('aria-label',`Programme ${index+1}`);
    for(const [id,p] of Object.entries(doc.programmes)){const option=node('option','',p.title);option.value=id;choice.append(option);}choice.value=item.programme_id;
    choice.addEventListener('change',()=>{b.items[index]={programme_id:choice.value};changed();render();});
    const controls=node('div','row-controls');const up=button('↑',()=>move(b.items,index,-1)),down=button('↓',()=>move(b.items,index,1));up.setAttribute('aria-label',`Move programme ${index+1} up`);down.setAttribute('aria-label',`Move programme ${index+1} down`);up.disabled=index===0;down.disabled=index===b.items.length-1;
    const remove=button('×',()=>{if(b.items.length===1){message('A block needs at least one programme.',true);return;}b.items.splice(index,1);changed();render();});remove.setAttribute('aria-label',`Remove programme ${index+1}`);controls.append(up,down,remove);
    line.append(node('span','row-time',offset(start)),choice,controls);row.append(line);
    const details=node('details'),summary=node('summary','',`${duration(itemSeconds(item))} · ${mediaFor(doc.programmes[item.programme_id])?'Media ready':'Waiting for media'} · Edit timings`),timings=node('div','fields');
    timings.append(field('Source in · seconds',item.in||0,v=>item.in=v,{type:'number'}),field('Play duration · seconds',item.duration??'',v=>{if(v)item.duration=v;else delete item.duration;},{type:'number'}),field('Advert interval · seconds',item.break_every||'',v=>{if(v)item.break_every=v;else delete item.break_every;},{type:'number'}),field('Advert IDs · comma separated',(item.ads||[]).join(', '),v=>{if(v)item.ads=v.split(',').map(s=>s.trim()).filter(Boolean);else delete item.ads;}));details.append(summary,timings);row.append(details);list.append(row);start+=itemSeconds(item);
  }
  dragRows(list,b.items);editor.append(list);
  let add=Object.keys(doc.programmes)[0];const addLine=node('div','field-line');addLine.append(field('Add a programme',add,v=>add=v,{options:Object.fromEntries(Object.entries(doc.programmes).map(([id,p])=>[id,p.title]))}),button('+ Add',()=>{b.items.push({programme_id:add});changed();render();}));editor.append(addLine);
  const fill=node('div','fill-panel'),fillFields=node('div','fields');let target=Math.ceil(blockSeconds(key)/1800)*1800 || 1800,kind='ident',tag='';if(target<=blockSeconds(key))target+=1800;
  fill.append(node('h3','','Fill to a target duration'));fillFields.append(field('Target · seconds',target,v=>target=v,{type:'number'}),field('Material',kind,v=>kind=v,{options:Object.fromEntries(Object.entries(kinds).filter(([k])=>['ident','interstitial','advert','trailer'].includes(k)))}),field('Tag · optional','',v=>tag=v));fill.append(fillFields,button('Build fill',()=>action(async()=>{const data=await request('/api/fill','POST',{document:doc,block_id:key,target,kind,tag});doc=data.document;changed();render();message('Fill added to the draft.');})));editor.append(fill);
}
function collectionEditor(editor,key){
  const c=doc.collections[key],fields=node('div','fields');fields.append(field('Collection title',c.title,v=>c.title=v,{wide:true}),field('Introduction',c.description,v=>c.description=v,{type:'textarea',wide:true}),field('Collection colour',c.theme||'coral',v=>c.theme=v,{options:editions}));editor.append(fields);
  const list=node('ol','rundown collection-order');for(const [index,id] of c.blocks.entries()){
    const row=node('li'),line=node('div','row'),controls=node('div','row-controls');controls.append(button('↑',()=>move(c.blocks,index,-1)),button('↓',()=>move(c.blocks,index,1)),button('×',()=>{c.blocks.splice(index,1);changed();render();}));const content=node('div','collection-card-copy');content.append(button(doc.blocks[id].title,()=>{tab='blocks';selected.blocks=id;render();}),node('p','mono',`${doc.blocks[id].items.length} programmes · ${duration(blockSeconds(id))}`),miniStrip(id));
    row.dataset.theme=c.theme||'coral';line.append(node('span','mono',`Block ${index+1}`),content,controls);row.append(line);list.append(row);
  }dragRows(list,c.blocks);editor.append(list);
  const choices=Object.fromEntries(Object.entries(doc.blocks).filter(([id])=>!Object.values(doc.collections).some(c=>c.blocks.includes(id))).map(([id,b])=>[id,b.title]));let add=Object.keys(choices)[0];if(add){const line=node('div','field-line');line.append(field('Add block',add,v=>add=v,{options:choices}),button('+ Add',()=>{c.blocks.push(add);changed();render();}));editor.append(line);}
}
function addSlot(profile){
  const s=doc.schedule,last=s.blocks.at(-1),next=last ? (last.offset||0)+blockSeconds(last.profile) : 0;
  s.blocks.push(s.mode==='cycle'?{profile,offset:next}:{profile,days:[0],at:'19:00:00'});changed();render();
}
function miniStrip(key){
  const strip=node('div','mini-strip'),total=blockSeconds(key)||1;strip.setAttribute('aria-hidden','true');
  for(const item of doc.blocks[key].items){const mark=node('span');mark.dataset.kind=doc.programmes[item.programme_id].kind||'programme';mark.style.flexGrow=String(itemSeconds(item)/total);strip.append(mark);}return strip;
}
function blockTimeline(key){
  const box=node('section','block-timeline');box.id='block-timeline';const total=blockSeconds(key)||1,head=node('div','timeline-heading');head.append(node('h2','','Programme sequence'),node('span','mono',duration(total)));box.append(head);
  const rail=node('div','micro-timeline');rail.setAttribute('aria-label','Programmes in this block');let start=0;
  doc.blocks[key].items.forEach((item,index)=>{
    const p=doc.programmes[item.programme_id],length=itemSeconds(item),chip=button('',()=>{const row=document.querySelectorAll('.editor .rundown>li')[index];if(row){row.querySelector('details').open=true;row.querySelector('summary').focus();row.scrollIntoView({block:'nearest'});}});
    chip.className='micro-programme';chip.dataset.kind=p.kind||'programme';chip.classList.toggle('media-pending',!mediaFor(p));chip.style.left=`${start/total*100}%`;chip.style.width=`${length/total*100}%`;chip.title=`${offset(start)} · ${p.title} · ${duration(length)}`;chip.setAttribute('aria-label',`Edit programme ${index+1}: ${p.title}, ${duration(length)}`);chip.append(node('small','',String(index+1).padStart(2,'0')),node('strong','',p.title));rail.append(chip);start+=length;
  });
  box.append(rail,node('div','micro-endpoints',`00:00:00 → ${offset(total)}`));return box;
}
function refreshPlanning(){
  const board=document.getElementById('planning-board');if(tab==='schedule'&&board)board.replaceWith(planningBoard());
  const micro=document.getElementById('block-timeline');if(tab==='blocks'&&micro&&selected.blocks)micro.replaceWith(blockTimeline(selected.blocks));
}
function planningBoard(){
  const plan=analyseSchedule(doc.schedule,blockSeconds),box=node('section','planning-board');box.id='planning-board';box.setAttribute('aria-label','Visual broadcast schedule');
  const head=node('div','timeline-heading'),gaps=plan.lanes.flatMap(l=>l.gaps.map(g=>({...g,day:l.day,name:l.name}))),overlaps=plan.lanes.flatMap(l=>l.overlaps.map(o=>({...o,name:l.name})));
  head.append(node('h2','',doc.schedule.mode==='weekly'?'Weekly timeline':'Cycle timeline'),node('span',overlaps.length||plan.issues.length?'planning-alert':'mono',`${gaps.length} ${gaps.length===1?'gap':'gaps'} · ${overlaps.length} ${overlaps.length===1?'overlap':'overlaps'}`));box.append(head);
  const key=node('div','planning-key');key.append(node('span','key-block','Scheduled block'),node('span','key-gap','Gap / continuity'),node('span','key-overlap','Overlap'));box.append(key);
  const scroller=node('div','planner-scroll'),canvas=node('div','planner-canvas'),ruler=node('div','planner-ruler'),rulerLabels=node('div','planner-ruler-labels');ruler.append(node('span','',doc.schedule.timezone||'Europe/London'),rulerLabels);
  const span=plan.lanes[0].span,tick=doc.schedule.mode==='weekly'?10800:Math.max(1,Math.ceil(span/6));
  for(let t=0;t<span;t+=tick){const stamp=node('span','',clockLabel(t));stamp.style.left=`${t/span*100}%`;rulerLabels.append(stamp);}canvas.append(ruler);
  for(const lane of plan.lanes){
    const row=node('div','planner-row'),name=node('div','planner-day',lane.name),track=node('div','planner-track');row.append(name,track);track.dataset.day=lane.day;track.setAttribute('aria-label',lane.name+' schedule');
    for(const gap of lane.gaps){const region=button('',()=>{selectedGap={...gap,day:lane.day,name:lane.name};refreshPlanning();document.querySelector('.gap-placement select')?.focus();},'planner-gap');region.style.left=`${gap.start/span*100}%`;region.style.width=`${(gap.end-gap.start)/span*100}%`;region.setAttribute('aria-label',`${lane.name}: fill gap ${clockLabel(gap.start)}–${clockLabel(gap.end)}, ${duration(gap.end-gap.start)}`);region.title=`Gap · ${duration(gap.end-gap.start)}`;region.append(node('span','',`Gap · ${duration(gap.end-gap.start)}`));track.append(region);}
    const ends=[];
    for(const segment of lane.segments){
      let level=ends.findIndex(end=>end<=segment.start);if(level<0)level=ends.length;ends[level]=segment.end;
      const b=doc.blocks[segment.profile],parent=collectionOf(doc.collections,segment.profile),chip=button('',()=>{const target=document.getElementById(`slot-${segment.slotIndex}`);target?.scrollIntoView({block:'center'});target?.querySelector('select')?.focus();},'planner-block');
      chip.dataset.theme=parent?.theme||b.theme||'cobalt';chip.style.left=`${segment.start/span*100}%`;chip.style.width=`${(segment.end-segment.start)/span*100}%`;chip.style.top=`${14+level*78}px`;
      chip.append(node('small','',parent?`${parent.title} · Block ${parent.part}`:'Standalone block'),node('strong','',b.title),node('span','',`${clockLabel(segment.start)}–${clockLabel(segment.end)}`));
      chip.title=`${b.title} · ${duration(segment.end-segment.start)}`;chip.setAttribute('aria-label',`Edit ${lane.name} block: ${b.title}, ${clockLabel(segment.start)}`);chip.draggable=true;chip.addEventListener('dragstart',event=>event.dataTransfer.setData('application/oddity-slot',JSON.stringify({index:segment.slotIndex,day:segment.sourceDay})));track.append(chip);
    }
    track.style.height=`${Math.max(110,ends.length*78+28)}px`;
    for(const overlap of lane.overlaps){const mark=node('span','planner-overlap');mark.style.left=`${overlap.start/span*100}%`;mark.style.width=`${(overlap.end-overlap.start)/span*100}%`;mark.title=`Overlap · ${duration(overlap.end-overlap.start)}`;mark.setAttribute('aria-label',mark.title);track.append(mark);}
    track.addEventListener('dragover',event=>{if([...event.dataTransfer.types].some(t=>['application/oddity-block','application/oddity-slot'].includes(t))){event.preventDefault();track.classList.add('drop-target');}});track.addEventListener('dragleave',()=>track.classList.remove('drop-target'));
    track.addEventListener('drop',event=>{
      event.preventDefault();event.stopPropagation();const rect=track.getBoundingClientRect(),snap=doc.schedule.mode==='weekly'?300:1,start=Math.min(span-snap,Math.max(0,Math.round((event.clientX-rect.left)/rect.width*span/snap)*snap));
      const profile=event.dataTransfer.getData('application/oddity-block'),moving=event.dataTransfer.getData('application/oddity-slot');
      if(profile&&doc.blocks[profile])doc.schedule.blocks.push(doc.schedule.mode==='weekly'?{profile,days:[lane.day],at:offset(start)}:{profile,offset:start});
      else if(moving){try{const from=JSON.parse(moving);moveScheduledSlot(doc.schedule,from.index,from.day,lane.day,start);}catch{return;}}else return;
      changed();render();message('Block placed in the draft schedule.');
    });canvas.append(row);
  }
  scroller.append(canvas);box.append(scroller);
  const summary=node('div','gap-summary');summary.append(node('strong','',`Gap / continuity time: ${duration(plan.gapSeconds)}`));
  for(const gap of gaps.slice(0,14))summary.append(button(`${doc.schedule.mode==='weekly'?gap.name.slice(0,3)+' ':''}${clockLabel(gap.start)} · ${duration(gap.end-gap.start)}`,()=>{selectedGap=gap;refreshPlanning();document.querySelector('.gap-placement select')?.focus();}));box.append(summary);
  if(overlaps.length||plan.issues.length){const alerts=node('div','planning-conflicts');for(const o of overlaps)alerts.append(node('p','',`${o.name}: ${duration(o.end-o.start)} overlap at ${clockLabel(o.start)}. Move or shorten a block.`));for(const issue of plan.issues)alerts.append(node('p','',`${doc.blocks[doc.schedule.blocks[issue.slotIndex].profile].title}: ${issue.message}`));box.append(alerts);}
  if(selectedGap){
    const actual=gaps.find(g=>g.day===selectedGap.day&&g.start===selectedGap.start&&g.end===selectedGap.end);
    if(actual){const placement=node('div','gap-placement'),options={};for(const [id,b]of Object.entries(doc.blocks))if(blockSeconds(id)<=actual.end-actual.start+.001)options[id]=`${b.title} · ${duration(blockSeconds(id))}`;
      placement.append(node('strong','',`Place a block in ${actual.name.toLowerCase()} · ${clockLabel(actual.start)}–${clockLabel(actual.end)}`));let profile=Object.keys(options)[0];
      if(profile){const line=node('div','field-line');line.append(field('Block that fits',profile,v=>profile=v,{options,persist:false}),button('Place block',()=>{doc.schedule.blocks.push(doc.schedule.mode==='weekly'?{profile,days:[actual.day],at:offset(actual.start)}:{profile,offset:actual.start});selectedGap=null;changed();render();message('Block placed in the draft.');}));placement.append(line);}else placement.append(node('p','','No existing block fits this gap. Adjust a start time or use a shorter rundown.'));
      placement.append(button('Close',()=>{selectedGap=null;refreshPlanning();}));box.append(placement);
    }else selectedGap=null;
  }
  return box;
}

function scheduleEditor(){
  const box=node('section','schedule-body');box.append(node('h1','','Broadcast schedule'),planningBoard());
  const s=doc.schedule,fields=node('div','fields');fields.append(field('Channel',s.channel||'Oddity Television',v=>s.channel=v),field('Pattern',s.mode,v=>{
    s.mode=v;s.blocks=s.blocks.map(slot=>v==='weekly'?{profile:slot.profile,days:[0],at:'19:00:00'}:{profile:slot.profile,offset:0});if(v==='cycle'){s.period_seconds||=86400;s.origin||=new Date().toISOString();}changed();render();
  },{options:{cycle:'Repeating cycle',weekly:'Weekly'}}));
  if(s.mode==='cycle')fields.append(field('Cycle length · seconds',s.period_seconds,v=>s.period_seconds=v,{type:'number'}),field('Origin · ISO date and timezone',s.origin,v=>s.origin=v));
  fields.append(field('Timezone',s.timezone||'Europe/London',v=>s.timezone=v),field('Continuity IDs · comma separated',s.filler.join(', '),v=>s.filler=v.split(',').map(x=>x.trim()).filter(Boolean)));box.append(fields);
  const layout=node('div','schedule-layout'),shelf=node('aside');shelf.append(node('h2','','Block library'));const blocks=node('ul','block-shelf');
  for(const [id,b] of Object.entries(doc.blocks)){const li=node('li');const collection=collectionOf(doc.collections,id);if(collection){li.dataset.theme=collection.theme;li.append(node('span','shelf-collection',`${collection.title} · Block ${collection.part}`));}li.draggable=true;li.append(node('strong','',b.title),node('small','',duration(blockSeconds(id))),button('+ Schedule',()=>addSlot(id)));li.addEventListener('dragstart',event=>event.dataTransfer.setData('application/oddity-block',id));blocks.append(li);}shelf.append(blocks);
  const slots=node('div','schedule-slots');slots.setAttribute('aria-label','Scheduled blocks');
  slots.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('application/oddity-block')){event.preventDefault();slots.classList.add('drop-target');}});slots.addEventListener('dragleave',()=>slots.classList.remove('drop-target'));slots.addEventListener('drop',event=>{event.preventDefault();const id=event.dataTransfer.getData('application/oddity-block');if(doc.blocks[id])addSlot(id);});
  for(const [index,slot] of s.blocks.entries()){
    const card=node('section','slot'),head=node('div','slot-head');card.id=`slot-${index}`;const parent=collectionOf(doc.collections,slot.profile);if(parent){const path=node('p','slot-collection',`${parent.title} · Block ${parent.part}`);path.dataset.theme=parent.theme;card.append(path);}head.append(node('h3','',doc.blocks[slot.profile].title),button('Remove slot',()=>{s.blocks.splice(index,1);changed();render();}));card.append(head);
    const slotFields=node('div','fields');slotFields.append(field('Block',slot.profile,v=>{slot.profile=v;changed();render();},{options:Object.fromEntries(Object.entries(doc.blocks).map(([id,b])=>[id,b.title]))}));
    if(s.mode==='cycle')slotFields.append(field('Start offset · seconds',slot.offset,v=>slot.offset=v,{type:'number'}));
    else {
      slotFields.append(field('Start · UK time',slot.at.slice(0,5),v=>slot.at=v+':00',{type:'time'}));const weekday=node('div','days');
      days.forEach((day,index)=>{const label=node('label','',day),input=node('input');input.type='checkbox';input.checked=slot.days.includes(index);input.addEventListener('change',()=>{slot.days=input.checked?[...slot.days,index].sort():slot.days.filter(d=>d!==index);changed();});label.prepend(input);weekday.append(label);});slotFields.append(weekday);
    }
    card.append(slotFields,node('p','mono',`${duration(blockSeconds(slot.profile))} · ${s.mode==='cycle'?offset(slot.offset):slot.days.map(d=>days[d]).join(', ')+' '+slot.at}`));
    const track=node('div','slot-track'),bar=node('div','slot-bar'),span=s.mode==='cycle'?s.period_seconds:86400,start=s.mode==='cycle'?slot.offset:slot.at.split(':').reduce((n,v)=>n*60+Number(v),0);bar.style.left=`${start/span*100}%`;bar.style.width=`${blockSeconds(slot.profile)/span*100}%`;track.append(bar);card.append(track);slots.append(card);
  }
  if(!s.blocks.length)slots.append(node('p','empty','Drag a block here or use + Schedule.'));layout.append(shelf,slots);box.append(layout);return box;
}
function render(){
  for(const b of document.querySelectorAll('[data-tab]')){if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  $('workspace').replaceChildren(tab==='schedule'?scheduleEditor():records(tab));$('workspace').setAttribute('aria-busy','false');
}
function receive(data){state=data;doc=structuredClone(data.document);dirty=false;$('reload').textContent='Reload';$('save-state').textContent=`Draft ${state.revision} saved`;
  $('published-state').textContent=state.published?`Published revision ${state.published.revision} · ${new Date(state.published.at).toLocaleString('en-GB')}`:'No Studio publication yet';
  $('history').replaceChildren(...state.history.map(h=>{const o=node('option','',`${h.id} · ${new Date(h.saved_at).toLocaleString('en-GB')}`);o.value=h.id;return o;}));
  $('checks').replaceChildren();$('checks').hidden=!state.issues.length;if(state.issues.length)$('checks').append(node('h2','','Before publishing'),...state.issues.map(i=>node('p','',i)));render();
}
async function request(url,method='GET',body){const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Oddity-Studio':'1'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));return data;}
async function action(fn){if(busy)return;busy=true;$('workspace').inert=true;document.querySelector('nav').inert=true;for(const id of ['save','publish','reload','restore'])$(id).disabled=true;try{await fn();}catch(error){message(error.message,true);}finally{busy=false;$('workspace').inert=false;document.querySelector('nav').inert=false;for(const id of ['save','publish','reload','restore'])$(id).disabled=false;}}
async function save(){receive(await request('/api/studio','PUT',{document:doc,revision:state.revision}));}
$('save').addEventListener('click',()=>action(async()=>{await save();message('Draft saved.');}));
$('publish').addEventListener('click',()=>action(async()=>{if(dirty)await save();receive(await request('/api/publish','POST',{revision:state.revision}));message('Published. The station will pick up this edition on its next refresh.');}));
$('reload').addEventListener('click',()=>action(async()=>{receive(await request('/api/studio'));message('Saved draft and media refreshed.');}));
$('restore').addEventListener('click',()=>action(async()=>{if(dirty){message('Save your changes before restoring a revision.',true);return;}receive(await request('/api/restore','POST',{revision:state.revision,history_id:Number($('history').value)}));message('Saved revision restored as a new draft.');}));
$('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='oddity-content.json';a.click();URL.revokeObjectURL(url);});
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{tab=b.dataset.tab;render();message('');});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
action(async()=>receive(await request('/api/studio')));
// Recheck prepared media and other saved revisions while the desk is idle.
window.setInterval(async()=>{
  const editing=()=>document.activeElement?.matches('input,textarea,select');
  if(!state||dirty||busy||document.hidden||editing())return;
  try{
    const latest=await request('/api/studio');
    if(dirty||busy||editing())return;
    if(latest.revision!==state.revision||JSON.stringify([latest.assets,latest.ready,latest.durations,latest.issues,latest.published])!==JSON.stringify([state.assets,state.ready,state.durations,state.issues,state.published]))receive(latest);
  }catch{/* Explicit saves and reloads surface errors without interrupting idle work. */}
},15000);
