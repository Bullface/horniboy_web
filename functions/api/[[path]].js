import {handleApi} from '../../worker/index.js';
export function onRequest(context){return handleApi(context.request,context.env);}
