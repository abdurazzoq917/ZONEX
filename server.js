const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||4173,ROOT=__dirname,DB=path.join(ROOT,'world.json');
let world={players:[]},clients=[];
try{world=JSON.parse(fs.readFileSync(DB,'utf8'))}catch{}
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
function save(){fs.writeFileSync(DB,JSON.stringify(world,null,2))}
function player(id,name){let p=world.players.find(x=>x.id===id);if(!p){p={id,name,color:`hsl(${Math.abs([...id].reduce((s,c)=>s+c.charCodeAt(0),0)*47)%360} 72% 48%)`,area:0,territories:[]};world.players.push(p)}p.name=String(name||p.name).slice(0,20);return p}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Access-Control-Allow-Origin':'*'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data))}
function broadcast(){const msg=`data: ${JSON.stringify(world)}\n\n`;clients=clients.filter(r=>{try{r.write(msg);return true}catch{return false}})}
function body(req){return new Promise((ok,bad)=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)req.destroy()});req.on('end',()=>{try{ok(JSON.parse(d||'{}'))}catch{bad()}})})}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end()}
  if(req.url==='/api/world')return send(res,200,world);
  if(req.url==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify(world)}\n\n`);clients.push(res);return req.on('close',()=>clients=clients.filter(x=>x!==res))}
  if(req.method==='POST'&&req.url==='/api/location'){try{const b=await body(req);if(!b.id||!b.name)return send(res,400,{error:'invalid'});const p=player(b.id,b.name);p.location={lat:+b.lat,lng:+b.lng,time:Date.now()};broadcast();return send(res,200,{ok:true})}catch{return send(res,400,{error:'bad json'})}}
  if(req.method==='POST'&&req.url==='/api/territory'){try{const b=await body(req);if(!b.id||!b.name||!Array.isArray(b.points)||b.points.length<3)return send(res,400,{error:'invalid'});const p=player(b.id,b.name),area=Math.max(0,Math.min(+b.area||0,1e8));p.territories.push({points:b.points.slice(0,5000),area,time:Date.now()});p.area=p.territories.reduce((s,t)=>s+t.area,0);save();broadcast();return send(res,200,{ok:true,area:p.area})}catch{return send(res,400,{error:'bad json'})}}
  const clean=req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,''),file=path.join(ROOT,clean);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,'Topilmadi','text/plain');send(res,200,fs.readFileSync(file),types[path.extname(file)]||'application/octet-stream');
});
server.listen(PORT,()=>console.log(`IZLA online: http://localhost:${PORT}`));
