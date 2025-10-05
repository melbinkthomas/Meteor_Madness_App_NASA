const qs = s => document.querySelector(s);
const toFixed = (n,d=2)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:d});

const apiKeyInput = qs('#apiKey');
const loadNeosBtn = qs('#loadNeos');
const neoList = qs('#neoList');
const neoInfo = qs('#neoInfo');
const diameterN = qs('#diameterN');
const velocityN = qs('#velocityN');
const densitySel = qs('#density');
const angleN = qs('#angleN');
const targetType = qs('#targetType');
const simulateBtn = qs('#simulate');
const prefillCAbtn = qs('#prefillCloseApproach');
const latlonEl = qs('#latlon');
const energyEl = qs('#energy');
const craterEl = qs('#crater');
const severeEl = qs('#severe');
const tsunamiEl = qs('#tsunami');
const downloadBtn = qs('#downloadBtn');

const globe = qs('#globe');
const vis = qs('#vis');
const gctx = globe.getContext('2d');
const vctx = vis.getContext('2d');

let selectedLat = 0, selectedLon = 0;
let neoCache = {}, selectedNeoId = null;

// ----- NASA API -----
function getApiKey(){return apiKeyInput.value.trim()||'DEMO_KEY';}

async function fetchNeos(){
  const res = await fetch(`https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=${getApiKey()}`);
  return res.json();
}

async function fetchNeoById(id){
  const res = await fetch(`https://api.nasa.gov/neo/rest/v1/neo/${id}?api_key=${getApiKey()}`);
  return res.json();
}

loadNeosBtn.addEventListener('click', async ()=>{
  loadNeosBtn.disabled = true;
  neoList.innerHTML = `<option>Loading...</option>`;
  try{
    const data = await fetchNeos();
    const list = data.near_earth_objects;
    neoList.innerHTML = `<option value="">-- select an asteroid --</option>`;
    list.slice(0,50).forEach(n=>{
      const id = n.id;
      neoCache[id]=n;
      const opt = document.createElement('option');
      opt.value=id; opt.textContent = `${n.name} (${id})`;
      neoList.appendChild(opt);
    });
    neoInfo.textContent = `Loaded ${list.length} NEOs`;
  }catch(err){ neoInfo.textContent = `Error: ${err.message}`; console.error(err);}
  loadNeosBtn.disabled=false;
});

neoList.addEventListener('change', async e=>{
  const id = e.target.value;
  selectedNeoId = id||null;
  if(!id){neoInfo.textContent='No NEO loaded';return;}
  let obj = neoCache[id];
  try{
    if(!obj.estimated_diameter) obj = await fetchNeoById(id);
    const ed = obj.estimated_diameter.meters;
    const diam = (ed.estimated_diameter_min+ed.estimated_diameter_max)/2;
    let vel = 0;
    if(obj.close_approach_data && obj.close_approach_data.length)
      vel = Number(obj.close_approach_data[0].relative_velocity.kilometers_per_second);
    diameterN.value=Math.round(diam);
    velocityN.value=vel?vel.toFixed(2):velocityN.value;
    neoInfo.innerHTML=`<strong>${obj.name}</strong><br>Diameter: ${Math.round(diam)} m<br>Speed: ${vel?vel.toFixed(2)+' km/s':'—'}`;
  }catch(err){console.error(err);}
});

// ----- Globe -----
const size = globe.width = globe.height = 360;
const center={x:size/2,y:size/2},R=size*0.46;
function drawGlobe(){gctx.clearRect(0,0,size,size);gctx.beginPath();gctx.arc(center.x,center.y,R,0,Math.PI*2);gctx.fillStyle='#032a36';gctx.fill();drawMarker();}
function drawMarker(){const p=latLonToXY(selectedLat,selectedLon);gctx.beginPath();gctx.fillStyle='#ffcc00';gctx.arc(p.x,p.y,6,0,Math.PI*2);gctx.fill();}
function latLonToXY(lat,lon){const phi=lat*Math.PI/180,lambda=lon*Math.PI/180;return {x:center.x+R*Math.cos(phi)*Math.sin(lambda),y:center.y-R*Math.sin(phi)};}
function xyToLatLon(x,y){const dx=x-center.x,dy=center.y-y;const lat=Math.asin(dy/R)*180/Math.PI,lon=Math.atan2(dx,Math.cos(lat*Math.PI/180)*R)*180/Math.PI;return {lat,lon};}

globe.addEventListener('pointerdown',e=>{
  const rect=globe.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(globe.width/rect.width);
  const y=(e.clientY-rect.top)*(globe.height/rect.height);
  if(Math.hypot(x-center.x,y-center.y)>R) return;
  const ll=xyToLatLon(x,y);
  selectedLat=+ll.lat.toFixed(3);selectedLon=+ll.lon.toFixed(3);
  latlonEl.textContent=`${selectedLat}°, ${selectedLon}°`;
  drawGlobe();
});
drawGlobe();

// ----- Simulation -----
function computeImpact(params){
  const D=params.diameter,v=params.velocity*1000,rho=params.density;
  const volume=Math.PI/6*Math.pow(D,3),mass=rho*volume;
  const energyJ=0.5*mass*v*v;
  const energyMegatons=energyJ/4.184e15;
  const craterM=1.8*Math.pow(D,0.78)*Math.pow(params.velocity,0.44)*Math.pow(rho/2500,0.333);
  const severe_m=craterM*5;
  const tsunami_km=params.targetType==='ocean'?Math.min(2000,Math.pow(energyMegatons,0.33)*50):0;
  return {mass,energyJ,energyMegatons,craterM,severe_m,tsunami_km};
}

function clearVis(){vctx.clearRect(0,0,vis.width,vis.height);vctx.fillStyle='#00121a';vctx.fillRect(0,0,vis.width,vis.height);}
function drawEarthBase(){const w=vis.width,h=vis.height;const ex=w*0.5,ey=h*0.5,er=Math.min(w,h)*0.38;vctx.beginPath();vctx.arc(ex,ey,er,0,Math.PI*2);vctx.fillStyle='#002b36';vctx.fill();return {ex,ey,er};}
function latLonToVisXY(lat,lon,ex,ey,er){const phi=lat*Math.PI/180,lambda=lon*Math.PI/180;return {x:ex+er*Math.cos(phi)*Math.sin(lambda),y:ey-er*Math.sin(phi)};}
function drawImpactVisualization(res,params){
  clearVis();
  const base=drawEarthBase(),ex=base.ex,ey=base.ey,er=base.er;
  const p=latLonToVisXY(selectedLat,selectedLon,ex,ey,er);
  const earthRadiusM=6371000,m_per_px=earthRadiusM/er;
  const crater_px=Math.max(2,res.craterM/m_per_px),severe_px=Math.max(3,res.severe_m/m_per_px),tsunami_px=res.tsunami_km*1000/m_per_px;
  if(params.targetType==='ocean'&&res.tsunami_km>0){vctx.beginPath();vctx.arc(p.x,p.y,tsunami_px,0,Math.PI*2);vctx.fillStyle='rgba(60,150,255,0.12)';vctx.fill();}
  vctx.beginPath();vctx.arc(p.x,p.y,crater_px,0,Math
