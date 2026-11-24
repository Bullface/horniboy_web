export async function runPool(items,limit,work){
  const tasks=Array.from(items);let cursor=0;
  const count=Math.min(tasks.length,Math.max(1,Math.floor(limit)||1));
  await Promise.all(Array.from({length:count},async()=>{while(cursor<tasks.length){const i=cursor++;await work(tasks[i],i);}}));
}
