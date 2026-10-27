// Wall-clock planning geometry. The Python compiler remains the publication authority.
export const WEEKDAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function clockSeconds(value){return String(value||'0:0:0').split(':').reduce((sum,v)=>sum*60+Number(v),0);}
export function clockLabel(value){const n=Math.max(0,Math.round(value));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}${n%60?':'+String(n%60).padStart(2,'0'):''}`;}
export function collectionOf(collections,blockId){
  for(const [id,c]of Object.entries(collections))if(c.blocks.includes(blockId))return {id,title:c.title,theme:c.theme||'coral',part:c.blocks.indexOf(blockId)+1,total:c.blocks.length};
  return null;
}
function coverage(segments,span){
  const points=[...new Set([0,span,...segments.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b),gaps=[],overlaps=[];
  for(let i=0;i<points.length-1;i++){
    const start=points[i],end=points[i+1];if(end<=start)continue;
    const active=segments.filter(s=>s.start<end&&s.end>start);
    const list=active.length===0?gaps:active.length>1?overlaps:null;if(!list)continue;
    const previous=list.at(-1),slots=active.map(s=>s.slotIndex);
    if(previous?.end===start){previous.end=end;previous.slots=[...new Set([...previous.slots,...slots])];}
    else list.push({start,end,slots});
  }
  return {gaps,overlaps};
}
export function analyseSchedule(schedule,durationFor){
  const weekly=schedule.mode==='weekly',span=weekly?86400:Math.max(1,Number(schedule.period_seconds)||1);
  const lanes=(weekly?WEEKDAYS:['Cycle']).map((name,day)=>({name,day,span,segments:[]})),issues=[];
  (schedule.blocks||[]).forEach((slot,slotIndex)=>{
    const duration=Number(durationFor(slot.profile));
    if(!Number.isFinite(duration)||duration<=0){issues.push({slotIndex,message:'Block duration is invalid'});return;}
    const start=weekly?clockSeconds(slot.at):Number(slot.offset);
    if(!Number.isFinite(start)||start<0||start>=span){issues.push({slotIndex,message:'Start is outside the schedule'});return;}
    if(!weekly){
      if(start+duration>span)issues.push({slotIndex,message:'Block extends beyond the cycle'});
      lanes[0].segments.push({slotIndex,profile:slot.profile,start,end:Math.min(span,start+duration),sourceDay:0,continues:false});
    }else for(const sourceDay of slot.days||[]){
      const absolute=sourceDay*86400+start,end=absolute+duration;
      // Include the wrapped Sunday tail on Monday.
      for(const shift of [0,-604800])for(const lane of lanes){
        const left=Math.max(lane.day*86400,absolute+shift),right=Math.min((lane.day+1)*86400,end+shift);
        if(right>left)lane.segments.push({slotIndex,profile:slot.profile,start:left-lane.day*86400,end:right-lane.day*86400,sourceDay,continues:left>absolute+shift});
      }
    }
  });
  for(const lane of lanes){lane.segments.sort((a,b)=>a.start-b.start||a.slotIndex-b.slotIndex);Object.assign(lane,coverage(lane.segments,span));}
  return {lanes,issues,gapSeconds:lanes.reduce((n,l)=>n+l.gaps.reduce((v,g)=>v+g.end-g.start,0),0),overlapSeconds:lanes.reduce((n,l)=>n+l.overlaps.reduce((v,g)=>v+g.end-g.start,0),0)};
}
export function moveScheduledSlot(schedule,index,sourceDay,targetDay,start){
  const slot=schedule.blocks[index];if(!slot)return;
  if(schedule.mode==='cycle'){slot.offset=Math.round(start);return;}
  const stamp=clockLabel(Math.round(start/60)*60)+':00';
  if(slot.days.length===1){slot.days=[targetDay];slot.at=stamp;}
  else {slot.days=slot.days.filter(d=>d!==sourceDay);schedule.blocks.push({profile:slot.profile,days:[targetDay],at:stamp});}
}
