// One public search per original provider, using the exact Worker implementation.
// This is not a stock verification or a challenge-bypass test.
import {DEFAULT_SITES} from '../public/shared.js';
import {runProvider} from '../worker/index.js';
const query='Bosch Akkuschrauber';
const results=await Promise.all(DEFAULT_SITES.map(async s=>{
  const r=await runProvider({template:s.template,query});
  return {site:s.name,status:r.status,http:r.httpStatus??null,ms:r.ms,products:r.products.length,explicitStock:r.products.filter(p=>p.stock!=='unknown').length,diagnostics:r.diagnostics??null};
}));
console.log(JSON.stringify({note:'GitHub runner network, not Cloudflare production egress. Blocked/unverified is a legitimate outcome.',results},null,2));
