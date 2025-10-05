/* app.js
 - Integrates NASA NeoWs (browse + lookup) into the Meteor Madness simulator.
 - Save as app.js and open index.html locally.
*/

// ----- Utilities -----
const qs = s => document.querySelector(s);
const toFixed = (n,d=2) => Number(n).toLocaleString(undefined,{maximumFractionDigits:d});

// UI elements
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
let neoCache = {}; // store Neo objects by id
let selectedNeoId = null;

// ----- NASA NeoWs helpers -----
function getApiKey(){
  const k = (apiKeyInput.value || '').trim();
  return k === '' ? 'DEMO_KEY' : k;
}

async function fetchNeos(page=0){
  // use neo/browse endpoint
  const apiKey = getApiKey();
  const url = `https://api.nasa.gov/neo/rest/v1/neo/browse?page=${page}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`NeoWs browse failed: ${res.status}`);
  return res.json();
}

async function fetchNeoById(id){
  const apiKey = getApiKey();
  const url = `https://api.nasa.gov/neo/rest/v1/neo/${id}?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`NeoWs lookup failed: ${res.status}`);
  return res.json();
}

// ----- populate NEO list -----
loadNeosBtn.addEventListener('click', async ()=>{
  loadNeosBtn.disabled = true;
  neoList.innerHTML = `<option>Loading...</option>`;
  try{
    const data = await fetchNeos(0);
    neoList.innerHTML = `<option value="">-- select an asteroid --</option>`;
    (data.near_earth_objects || data.near_earth_objects === undefined) && console.log('browse raw', data);
    // NeoWs browse sometimes returns .near_earth_objects or .near_earth_objects in feed - many wrappers differ.
    const arr = data.near_earth_objects || data.near_earth_objects || data.near_earth_objects || data;
    // Official browse returns an array in data.near_earth_objects when using /neo/browse or data.near_earth_objects is field in some responses.
    // The canonical response uses data.near_earth_objects (array), but older wrappers differ — handle gracefully.
    // Use data.near_earth_objects if present, else try data.near_earth_objects (already above).
    // If still not an array, try data.near_earth_objects from top-level properties (some API docs vary).
    const neos = data.near_earth_objects || data.near_earth_objects || data;
    // For official NeoWs browse, there is a field "near_earth_objects" inside the returned object for feed endpoint.
    // But /neo/browse returns an object with property "near_earth_objects" as an array.
    // To be robust, if data.near_earth_objects is undefined, check data.near_earth_objects or data.near_earth_objects.
    // Now fallback: if data.near_earth_objects missing but data.page & data.near_earth_objects exists, use data.near_earth_objects.
    let list = [];
    if(Array.isArray(data.near_earth_objects)) list = data.near_earth_objects;
    else if(Array.isArray(data.near_earth_objects)) list = data.near_earth_objects;
    else if(Array.isArray(data)) list = data;
    else if(Array.isArray(data.near_earth_objects)) list = data.near_earth_objects;
    else {
      // best effort: look for top-level keys that are arrays
      for(const k in data){
        if(Array.isArray(data[k]) && data[k].length && data[k][0].id) { list = data[k]; break; }
      }
    }
    // fill select
    list.slice(0,50).forEach(n => {
      const id = n.id || n.neo_reference_id || n.neo_reference_id;
      const name = n.name || n.designation || (`neo ${id}`);
      neoCache[id] = n;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${name} (${id})`;
      neoList.appendChild(opt);
    });
    neoInfo.textContent = `Loaded ${list.length} NEOs (showing first ${Math.min(50,list.length)}).`;
  }catch(err){
    neoList.innerHTML = `<option value="">-- error loading --</option>`;
    neoInfo.textContent = `Error: ${err.message}`;
    console.error(err);
  }finally{
    loadNeosBtn.disabled = false;
  }
});

// ----- when user selects NEO -----
neoList.addEventListener('change', async (e)=>{
  const id = e.target.value;
  selectedNeoId = id || null;
  if(!id) { neoInfo.textContent = 'No NEO loaded'; return; }
  // if we have cached object with useful fields, use that; otherwise lookup
  let obj = neoCache[id];
  try{
    if(!obj || !obj.estimated_diameter){
      const full = await fetchNeoById(id);
      obj = full;
      neoCache[id] = full;
    }
    // extract estimated diameter (min/max) in meters
    const ed = obj.estimated_diameter && obj.estimated_diameter.meters;
    const diamMin = ed?.estimated_diameter_min;
    const diamMax = ed?.estimated_diameter_max;
    const diam = diamMax || diamMin || '';
    // try to get speed from last close_approach_data if available
    let vel = '';
    if(obj.close_approach_data && obj.close_approach_data.length){
      // pick the most recent close approach entry
      const cad = obj.close_approach_data[0];
      vel = cad.relative_velocity ? Number(cad.relative_velocity.kilometers_per_second) : '';
    }
    diameterN.value = diam ? Math.round(diam) : diameterN.value;
    velocityN.value = vel ? Number(vel).toFixed(2) : velocityN.value;
    neoInfo.innerHTML = `<strong>${obj.name || obj.designation}</strong><br>
      est. diameter: ${diam ? `${Math.round(diam)} m` : '—'}<br>
      last approach speed: ${vel ? (Number(vel).toFixed(2)+' km/s') : '—'}`;
  }catch(err){
    neoInfo.textContent = `Lookup error: ${err.message}`;
    console.error(err);
  }
});

// ----- Globe drawing / click to set lat/lon -----
const size = globe.width = globe.height = 360;
const center = {x:size/2,y:size/2}, R = size*0.46;

function drawGlobe(){
  gctx.clearRect(0,0,size,size);
  gctx.beginPath();
  gctx.arc(center.x,center.y,R,0,Math.PI*2);
  gctx.fillStyle = '#032a36';
  gctx.fill();
  gctx.fillStyle = 'rgba(120,120,120,0.08)';
  gctx.beginPath(); gctx.ellipse(center.x-50, center.y-30, 80,50,Math.PI*0.3,0,Math.PI*2); gctx.fill();
  gctx.beginPath(); gctx.ellipse(center.x+70, center.y+10, 90,60,Math.PI*0.15,0,Math.PI*2); gctx.fill();
  drawMarker();
}
function drawMarker(){
  const p = latLonToXY(selectedLat, selectedLon);
  gctx.beginPath();
  gctx.fillStyle = '#ffcc00';
  gctx.arc(p.x,p.y,6,0,Math.PI*2);
  gctx.fill();
  gctx.strokeStyle='rgba(0,0,0,0.5)';
  gctx.lineWidth=2; gctx.stroke();
}
function latLonToXY(lat,lon){
  const phi = lat * Math.PI/180;
  const lambda = lon * Math.PI/180;
  const x = center.x + R * Math.cos(phi) * Math.sin(lambda);
  const y = center.y - R * Math.sin(phi);
  return {x,y};
}
function xyToLatLon(x,y){
  const dx = x - center.x, dy = center.y - y;
  const lat = Math.asin(dy / R) * 180/Math.PI;
  const lon = Math.atan2(dx, Math.cos(lat * Math.PI/180) * R) * 180/Math.PI;
  return {lat: Math.max(-89.9,Math.min(89.9,lat||0)), lon: Math.max(-179.9,Math.min(179.9,lon||0))};
}

globe.addEventListener('pointerdown', (e)=>{
  const rect = globe.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (globe.width/rect.width);
  const y = (e.clientY - rect.top) * (globe.height/rect.height);
  const d = Math.hypot(x-center.x,y-center.y);
  if(d>R) return;
  const ll = xyToLatLon(x,y);
  selectedLat = +ll.lat.toFixed(3);
  selectedLon = +ll.lon.toFixed(3);
  latlonEl.textContent = `${selectedLat}°, ${selectedLon}°`;
  drawGlobe();
});

drawGlobe();

// ----- Simulation math (same simplified model) -----
function computeImpact(params){
  const D = params.diameter;
  const v_ms = params.velocity*1000;
  const rho = params.density;
  const volume = Math.PI/6 * Math.pow(D,3);
  const mass = rho * volume;
  const energyJ = 0.5 * mass * v_ms * v_ms;
  const energyMegatons = energyJ / 4.184e15;
  const rho_target = 2500;
  const K = 1.8;
  const craterM = K * Math.pow(D,0.78) * Math.pow(params.velocity,0.44) * Math.pow(rho/rho_target,0.333);
  const severe_m = craterM * 5;
  const thermal_m = craterM * 12;
  const light_m = craterM * 30;
  let tsunami_km = 0;
  if(params.targetType === 'ocean'){
    tsunami_km = Math.min(2000, Math.pow(energyMegatons, 0.33) * 50);
  }
  return {mass, energyJ, energyMegatons, craterM, severe_m, thermal_m, light_m, tsunami_km};
}

// ----- Visualization (simple) -----
function clearVis(){ vctx.clearRect(0,0,vis.width,vis.height); vctx.fillStyle='#00121a'; vctx.fillRect(0,0,vis.width,vis.height); }
function drawEarthBase(){
  const w = vis.width, h = vis.height;
  const ex = w*0.5, ey = h*0.5, er = Math.min(w,h)*0.38;
  vctx.beginPath(); vctx.arc(ex,ey,er,0,Math.PI*2); vctx.fillStyle='#002b36'; vctx.fill();
  vctx.fillStyle='rgba(120,120,120,0.06)';
  vctx.beginPath(); vctx.ellipse(ex-110,ey-30,140,80,Math.PI*0.3,0,Math.PI*2); vctx.fill();
  vctx.beginPath(); vctx.ellipse(ex+130,ey+10,160,90,Math.PI*0.15,0,Math.PI*2); vctx.fill();
  return {ex,ey,er};
}
function latLonToVisXY(lat,lon,ex,ey,er){
  const phi = lat*Math.PI/180, lambda = lon*Math.PI/180;
  const x = ex + er * Math.cos(phi) * Math.sin(lambda);
  const y = ey - er * Math.sin(phi);
  return {x,y};
}
function drawImpactVisualization(res, params){
  clearVis();
  const base = drawEarthBase();
  const ex=base.ex, ey=base.ey, er=base.er;
  const p = latLonToVisXY(selectedLat, selectedLon, ex, ey, er);
  const earthRadiusM = 6371000;
  const m_per_px = earthRadiusM / er;
  const crater_px = Math.max(2, res.craterM / m_per_px);
  const severe_px = Math.max(3, res.severe_m / m_per_px);
  const thermal_px = Math.max(3, res.thermal_m / m_per_px);
  const light_px = Math.max(3, res.light_m / m_per_px);
  const tsunami_px = res.tsunami_km*1000 / m_per_px;
  if(params.targetType === 'ocean' && res.tsunami_km>0){
    vctx.beginPath(); vctx.arc(p.x,p.y,tsunami_px,0,Math.PI*2); vctx.fillStyle='rgba(60,150,255,0.12)'; vctx.fill();
    vctx.strokeStyle='rgba(60,150,255,0.45)'; vctx.lineWidth=2; vctx.stroke();
  }
  vctx.beginPath(); vctx.arc(p.x,p.y,light_px,0,Math.PI*2); vctx.fillStyle='rgba(255,200,120,0.14)'; vctx.fill();
  vctx.beginPath(); vctx.arc(p.x,p.y,thermal_px,0,Math.PI*2); vctx.fillStyle='rgba(255,170,60,0.14)'; vctx.fill();
  vctx.beginPath(); vctx.arc(p.x,p.y,severe_px,0,Math.PI*2); vctx.fillStyle='rgba(255,80,60,0.18)'; vctx.fill();
  vctx.beginPath(); vctx.arc(p.x,p.y,crater_px,0,Math.PI*2); vctx.fillStyle='rgba(255,255,255,0.95)'; vctx.fill();
  vctx.beginPath(); vctx.arc(p.x,p.y,Math.max(6,crater_px*0.4),0,Math.PI*2); vctx.fillStyle='rgba(255,230,180,0.95)'; vctx.fill();
  vctx.fillStyle='#eaf6ff'; vctx.font='13px system-ui,Arial';
  vctx.fillText(`Impact: ${selectedLat}°, ${selectedLon}°`, 14, 24);
  vctx.fillText(`Asteroid: ${params.diameter} m @ ${params.velocity} km/s`, 14, 44);
  vctx.fillStyle='#9fb7c2'; vctx.font='12px system-ui';
  vctx.fillText(`Crater ≈ ${toFixed(res.craterM/1000,2)} km`, 14, 66);
}

// ----- UI actions -----
function updateAndSimulate(){
  const params = {
    diameter: Number(diameterN.value),
    velocity: Number(velocityN.value),
    density: Number(densitySel.value),
    angle: Number(angleN.value),
    targetType: targetType.value
  };
  const res = computeImpact(params);
  energyEl.textContent = `${toFixed(res.energyMegatons,3)} Mt TNT (${toFixed(res.energyJ,0)} J)`;
  craterEl.textContent = `${toFixed(res.craterM,1)} m (${toFixed(res.craterM/1000,3)} km)`;
  severeEl.textContent = `${toFixed(res.severe_m/1000,2)} km`;
  tsunamiEl.textContent = params.targetType==='ocean' ? `${toFixed(res.tsunami_km,1)} km` : '—';
  drawImpactVisualization(res, params);
}
simulateBtn.addEventListener('click', ()=> updateAndSimulate());
downloadBtn.addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.download = 'meteor-impact.png';
  a.href = vis.toDataURL('image/png');
  a.click();
});

// Prefill from selected Neo's most recent close approach (if available)
prefillCAbtn.addEventListener('click', async ()=>{
  if(!selectedNeoId){ alert('Select an asteroid first'); return; }
  try{
    let obj = neoCache[selectedNeoId];
    if(!obj || !obj.close_approach_data) obj = await fetchNeoById(selectedNeoId);
    if(obj.close_approach_data && obj.close_approach_data.length){
      const cad = obj.close_approach_data[0];
      const vel = cad.relative_velocity?.kilometers_per_second;
      const miss_km = cad.miss_distance?.kilometers;
      if(vel) velocityN.value = Number(vel).toFixed(2);
      if(obj.estimated_diameter && obj.estimated_diameter.meters){
        const ed = obj.estimated_diameter.meters;
        const avg = (ed.estimated_diameter_min + ed.estimated_diameter_max)/2;
        diameterN.value = Math.round(avg);
      }
      neoInfo.innerHTML += `<br>Prefilled from close approach on ${cad.close_approach_date_full || cad.close_approach_date}`;
    } else {
      alert('No close-approach data available for this NEO.');
    }
  }catch(err){ console.error(err); alert('Error pre-filling: '+err.message); }
});

// initial simulate
updateAndSimulate();
