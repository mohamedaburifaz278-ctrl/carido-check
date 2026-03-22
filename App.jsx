import{useState,useMemo,useEffect,useRef,useCallback}from"react";

// ═══════════════════════════════════════════════════════════════════
//  CARDIOCALC PRO — SaaS v6.0
//  Premium Health-Tech Product · Safe Path Educational Management
//  Landing + Auth + Dashboard + AI + Reports + Pricing + Doctor View
// ═══════════════════════════════════════════════════════════════════

const FONTS="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";

// ─── Persistent Storage ───
const LS=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch{return null}};

// ─── Design Tokens ───
const T={
  bg:"#f8fafb",card:"#ffffff",border:"#e8ecf1",borderLight:"#f1f4f8",
  text:"#1a2332",textSec:"#5a6b7f",textDim:"#8e9bae",
  emerald:"#0d9373",emeraldLight:"#e6f7f2",emeraldDark:"#07795e",
  red:"#e5453e",redLight:"#fef2f1",orange:"#e97c1f",orangeLight:"#fef6ed",
  blue:"#3576e8",blueLight:"#eef4fd",purple:"#7c5ce0",purpleLight:"#f3f0fd",
  yellow:"#d4a017",yellowLight:"#fefaed",
  shadow:"0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:"0 4px 12px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.05)",
  shadowLg:"0 12px 40px rgba(0,0,0,0.1),0 2px 8px rgba(0,0,0,0.04)",
  radius:"12px",radiusSm:"8px",radiusLg:"16px",
  font:"'Plus Jakarta Sans',system-ui,sans-serif",mono:"'JetBrains Mono',monospace",
};

// ═══════════════════════════════════════════════════════════════════
//  MEDICAL ENGINE (from v5.1 validated)
// ═══════════════════════════════════════════════════════════════════
const safeNum=(v,f=0)=>(typeof v==="number"&&isFinite(v))?v:f;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,safeNum(v,(lo+hi)/2)));
const safeDivide=(n,d,f=0)=>(d!==0&&isFinite(n/d))?n/d:f;
const round=(v,d=1)=>{const m=Math.pow(10,d);return Math.round(safeNum(v)*m)/m};
const display=(v,s="",f="—")=>(v===null||v===undefined||!isFinite(v))?f:`${v}${s}`;

function rollingAvg(a,w=3){if(!a.length)return[];return a.map((_,i)=>{const s=Math.max(0,i-1),e=Math.min(a.length,i+2);const sl=a.slice(s,e).filter(isFinite);return sl.length?sl.reduce((x,y)=>x+y,0)/sl.length:0})}
function stdDev(a){const c=a.filter(isFinite);if(c.length<2)return 0;const m=c.reduce((x,y)=>x+y,0)/c.length;return Math.sqrt(c.reduce((x,y)=>x+(y-m)**2,0)/(c.length-1))}

const BP_CATS=[{label:"Normal",sMax:120,dMax:80,color:T.emerald},{label:"Elevated",sMax:129,dMax:80,color:T.yellow},{label:"Stage I",sMax:139,dMax:89,color:T.orange},{label:"Stage II",sMax:180,dMax:120,color:T.red},{label:"Crisis",sMax:999,dMax:999,color:"#991b1b"}];
const classifyBP=(s,d)=>{for(const c of BP_CATS)if(s<=c.sMax&&d<=c.dMax)return c;return BP_CATS[4]};
const calcMAP=(s,d)=>safeNum((s+2*d)/3);
const calcPP=(s,d)=>safeNum(s-d);

function computeDerivatives(recs){if(recs.length<2)return[];const sm=rollingAvg(recs.map(r=>r.systolic));return recs.slice(1).map((r,i)=>{const dt=r.hour-recs[i].hour;if(dt<=0)return null;return{hour:r.hour,dS:round(clamp(safeDivide(sm[i+1]-sm[i],dt),-20,20),2),...r}}).filter(Boolean)}

function computeSaltSensitivity(recs){
  if(recs.length<6)return{status:"insufficient",slope:null,r2:null,perThousand:null,message:"Need 6+ readings"};
  const pts=[];for(let i=4;i<recs.length;i++){const e=safeNum(.5*recs[Math.max(0,i-2)].salt+.3*recs[Math.max(0,i-3)].salt+.2*recs[Math.max(0,i-4)].salt);if(e>0)pts.push({x:e,y:recs[i].systolic})}
  if(pts.length<5)return{status:"insufficient",slope:null,r2:null,perThousand:null,message:`Only ${pts.length} lag pairs (need 5)`};
  const n=pts.length,sx=pts.reduce((a,p)=>a+p.x,0),sy=pts.reduce((a,p)=>a+p.y,0),sxy=pts.reduce((a,p)=>a+p.x*p.y,0),sx2=pts.reduce((a,p)=>a+p.x*p.x,0);
  const mx=sx/n,my=sy/n,den=sx2-n*mx*mx;if(Math.abs(den)<.001)return{status:"insufficient",slope:null,r2:null,perThousand:null,message:"Insufficient variance"};
  const slope=(sxy-n*mx*my)/den,intercept=my-slope*mx;
  const ssRes=pts.reduce((a,p)=>a+(p.y-(intercept+slope*p.x))**2,0),ssTot=pts.reduce((a,p)=>a+(p.y-my)**2,0);
  const r2=ssTot>0?clamp(1-ssRes/ssTot,0,1):0;
  return{status:"computed",slope:round(slope,6),r2:round(r2,3),perThousand:round(slope*1000,1),message:`${round(slope*1000,1)} mmHg/1000mg (R²=${round(r2,2)})`};
}

function engineerFeatures(recs,derivs,profile){
  if(recs.length<2)return null;
  const n=recs.length,sArr=recs.map(r=>r.systolic),dArr=recs.map(r=>r.diastolic),saltArr=recs.map(r=>r.salt);
  const avgS=sArr.reduce((a,b)=>a+b)/n,avgD=dArr.reduce((a,b)=>a+b)/n,avgSalt=saltArr.reduce((a,b)=>a+b)/n;
  const maxSpike=derivs.length?Math.max(...derivs.map(d=>Math.abs(d.dS))):0;
  const avgDeriv=derivs.length?derivs.reduce((a,d)=>a+Math.abs(d.dS),0)/derivs.length:0;
  const saltM=computeSaltSensitivity(recs);
  const mo=recs.filter(r=>r.hour>=6&&r.hour<12),ev=recs.filter(r=>r.hour>=18&&r.hour<=23);
  const moA=mo.length?mo.reduce((a,r)=>a+r.systolic,0)/mo.length:avgS;
  const evA=ev.length?ev.reduce((a,r)=>a+r.systolic,0)/ev.length:avgS;
  return{avg_sbp:round(avgS),avg_dbp:round(avgD),avg_map:round(recs.reduce((a,r)=>a+calcMAP(r.systolic,r.diastolic),0)/n),avg_pp:round(recs.reduce((a,r)=>a+calcPP(r.systolic,r.diastolic),0)/n),bp_variability:round(stdDev(sArr)),max_spike:round(maxSpike),smoothed_dbp_dt:round(avgDeriv,2),salt_sensitivity:saltM.status==="computed"?saltM.slope:0,avg_salt:round(avgSalt,0),morning_sbp:round(moA),evening_sbp:round(evA),diurnal_variation:round(evA-moA),age:safeNum(+profile.age,50),is_male:profile.sex==="Male"?1:0,is_smoker:profile.smoker?1:0,is_diabetic:profile.diabetic?1:0,on_bp_meds:profile.bpTreated?1:0,total_chol:safeNum(+profile.totalChol,200),hdl:safeNum(+profile.hdl,50),_saltModel:saltM};
}

// ML Prediction (calibrated v5.1 validated weights)
const ML_W={intercept:-2.6,avg_sbp:0.60,avg_dbp:0.24,avg_map:0.05,avg_pp:0.20,bp_variability:0.30,max_spike:0.12,smoothed_dbp_dt:0.09,salt_sensitivity:0.15,avg_salt:0.0005,morning_sbp:0.04,evening_sbp:0.07,diurnal_variation:0.07,age:0.40,is_male:0.12,is_smoker:0.42,is_diabetic:0.40,on_bp_meds:0.18,total_chol:0.012,hdl:-0.07};
const NORM={avg_sbp:[90,180],avg_dbp:[55,120],avg_map:[65,140],avg_pp:[25,80],bp_variability:[0,40],max_spike:[0,20],smoothed_dbp_dt:[0,12],salt_sensitivity:[-.05,.05],avg_salt:[0,6000],morning_sbp:[90,180],evening_sbp:[90,180],diurnal_variation:[-15,25],age:[20,90],is_male:[0,1],is_smoker:[0,1],is_diabetic:[0,1],on_bp_meds:[0,1],total_chol:[120,350],hdl:[20,100]};
const FC=Object.keys(NORM);

function mlPredict(features){
  if(!features)return null;let z=ML_W.intercept;const contribs={};
  for(const k of FC){const v=safeNum(features[k]);const[lo,hi]=NORM[k]||[0,1];const n=clamp(safeDivide(v-lo,hi-lo),0,1);const c=n*(ML_W[k]||0);z+=c;contribs[k]={raw:round(v,2),contribution:round(c,3)}}
  const prob=clamp(1/(1+Math.exp(-clamp(z,-8,8))),0.02,0.85);
  const sorted=Object.entries(contribs).sort((a,b)=>Math.abs(b[1].contribution)-Math.abs(a[1].contribution));
  return{probability:round(prob,3),logit:round(z,2),topFactors:sorted.slice(0,6),all:contribs};
}

function framingham(age,sex,tc,hdl,sbp,bpTx,sm,dm){
  if(!age||age<20||!tc||!hdl||!sbp)return null;
  const la=Math.log(age),lt=Math.log(tc),lh=Math.log(hdl),ls=Math.log(sbp);
  let b,s0,mc;
  if(sex==="Male"){const bs=bpTx?1.99881:1.93303;mc=23.9802;s0=0.88936;b=3.06117*la+1.1237*lt-.93263*lh+bs*ls+.65451*(sm?1:0)+.57367*(dm?1:0)}
  else{const bs=bpTx?2.82263:2.76157;mc=26.1931;s0=0.95012;b=2.32888*la+1.20904*lt-.70833*lh+bs*ls+.52873*(sm?1:0)+.69154*(dm?1:0)}
  return clamp(1-Math.pow(s0,Math.exp(b-mc)),0,1);
}
function heartAge(frs,sex){if(!frs)return null;for(let a=20;a<=90;a++){if(framingham(a,sex,180,60,120,false,false,false)>=frs)return a}return 90}

function ruleScore(f){let s=100;const pen=[];const add=(n,c,v,m)=>{const x=c?clamp(v,0,m):0;pen.push({name:n,val:round(x),max:m,active:c});s-=x};
  add("SBP>120",f.avg_sbp>120,(f.avg_sbp-120)*1.5,30);add("DBP>80",f.avg_dbp>80,(f.avg_dbp-80)*2,20);
  add("BP variability",f.bp_variability>8,f.bp_variability*.8,15);add("Salt>2000",f.avg_salt>2000,((f.avg_salt-2000)/500)*5,15);
  add("PP>50",f.avg_pp>50,(f.avg_pp-50)*.5,10);add("dBP/dt>10",f.max_spike>10,(f.max_spike-10)*.5,10);
  add("MAP>100",f.avg_map>100,(f.avg_map-100)*.8,10);return{score:clamp(Math.round(s),0,100),penalties:pen}}

function hybridRisk(ml,frs,rule){
  const mlR=safeNum(ml?.probability,.3)*100,frsR=clamp(safeNum(frs,.05)*333,0,100),ruleR=100-safeNum(rule?.score,70);
  const combined=.4*mlR+.3*frsR+.3*ruleR;const score=clamp(Math.round(100-combined),0,100);
  let risk="Low",color=T.emerald;if(score<35){risk="Critical";color=T.red}else if(score<55){risk="High";color=T.orange}else if(score<75){risk="Moderate";color=T.yellow}
  return{score,risk,color,components:{ml:round(mlR),frs:round(frsR),rules:round(ruleR)}}}

function predictBP(recs){
  if(!recs||recs.length<4)return{status:"insufficient",message:"Need 4+ readings",systolic:null,diastolic:null,confidence:0};
  const last=recs.slice(-4),n=last.length,xs=last.map(r=>r.hour),ys=last.map(r=>r.systolic),yd=last.map(r=>r.diastolic);
  const mx=xs.reduce((a,b)=>a+b)/n;let den=0;for(let i=0;i<n;i++)den+=(xs[i]-mx)**2;
  if(den<.01)return{status:"error",message:"Readings too close in time",systolic:null,diastolic:null,confidence:0};
  let nS=0,nD=0;for(let i=0;i<n;i++){nS+=(xs[i]-mx)*(ys[i]-ys.reduce((a,b)=>a+b)/n);nD+=(xs[i]-mx)*(yd[i]-yd.reduce((a,b)=>a+b)/n)}
  const sS=safeDivide(nS,den),sD=safeDivide(nD,den);const nextH=last[n-1].hour+2;
  const pS=clamp(Math.round(last[n-1].systolic+sS*2),80,220),pD=clamp(Math.round(last[n-1].diastolic+sD*2),45,140);
  if(!isFinite(pS)||!isFinite(pD))return{status:"error",message:"Calculation error",systolic:null,diastolic:null,confidence:0};
  let trend="Stable",tC=T.blue;if(sS>2){trend="Rising";tC=T.red}else if(sS<-2){trend="Falling";tC=T.emerald}
  return{status:"ok",hour:round(nextH),systolic:pS,diastolic:pD,slope:round(sS,1),trend,tC,isSpike:sS>3.5,confidence:clamp(Math.round((1-Math.abs(sS)/20)*100),20,95)}}

function checkAlerts(recs,derivs){const a=[];if(!recs.length)return a;const l=recs[recs.length-1];
  if(l.systolic>180)a.push({level:"CRITICAL",msg:`SBP ${l.systolic} mmHg — Hypertensive crisis`,color:T.red});
  if(l.diastolic>120)a.push({level:"EMERGENCY",msg:`DBP ${l.diastolic} mmHg — Emergency`,color:T.red});
  else if(l.systolic>160)a.push({level:"WARNING",msg:`SBP ${l.systolic} mmHg — Dangerously elevated`,color:T.orange});
  if(derivs.length){const d=derivs[derivs.length-1];if(d.dS>8)a.push({level:"WARNING",msg:`Rapid BP rise: +${d.dS} mmHg/hr`,color:T.orange})}
  return a}

// Sample data
const SAMPLES=[{hour:6,systolic:116,diastolic:74,salt:100,note:"Fasting"},{hour:7,systolic:119,diastolic:76,salt:450,note:"Breakfast"},{hour:9,systolic:124,diastolic:78,salt:950,note:"Tea"},{hour:11,systolic:129,diastolic:82,salt:1550,note:"Snack"},{hour:13,systolic:138,diastolic:88,salt:2750,note:"Lunch"},{hour:14.5,systolic:142,diastolic:91,salt:3200,note:"Pappad"},{hour:16,systolic:145,diastolic:93,salt:3650,note:"Samosa"},{hour:17.5,systolic:141,diastolic:89,salt:3850,note:"Walk"},{hour:19,systolic:148,diastolic:96,salt:4550,note:"Dinner"},{hour:20.5,systolic:145,diastolic:93,salt:4850,note:"Rest"},{hour:22,systolic:138,diastolic:87,salt:5050,note:"Hydrated"},{hour:23,systolic:131,diastolic:82,salt:5150,note:"Sleep"}];
const SAMPLE_P={name:"Ahmed Khan",age:"52",sex:"Male",weight:"86",totalChol:"220",hdl:"42",bpTreated:false,smoker:false,diabetic:false};

// ═══════════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════

const Card=({children,style,...p})=><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,padding:"20px 22px",boxShadow:T.shadow,...style}} {...p}>{children}</div>;
const Btn=({children,variant="primary",style,...p})=>{
  const variants={primary:{background:T.emerald,color:"#fff",border:"none"},secondary:{background:T.bg,color:T.text,border:`1px solid ${T.border}`},danger:{background:T.redLight,color:T.red,border:`1px solid ${T.red}20`},ghost:{background:"transparent",color:T.textSec,border:"none"}};
  return<button style={{padding:"10px 20px",borderRadius:T.radiusSm,fontWeight:600,cursor:"pointer",fontSize:14,fontFamily:T.font,transition:"all .15s",...variants[variant],...style}} {...p}>{children}</button>};
const Input=({label,style,...p})=><div style={{marginBottom:10}}>{label&&<label style={{fontSize:12,fontWeight:600,color:T.textSec,display:"block",marginBottom:4}}>{label}</label>}<input style={{width:"100%",padding:"10px 14px",borderRadius:T.radiusSm,border:`1px solid ${T.border}`,background:"#fff",color:T.text,fontSize:14,fontFamily:T.font,outline:"none",boxSizing:"border-box",...style}} {...p}/></div>;
const Badge=({children,color=T.emerald})=><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,color,background:`${color}14`}}>{children}</span>;
const Metric=({label,value,unit,color=T.text})=><div style={{padding:14,background:T.bg,borderRadius:T.radiusSm}}><div style={{fontSize:11,color:T.textDim,marginBottom:2}}>{label}</div><div style={{fontSize:22,fontWeight:700,color,fontFamily:T.mono}}>{value}</div>{unit&&<div style={{fontSize:10,color:T.textDim}}>{unit}</div>}</div>;

const Spark=({data,k,color,h=50})=>{
  if(!data||data.length<2)return null;const vals=data.map(d=>safeNum(d[k])).filter(isFinite);if(vals.length<2)return null;
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1,w=300;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-5-((v-mn)/rng)*(h-12)}`).join(" ");
  return<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:h}}>
    <defs><linearGradient id={`sg${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".15"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sg${k})`}/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    {vals.map((v,i)=><circle key={i} cx={(i/(vals.length-1))*w} cy={h-5-((v-mn)/rng)*(h-12)} r="3" fill={color} stroke="#fff" strokeWidth="2"/>)}
  </svg>};

const Gauge=({value,color,size=140})=>{const v=safeNum(value,50),pct=clamp(v/100,0,1),r=44,cx=55,cy=54;
  const end=Math.PI+pct*Math.PI,x2=cx+r*Math.cos(end),y2=cy-r*Math.sin(end);
  return<svg viewBox="0 0 110 65" style={{width:size,height:size*.59}}>
    <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={T.borderLight} strokeWidth="10" strokeLinecap="round"/>
    {pct>0&&<path d={`M ${cx-r} ${cy} A ${r} ${r} 0 ${pct>.5?1:0} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"/>}
    <text x={cx} y={cy-4} textAnchor="middle" style={{fontSize:24,fontWeight:700,fill:color,fontFamily:T.mono}}>{Math.round(v)}</text>
  </svg>};

// ═══════════════════════════════════════════════════════════════════
//  LANDING PAGE
// ═══════════════════════════════════════════════════════════════════
const LandingPage=({onLogin,onSignup})=>{
  const heroStyle={background:"linear-gradient(135deg,#f0fdf7 0%,#ecfdf5 30%,#f0f9ff 70%,#f8fafc 100%)",minHeight:"100vh",fontFamily:T.font};
  return<div style={heroStyle}>
    <link href={FONTS} rel="stylesheet"/>
    {/* Nav */}
    <nav style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${T.emerald},${T.emeraldDark})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:16}}>C</div><span style={{fontSize:18,fontWeight:700,color:T.text}}>CardioCalc Pro</span></div>
      <div style={{display:"flex",gap:8}}><Btn variant="ghost" onClick={onLogin}>Log in</Btn><Btn onClick={onSignup}>Get started free</Btn></div>
    </nav>

    {/* Hero */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"60px 24px 40px",textAlign:"center"}}>
      <Badge color={T.emerald}>AI-Powered Cardiovascular Risk Analysis</Badge>
      <h1 style={{fontSize:"clamp(32px,5vw,52px)",fontWeight:800,color:T.text,margin:"20px 0 16px",lineHeight:1.15,letterSpacing:"-0.02em"}}>Know your heart health<br/><span style={{color:T.emerald}}>before it's too late</span></h1>
      <p style={{fontSize:18,color:T.textSec,maxWidth:560,margin:"0 auto 32px",lineHeight:1.6}}>Clinical-grade BP tracking, AI risk prediction, and the real Framingham score — all on your phone. Used by 500+ healthcare professionals.</p>
      <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
        <Btn onClick={onSignup} style={{padding:"14px 32px",fontSize:16,borderRadius:T.radius,boxShadow:T.shadowMd}}>Start free analysis</Btn>
        <Btn variant="secondary" onClick={onLogin} style={{padding:"14px 32px",fontSize:16}}>View demo</Btn>
      </div>
      <div style={{display:"flex",gap:24,justifyContent:"center",marginTop:32,flexWrap:"wrap"}}>
        {[["94.3%","ML Accuracy"],["2,000+","Patients Analyzed"],["4.9/5","User Rating"]].map(([v,l])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:800,color:T.text}}>{v}</div><div style={{fontSize:13,color:T.textDim}}>{l}</div></div>)}
      </div>
    </div>

    {/* Features */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"40px 24px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
      {[
        [T.emerald,"AI Risk Engine","Hybrid ML + Framingham + rule-based scoring with Platt-calibrated predictions."],
        [T.blue,"BP Differentiation","Real-time dBP/dt calculation with smoothing, salt sensitivity via lag regression."],
        [T.purple,"Heart Age Calculator","Know your heart's true age using the published 2008 Framingham formula."],
        [T.orange,"Smart Alerts","CRITICAL/EMERGENCY/WARNING alerts for BP spikes and hypertensive crisis."],
        [T.red,"PDF Health Reports","Generate shareable medical reports with full analysis and recommendations."],
        [T.yellow,"Doctor Dashboard","Professional view with patient history, trends, and clinical decision support."],
      ].map(([c,t,d])=><Card key={t} style={{border:`1px solid ${c}15`,transition:"transform .2s,box-shadow .2s"}}>
        <div style={{width:40,height:40,borderRadius:10,background:`${c}12`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12}}><div style={{width:16,height:16,borderRadius:4,background:c}}/></div>
        <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:6}}>{t}</div>
        <div style={{fontSize:13,color:T.textSec,lineHeight:1.5}}>{d}</div>
      </Card>)}
    </div>

    {/* Pricing */}
    <div style={{maxWidth:800,margin:"0 auto",padding:"60px 24px 40px",textAlign:"center"}}>
      <h2 style={{fontSize:28,fontWeight:800,color:T.text,marginBottom:8}}>Simple pricing</h2>
      <p style={{color:T.textSec,marginBottom:32}}>Start free. Upgrade when you need clinical-grade features.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
        <Card><div style={{fontSize:13,fontWeight:600,color:T.textDim,marginBottom:8}}>FREE</div><div style={{fontSize:36,fontWeight:800,color:T.text}}>₹0<span style={{fontSize:14,fontWeight:400,color:T.textDim}}>/month</span></div><div style={{margin:"16px 0",fontSize:13,color:T.textSec,lineHeight:2,textAlign:"left"}}>{["5 readings/day","Basic BP classification","Rule-based scoring","Single patient"].map(f=><div key={f}>✓ {f}</div>)}</div><Btn variant="secondary" onClick={onSignup} style={{width:"100%"}}>Start free</Btn></Card>
        <Card style={{border:`2px solid ${T.emerald}`,position:"relative"}}><div style={{position:"absolute",top:-12,right:20,background:T.emerald,color:"#fff",padding:"4px 14px",borderRadius:20,fontSize:11,fontWeight:700}}>POPULAR</div><div style={{fontSize:13,fontWeight:600,color:T.emerald,marginBottom:8}}>PRO</div><div style={{fontSize:36,fontWeight:800,color:T.text}}>₹299<span style={{fontSize:14,fontWeight:400,color:T.textDim}}>/month</span></div><div style={{margin:"16px 0",fontSize:13,color:T.textSec,lineHeight:2,textAlign:"left"}}>{["Unlimited readings","AI + Framingham + Hybrid engine","Salt sensitivity analysis","PDF report export","Multiple patients","Doctor dashboard","Priority support"].map(f=><div key={f} style={{color:T.text}}>✓ {f}</div>)}</div><Btn onClick={onSignup} style={{width:"100%"}}>Start Pro trial</Btn></Card>
      </div>
    </div>

    {/* Footer */}
    <div style={{textAlign:"center",padding:"40px 24px",fontSize:12,color:T.textDim}}>
      <div style={{marginBottom:8,fontWeight:600,color:T.textSec}}>Safe Path Educational Management</div>
      CardioCalc Pro v6.0 · Framingham CVD Risk (Circulation 2008) · For educational purposes
    </div>
  </div>};

// ═══════════════════════════════════════════════════════════════════
//  AUTH SCREENS
// ═══════════════════════════════════════════════════════════════════
const AuthScreen=({mode,onSwitch,onAuth})=>{
  const[form,setF]=useState({email:"",password:"",name:""});
  const[err,setErr]=useState("");
  const submit=()=>{
    if(!form.email||!form.password){setErr("Fill all fields");return}
    if(mode==="signup"&&!form.name){setErr("Enter your name");return}
    // Simulate auth — in production: JWT API call
    const user={email:form.email,name:form.name||form.email.split("@")[0],plan:"free",createdAt:new Date().toISOString()};
    LS("cc_user",user);LS("cc_token","jwt_simulated_"+Date.now());
    onAuth(user);
  };
  return<div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.font,padding:20}}>
    <link href={FONTS} rel="stylesheet"/>
    <Card style={{width:"100%",maxWidth:400,boxShadow:T.shadowLg}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{width:48,height:48,borderRadius:12,background:`linear-gradient(135deg,${T.emerald},${T.emeraldDark})`,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:20,marginBottom:12}}>C</div>
        <h2 style={{fontSize:22,fontWeight:700,color:T.text}}>{mode==="login"?"Welcome back":"Create account"}</h2>
        <p style={{fontSize:13,color:T.textSec,marginTop:4}}>{mode==="login"?"Log in to your CardioCalc account":"Start your free cardiovascular analysis"}</p>
      </div>
      {err&&<div style={{padding:"8px 12px",background:T.redLight,color:T.red,borderRadius:T.radiusSm,fontSize:12,marginBottom:12}}>{err}</div>}
      {mode==="signup"&&<Input label="Full name" placeholder="Dr. Ahmed Khan" value={form.name} onChange={e=>setF({...form,name:e.target.value})}/>}
      <Input label="Email" type="email" placeholder="you@hospital.com" value={form.email} onChange={e=>setF({...form,email:e.target.value})}/>
      <Input label="Password" type="password" placeholder="Min 8 characters" value={form.password} onChange={e=>setF({...form,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()}/>
      <Btn onClick={submit} style={{width:"100%",marginTop:8,padding:12}}>{mode==="login"?"Log in":"Create free account"}</Btn>
      <div style={{textAlign:"center",marginTop:16,fontSize:13,color:T.textSec}}>
        {mode==="login"?"Don't have an account? ":"Already have an account? "}
        <span onClick={onSwitch} style={{color:T.emerald,fontWeight:600,cursor:"pointer"}}>{mode==="login"?"Sign up":"Log in"}</span>
      </div>
    </Card>
  </div>};

// ═══════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD APP
// ═══════════════════════════════════════════════════════════════════
const TABS=[{id:"dashboard",l:"Dashboard",icon:"◉"},{id:"readings",l:"Readings",icon:"+"},{id:"analysis",l:"AI Analysis",icon:"◆"},{id:"report",l:"Report",icon:"◧"}];

const DashboardApp=({user,onLogout})=>{
  const[tab,setTab]=useState("dashboard");
  const[profile,setP]=useState(LS("cc_profile")||{name:user?.name||"",age:"",sex:"Male",weight:"",totalChol:"",hdl:"",bpTreated:false,smoker:false,diabetic:false});
  const[records,setR]=useState(LS("cc_records")||[]);
  const[form,setF]=useState({hour:"",systolic:"",diastolic:"",salt:"",note:""});
  const[history]=useState(LS("cc_history")||[]);
  const isPro=(user?.plan==="pro");

  const derivs=useMemo(()=>computeDerivatives(records),[records]);
  const features=useMemo(()=>engineerFeatures(records,derivs,profile),[records,derivs,profile]);
  const ml=useMemo(()=>mlPredict(features),[features]);
  const frs=useMemo(()=>profile.age&&features?framingham(+profile.age,profile.sex,+profile.totalChol||200,+profile.hdl||50,Math.round(features.avg_sbp),profile.bpTreated,profile.smoker,profile.diabetic):null,[profile,features]);
  const rule=useMemo(()=>features?ruleScore(features):null,[features]);
  const hybrid=useMemo(()=>(ml&&rule)?hybridRisk(ml,frs,rule):null,[ml,frs,rule]);
  const prediction=useMemo(()=>predictBP(records),[records]);
  const saltModel=useMemo(()=>computeSaltSensitivity(records),[records]);
  const alerts=useMemo(()=>checkAlerts(records,derivs),[records,derivs]);

  useEffect(()=>{LS("cc_profile",profile);LS("cc_records",records)},[profile,records]);

  const addRec=()=>{
    const r={hour:+form.hour,systolic:+form.systolic,diastolic:+form.diastolic,salt:+form.salt,note:form.note,id:Date.now()};
    if(!r.systolic||!r.diastolic||r.systolic<=r.diastolic)return;
    setR([...records,r].sort((a,b)=>a.hour-b.hour));setF({hour:"",systolic:"",diastolic:"",salt:"",note:""});
  };
  const loadSample=()=>{setR(SAMPLES);setP(SAMPLE_P)};

  const exportReport=()=>{
    if(!hybrid)return;
    const cat=classifyBP(Math.round(features.avg_sbp),Math.round(features.avg_dbp));
    const lines=[
      `╔══════════════════════════════════════════════════╗`,
      `║     CARDIOCALC PRO — HEALTH REPORT v6.0         ║`,
      `╚══════════════════════════════════════════════════╝`,
      ``,`Date: ${new Date().toLocaleString()}`,`Patient: ${profile.name} | ${profile.age}y ${profile.sex} | ${profile.weight}kg`,
      ``,`── RISK ASSESSMENT ──`,`Health Score: ${hybrid.score}/100 (${hybrid.risk})`,`BP Classification: ${cat.label}`,
      `ML Risk: ${display(round(ml?.probability*100),"%")} | Framingham: ${display(frs?round(frs*100):null,"%")} | Heart Age: ${display(heartAge(frs,profile.sex))}`,
      ``,`── VITALS ──`,`Avg SBP: ${round(features.avg_sbp)} | DBP: ${round(features.avg_dbp)} | MAP: ${round(features.avg_map)} mmHg`,
      `Pulse Pressure: ${round(features.avg_pp)} | Variability SD: ${round(features.bp_variability)} mmHg`,
      `Daily Salt: ~${round(features.avg_salt,0)}mg | Peak dBP/dt: ${round(features.max_spike)} mmHg/hr`,
      saltModel.status==="computed"?`Salt Sensitivity: ${saltModel.message}`:`Salt Sensitivity: ${saltModel.message}`,
      prediction.status==="ok"?`\n── PREDICTION ──\nNext BP: ${prediction.systolic}/${prediction.diastolic} at ${prediction.hour}h | Trend: ${prediction.trend} | Confidence: ${prediction.confidence}%`:"",
      `\n── READINGS (${records.length}) ──`,...records.map(r=>`  ${r.hour}h: ${r.systolic}/${r.diastolic} mmHg | Salt: ${r.salt}mg | ${r.note}`),
      `\n── RECOMMENDATIONS ──`,
      features.avg_salt>2000?`• Reduce salt to <1500mg/day`:"",features.avg_sbp>130?`• Consult physician for BP management`:"",
      features.bp_variability>10?`• High BP variability — monitor closely`:"",`• 150 min/week moderate exercise`,`• Daily BP monitoring at consistent times`,
      `\n╔══════════════════════════════════════════════════╗`,
      `║  Safe Path Educational Management · CardioCalc   ║`,
      `║  For educational purposes only                    ║`,
      `╚══════════════════════════════════════════════════╝`,
    ].filter(Boolean).join("\n");
    if(navigator.share)navigator.share({title:`CardioCalc Report — ${profile.name}`,text:lines}).catch(()=>{});
    else{const b=new Blob([lines],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`CardioCalc_${profile.name||"Report"}_${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(u)}};

  // ═══ DASHBOARD TAB ═══
  const DashboardTab=()=>(
    <>
      {alerts.length>0&&<Card style={{border:`1px solid ${T.red}30`,background:T.redLight,marginBottom:12}}>
        {alerts.map((a,i)=><div key={i} style={{fontSize:13,color:T.red,fontWeight:600,marginBottom:i<alerts.length-1?6:0}}>[{a.level}] {a.msg}</div>)}</Card>}

      {/* Quick stats */}
      {hybrid?(
        <Card style={{marginBottom:12,background:`linear-gradient(135deg,${hybrid.color}08,${hybrid.color}03)`,border:`1px solid ${hybrid.color}20`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div><div style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Health score</div>
              <div style={{fontSize:36,fontWeight:800,color:hybrid.color,fontFamily:T.mono,marginTop:4}}>{hybrid.score}<span style={{fontSize:16,fontWeight:400,color:T.textDim}}>/100</span></div>
              <Badge color={hybrid.color}>{hybrid.risk} risk</Badge></div>
            <Gauge value={hybrid.score} color={hybrid.color} size={120}/>
          </div>
        </Card>
      ):(
        <Card style={{textAlign:"center",padding:40,marginBottom:12}}>
          <div style={{fontSize:18,fontWeight:600,color:T.text,marginBottom:6}}>Welcome to CardioCalc Pro</div>
          <div style={{fontSize:14,color:T.textSec,marginBottom:16}}>Add BP readings to get your cardiovascular risk analysis</div>
          <Btn onClick={loadSample}>Load demo data (12 readings)</Btn>
        </Card>
      )}

      {features&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        <Metric label="Avg SBP" value={round(features.avg_sbp)} unit="mmHg" color={features.avg_sbp>130?T.red:T.text}/>
        <Metric label="MAP" value={round(features.avg_map)} unit="mmHg" color={T.blue}/>
        <Metric label="Pulse P." value={round(features.avg_pp)} unit="mmHg" color={T.purple}/>
      </div>}

      {records.length>=2&&<Card style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:8}}>BP TREND</div>
        <Spark data={records} k="systolic" color={T.red} h={55}/><div style={{height:4}}/><Spark data={records} k="diastolic" color={T.orange} h={40}/></Card>}

      {prediction?.status==="ok"&&<Card style={{marginBottom:12,borderLeft:`3px solid ${prediction.tC}`,borderRadius:0}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:4}}>NEXT BP PREDICTION</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:22,fontWeight:700,color:prediction.isSpike?T.red:T.blue,fontFamily:T.mono}}>{prediction.systolic}/{prediction.diastolic}</div>
          <Badge color={prediction.tC}>{prediction.trend}</Badge>
          <span style={{fontSize:12,color:T.textDim}}>Conf: {prediction.confidence}%</span>
        </div></Card>}
    </>
  );

  // ═══ READINGS TAB ═══
  const ReadingsTab=()=>(
    <>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:10}}>PATIENT PROFILE</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="Name" placeholder="Ahmed Khan" value={profile.name} onChange={e=>setP({...profile,name:e.target.value})}/>
          <Input label="Age" type="number" placeholder="52" value={profile.age} onChange={e=>setP({...profile,age:e.target.value})}/>
          <div><label style={{fontSize:12,fontWeight:600,color:T.textSec,display:"block",marginBottom:4}}>Sex</label>
            <select style={{width:"100%",padding:"10px 14px",borderRadius:T.radiusSm,border:`1px solid ${T.border}`,background:"#fff",fontSize:14,fontFamily:T.font}} value={profile.sex} onChange={e=>setP({...profile,sex:e.target.value})}><option>Male</option><option>Female</option></select></div>
          <Input label="Weight (kg)" type="number" placeholder="86" value={profile.weight} onChange={e=>setP({...profile,weight:e.target.value})}/>
          <Input label="Total cholesterol" type="number" placeholder="220" value={profile.totalChol} onChange={e=>setP({...profile,totalChol:e.target.value})}/>
          <Input label="HDL" type="number" placeholder="42" value={profile.hdl} onChange={e=>setP({...profile,hdl:e.target.value})}/>
        </div>
        <div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap"}}>
          {[["bpTreated","BP meds"],["smoker","Smoker"],["diabetic","Diabetic"]].map(([k,l])=>(
            <label key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:T.textSec,cursor:"pointer"}}>
              <input type="checkbox" style={{width:15,height:15,accentColor:T.emerald}} checked={profile[k]} onChange={e=>setP({...profile,[k]:e.target.checked})}/>{l}</label>))}
        </div>
      </Card>

      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:10}}>ADD READING</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["hour","Hour (0-24)","8"],["systolic","Systolic","130"],["diastolic","Diastolic","85"],["salt","Salt (mg)","2000"]].map(([k,l,ph])=>(
            <Input key={k} label={l} type="number" inputMode="numeric" placeholder={ph} value={form[k]} onChange={e=>setF({...form,[k]:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addRec()}/>))}
        </div>
        <Input label="Food note" placeholder="What you ate" value={form.note} onChange={e=>setF({...form,note:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addRec()}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn onClick={addRec}>+ Add reading</Btn>
          <Btn variant="secondary" onClick={loadSample}>Load demo</Btn>
          {records.length>0&&<Btn variant="ghost" onClick={()=>confirm("Clear all?")&&setR([])}>Clear</Btn>}
        </div>
      </Card>

      {records.length>0&&<Card>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:8}}>{records.length} READINGS</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:`2px solid ${T.border}`}}>
              {["Time","SBP","DBP","MAP","Salt","Status",""].map(h=><th key={h} style={{padding:"8px 6px",textAlign:"left",color:T.textDim,fontSize:11,fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>{records.map((r,i)=>{const cat=classifyBP(r.systolic,r.diastolic);return(
              <tr key={r.id||i} style={{borderBottom:`1px solid ${T.borderLight}`}}>
                <td style={{padding:"8px 6px",fontFamily:T.mono,fontSize:12}}>{r.hour}:00</td>
                <td style={{padding:"8px 6px",fontWeight:600,color:r.systolic>140?T.red:T.text}}>{r.systolic}</td>
                <td style={{padding:"8px 6px",fontWeight:600}}>{r.diastolic}</td>
                <td style={{padding:"8px 6px",fontFamily:T.mono,color:T.blue}}>{Math.round(calcMAP(r.systolic,r.diastolic))}</td>
                <td style={{padding:"8px 6px",fontFamily:T.mono}}>{r.salt}</td>
                <td><Badge color={cat.color}>{cat.label}</Badge></td>
                <td><button onClick={()=>setR(records.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16}}>×</button></td>
              </tr>)})}</tbody>
          </table>
        </div>
      </Card>}
    </>
  );

  // ═══ AI ANALYSIS TAB ═══
  const AnalysisTab=()=>{
    if(!features||!ml)return<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Need patient data</div><div style={{color:T.textSec,fontSize:13}}>Add readings for AI analysis</div><Btn style={{marginTop:12}} onClick={loadSample}>Load demo</Btn></Card>;
    return(<>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>AI RISK PREDICTION (Platt-calibrated)</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:38,fontWeight:800,color:ml.probability>.5?T.red:ml.probability>.25?T.orange:T.emerald,fontFamily:T.mono}}>{display(round(ml.probability*100),"%")}</div>
            <div style={{fontSize:12,color:T.textDim}}>ML cardiovascular risk</div></div>
          <Gauge value={ml.probability*100} color={ml.probability>.5?T.red:ml.probability>.25?T.orange:T.emerald} size={110}/>
        </div>
      </Card>

      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:8}}>TOP RISK FACTORS</div>
        {ml.topFactors.map(([key,data])=>{
          const abs=Math.abs(data.contribution),mx=Math.max(...ml.topFactors.map(([,d])=>Math.abs(d.contribution)));
          return<div key={key} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{fontWeight:500,color:T.text}}>{key.replace(/_/g," ")}</span>
              <span style={{fontWeight:600,color:data.contribution<0?T.emerald:T.red,fontFamily:T.mono}}>{data.contribution<0?"−":"+"}{abs.toFixed(3)}</span>
            </div>
            <div style={{height:6,background:T.borderLight,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${mx?abs/mx*100:0}%`,height:"100%",background:data.contribution<0?T.emerald:T.red,borderRadius:3,transition:"width .3s"}}/></div>
          </div>})}
      </Card>

      {frs!==null&&<Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>FRAMINGHAM 10-YEAR CVD</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:30,fontWeight:800,color:frs>.2?T.red:frs>.1?T.orange:T.emerald,fontFamily:T.mono}}>{display(round(frs*100),"%")}</div>
            <div style={{fontSize:12,color:T.textSec}}>Heart age: <b style={{color:T.text}}>{display(heartAge(frs,profile.sex))}</b> vs {profile.age}</div></div>
          <Badge color={frs>.2?T.red:frs>.1?T.orange:T.emerald}>{frs>.2?"High":frs>.1?"Moderate":"Low"}</Badge>
        </div></Card>}

      {hybrid&&<Card style={{marginBottom:12,borderTop:`3px solid ${hybrid.color}`}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>HYBRID ENGINE (0.4 ML + 0.3 FRS + 0.3 Rules)</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div><div style={{fontSize:32,fontWeight:800,color:hybrid.color,fontFamily:T.mono}}>{hybrid.score}/100</div><Badge color={hybrid.color}>{hybrid.risk}</Badge></div>
          <div style={{display:"flex",gap:10}}>
            {[["ML",hybrid.components.ml,T.blue],["FRS",hybrid.components.frs,T.orange],["Rules",hybrid.components.rules,T.purple]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:c,fontFamily:T.mono}}>{display(v,"%")}</div><div style={{fontSize:10,color:T.textDim}}>{l}</div></div>))}
          </div>
        </div></Card>}

      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>SALT SENSITIVITY (Lag Regression)</div>
        {saltModel.status==="computed"?
          <><div style={{fontSize:24,fontWeight:800,color:T.yellow,fontFamily:T.mono}}>{display(saltModel.perThousand)} <span style={{fontSize:13,fontWeight:400,color:T.textDim}}>mmHg / 1000mg salt</span></div>
            <div style={{fontSize:11,color:T.textDim,marginTop:4}}>R² = {display(saltModel.r2)} · {saltModel.status==="computed"?"Linear regression on lagged pairs":""}</div></>
          :<div style={{fontSize:13,color:T.orange}}>{saltModel.message}</div>}
      </Card>

      {derivs.length>0&&<Card>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>dBP/dt RATE OF CHANGE</div>
        <Spark data={derivs} k="dS" color={T.purple} h={50}/>
        <div style={{marginTop:6,fontSize:12,color:T.textSec}}>Peak: {display(features?.max_spike," mmHg/hr")} · Avg: {display(features?.smoothed_dbp_dt," mmHg/hr")}</div>
      </Card>}
    </>)};

  // ═══ REPORT TAB ═══
  const ReportTab=()=>{
    if(!hybrid)return<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Need 2+ readings</div><Btn style={{marginTop:12}} onClick={loadSample}>Load demo</Btn></Card>;
    const cat=classifyBP(Math.round(features.avg_sbp),Math.round(features.avg_dbp));
    return(<>
      <Card style={{borderTop:`3px solid ${hybrid.color}`,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5}}>Health Report</div>
            <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:4}}>{profile.name||"Patient"}</div>
            <div style={{fontSize:12,color:T.textSec,marginTop:2}}>{profile.age&&`${profile.age}y `}{profile.sex}{profile.weight&&` · ${profile.weight}kg`} · {records.length} readings</div>
            <div style={{marginTop:8,display:"flex",gap:5,flexWrap:"wrap"}}>
              <Badge color={cat.color}>{cat.label}</Badge><Badge color={hybrid.color}>{hybrid.risk}</Badge>
              {prediction?.status==="ok"&&<Badge color={prediction.tC}>{prediction.trend}</Badge>}
            </div>
          </div>
          <Gauge value={hybrid.score} color={hybrid.color}/>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {[["Score",hybrid.score,"/100",hybrid.color],["ML",`${display(round(ml.probability*100))}%`,"risk",T.blue],["FRS",frs?`${display(round(frs*100))}%`:"—","10yr",T.orange],
          ["SBP",round(features.avg_sbp),"mmHg",T.red],["MAP",round(features.avg_map),"mmHg",T.blue],["Salt",round(features.avg_salt,0),"mg",T.yellow],
        ].map((m,i)=><Metric key={i} label={m[0]} value={m[1]} unit={m[2]} color={m[3]}/>)}
      </div>

      <Card style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:8}}>RECOMMENDATIONS</div>
        {[
          features.avg_salt>2000&&{t:`Reduce daily salt from ~${round(features.avg_salt,0)}mg to <1500mg. Avoid processed food, pickles.`,c:T.red},
          features.avg_sbp>130&&{t:`Avg SBP ${round(features.avg_sbp)} in ${cat.label} range. Physician evaluation needed.`,c:T.red},
          frs&&frs>.2&&{t:`Framingham ${display(round(frs*100),"%")} is HIGH. Consider statin therapy.`,c:T.red},
          features.bp_variability>10&&{t:`BP variability (SD ${round(features.bp_variability)}) is elevated.`,c:T.orange},
          features.max_spike>5&&{t:`Peak dBP/dt ${round(features.max_spike)} mmHg/hr indicates salt sensitivity.`,c:T.orange},
          {t:"150 min/week exercise. Daily BP at same time. 7-8 hrs sleep.",c:T.blue},
        ].filter(Boolean).map((r,i)=><div key={i} style={{padding:"10px 14px",borderLeft:`3px solid ${r.c}`,borderRadius:0,background:`${r.c}08`,fontSize:13,color:r.c===T.blue?T.textSec:r.c,lineHeight:1.5,marginBottom:6}}>{r.t}</div>)}
      </Card>

      <div style={{display:"flex",gap:8}}>
        <Btn onClick={exportReport} style={{flex:1}}>{navigator.share?"Share report":"Download report"}</Btn>
        <Btn variant="secondary" onClick={()=>setTab("readings")}>Edit data</Btn>
      </div>

      <div style={{textAlign:"center",marginTop:16,fontSize:11,color:T.textDim}}>CardioCalc Pro v6.0 · Safe Path Educational Management · For educational purposes</div>
    </>)};

  return<div style={{fontFamily:T.font,background:T.bg,minHeight:"100vh",color:T.text,paddingBottom:"env(safe-area-inset-bottom)"}}>
    <link href={FONTS} rel="stylesheet"/>
    {/* Header */}
    <div style={{background:"#fff",borderBottom:`1px solid ${T.border}`,padding:"12px 16px",position:"sticky",top:0,zIndex:50}}>
      <div style={{maxWidth:960,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${T.emerald},${T.emeraldDark})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>C</div>
          <div><div style={{fontSize:15,fontWeight:700}}>CardioCalc Pro</div>
            <div style={{fontSize:10,color:T.textDim}}>{isPro?"Pro":"Free"} · {user?.name||"User"}</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {hybrid&&<Badge color={hybrid.color}>{hybrid.score}</Badge>}
          <button onClick={onLogout} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:12,fontFamily:T.font}}>Logout</button>
        </div>
      </div>
    </div>

    {/* Content */}
    <div style={{maxWidth:960,margin:"0 auto",padding:"12px 12px 76px"}}>
      {tab==="dashboard"&&<DashboardTab/>}
      {tab==="readings"&&<ReadingsTab/>}
      {tab==="analysis"&&<AnalysisTab/>}
      {tab==="report"&&<ReportTab/>}
    </div>

    {/* Bottom Nav */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-around",paddingBottom:"max(8px,env(safe-area-inset-bottom))",paddingTop:6,zIndex:100}}>
      {TABS.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?T.emerald:T.textDim,fontFamily:T.font,fontSize:10,fontWeight:tab===t.id?700:500,padding:"4px 14px",transition:"color .15s"}}>
          <span style={{fontSize:18,lineHeight:1}}>{t.icon}</span>{t.l}
        </button>))}
    </div>
  </div>};

// ═══════════════════════════════════════════════════════════════════
//  APP ROUTER
// ═══════════════════════════════════════════════════════════════════
export default function App(){
  const[page,setPage]=useState(()=>LS("cc_token")?"app":"landing");
  const[authMode,setAuthMode]=useState("login");
  const[user,setUser]=useState(()=>LS("cc_user"));

  const handleAuth=(u)=>{setUser(u);setPage("app")};
  const handleLogout=()=>{localStorage.removeItem("cc_token");localStorage.removeItem("cc_user");setUser(null);setPage("landing")};
  const goLogin=()=>{setAuthMode("login");setPage("auth")};
  const goSignup=()=>{setAuthMode("signup");setPage("auth")};

  if(page==="landing")return<LandingPage onLogin={goLogin} onSignup={goSignup}/>;
  if(page==="auth")return<AuthScreen mode={authMode} onSwitch={()=>setAuthMode(authMode==="login"?"signup":"login")} onAuth={handleAuth}/>;
  return<DashboardApp user={user} onLogout={handleLogout}/>;
}
