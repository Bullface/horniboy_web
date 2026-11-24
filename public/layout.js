// Pure geometry: never resize unrelated browser windows.
export function planTiles(area,count,columns=3){
  if(!Number.isInteger(count)||count<0||count>24)throw new Error('Invalid shop count');
  const a={left:Number(area.left)||0,top:Number(area.top)||0,width:Math.max(320,Math.floor(Number(area.width)||1280)),height:Math.max(300,Math.floor(Number(area.height)||800))};
  const gap=6, reserve=a.height>=640?Math.min(245,Math.floor(a.height*.32)):0;
  const height=a.height-reserve;
  const cols=Math.max(1,Math.min(Math.floor(Number(columns)||3),Math.floor((a.width+gap)/486),Math.max(count,1)));
  const rows=Math.max(1,Math.min(3,Math.floor((height+gap)/300)));
  const capacity=cols*rows;
  const tiles=[];
  const visible=Math.min(count,capacity);
  const actualRows=Math.max(1,Math.ceil(visible/cols));
  for(let i=0;i<visible;i++){
    const row=Math.floor(i/cols), col=i%cols;
    const rowCount=Math.min(cols,visible-row*cols);
    const x0=Math.floor(col*(a.width+gap)/rowCount),x1=Math.floor((col+1)*(a.width+gap)/rowCount);
    const y0=Math.floor(row*(height+gap)/actualRows),y1=Math.floor((row+1)*(height+gap)/actualRows);
    tiles.push({left:a.left+x0,top:a.top+reserve+y0,width:x1-x0-gap,height:y1-y0-gap});
  }
  return {capacity,tiles,reserve,area:a};
}
export function pagePlan(area,sites,offset=0,columns=3){
  const initial=planTiles(area,sites.length,columns);
  const maxOffset=Math.max(0,Math.floor((sites.length-1)/initial.capacity)*initial.capacity);
  const start=Math.min(maxOffset,Math.max(0,Math.floor((Number(offset)||0)/initial.capacity)*initial.capacity));
  const page=sites.slice(start,start+initial.capacity);
  const plan=planTiles(area,page.length,columns);
  return {...plan,capacity:initial.capacity,offset:start,total:sites.length,sites:page,prev:start>0,next:start+page.length<sites.length};
}
export function chooseDisplay(displays,controller,fallback){
  if(!Array.isArray(displays)||!displays.length)return fallback;
  const x=(controller?.left||0)+(controller?.width||0)/2,y=(controller?.top||0)+(controller?.height||0)/2;
  const d=displays.find(d=>{const b=d.bounds;return b&&x>=b.left&&x<b.left+b.width&&y>=b.top&&y<b.top+b.height;})||displays.find(d=>d.isPrimary)||displays[0];
  return d.workArea||d.bounds||fallback;
}
